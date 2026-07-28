import asyncio
import uuid
from datetime import datetime

from sqlmodel import Session, select

from backend.crud.bookings import (
    build_order_request_body,
    create_booking_from_order,
    seat_designators_by_passenger,
)
from backend.crud.tickets import create_tickets_from_order
from backend.external_services.flight import DuffelAPIError, duffel_flight_service
from backend.external_services.payment import PesapalAPIError, pesapal_payment_service
from backend.models.payments import Payment, PaymentProvider, PaymentStatus
from backend.models.users import UserInDB
from backend.schemas.duffel_orders import Order, OrderCreate, OrderPayment
from backend.schemas.payments import CheckoutRequest
from backend.utils.email import SENDER_BOOKINGS, send_html_email_async
from backend.utils.email_templates import booking_confirmation_email_html
from backend.utils.log_manager import get_app_logger
from backend.utils.pricing import (
    extra_baggage_cost,
    marked_up_amount,
    seat_services_cost,
)

logger = get_app_logger(__name__)

# Pesapal's status_code: 0 INVALID, 1 COMPLETED, 2 FAILED, 3 REVERSED.
_PESAPAL_COMPLETED = 1
# 0 (INVALID) is deliberately NOT treated as terminal: a real sandbox check
# mid-payment returned status_code=0 with error.code "payment_details_not_found"
# and message "Pending Payment" - i.e. INVALID can mean "not resolved yet",
# not just "malformed/dead". Only 2/3 are genuinely final.
_PESAPAL_TERMINAL_FAILURE_CODES = {2, 3}

# Duffel's own docs (holding-orders-and-paying-later, holding-flights-and-
# paying-later, using-airline-credits) all give the same instruction after
# paying for an order: re-fetch it and confirm `documents` were actually
# issued, rather than trusting the order-creation response as final -
# implying ticketing can lag slightly behind order creation/payment. This
# bounds how long _complete_booking will wait for that to happen before
# giving up and proceeding with whatever documents (possibly none) Duffel
# has issued so far.
_TICKETING_CONFIRM_RETRIES = 3
_TICKETING_CONFIRM_DELAY_SECONDS = 2


def create_payment(
    session: Session,
    user_id: uuid.UUID,
    checkout: CheckoutRequest,
    amount: str,
    duffel_amount: str,
    currency: str,
    provider: PaymentProvider = PaymentProvider.PESAPAL,
) -> Payment:
    """Persist a checkout attempt before Duffel is ever contacted - see
    finalize_payment()/confirm_card_payment() for what happens once
    payment is confirmed via Pesapal or Duffel Payments respectively.

    `amount` (marked-up, charged to the customer) and `duffel_amount` (raw,
    what Duffel is actually paid) are deliberately separate - see the
    Payment model's docstrings on each field."""
    payment = Payment(
        user_id=user_id,
        order_request_snapshot=checkout.model_dump_json(),
        amount=amount,
        duffel_amount=duffel_amount,
        currency=currency,
        provider=provider,
        merchant_reference=str(uuid.uuid4()),
    )
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


def get_payment(session: Session, payment_id: uuid.UUID) -> Payment | None:
    return session.exec(select(Payment).where(Payment.id == payment_id)).first()


def get_payment_by_pesapal_tracking_id(
    session: Session, order_tracking_id: str
) -> Payment | None:
    """Used by Pesapal's IPN webhook, which only knows the payment via the
    tracking ID Pesapal itself generated - not anything client-suppliable."""
    return session.exec(
        select(Payment).where(Payment.pesapal_order_tracking_id == order_tracking_id)
    ).first()


def attach_pesapal_tracking_id(
    session: Session, payment: Payment, order_tracking_id: str
) -> Payment:
    payment.pesapal_order_tracking_id = order_tracking_id
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


def attach_duffel_payment_intent(
    session: Session, payment: Payment, payment_intent_id: str
) -> Payment:
    payment.duffel_payment_intent_id = payment_intent_id
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


async def reconfirm_price_and_create_payment(
    session: Session,
    user_id: uuid.UUID,
    request: CheckoutRequest,
    provider: PaymentProvider,
) -> Payment:
    """Shared by both checkout endpoints (routers/payments.py's checkout/
    checkout_card): re-confirms the offer's live price, validates
    passport requirements, folds in any paid seat's cost, applies flyt's
    markup, and persists a pending Payment. The one place this
    money-critical price/markup logic lives, so both payment providers
    can never drift apart on it.

    Raises DuffelAPIError (propagated to the router as a 502/matching
    status) or ValueError (propagated as a 400) - never HTTPException
    directly, consistent with every other crud function in this module.
    """
    offer_id = request.selected_offers[0]
    priced = await duffel_flight_service.confirm_price(offer_id)

    offer_data = priced["data"]
    duffel_amount = offer_data["total_amount"]
    currency = offer_data["total_currency"]

    # Some itineraries won't be accepted by the airline (and Duffel will
    # reject the order) without a passport on file for every passenger -
    # catching it here gives a clear error before we ever charge the
    # customer, rather than a failed booking after payment already landed.
    if offer_data.get("passenger_identity_documents_required"):
        missing = [
            p.given_name or p.id for p in request.passengers if not p.identity_documents
        ]
        if missing:
            raise ValueError(
                "This itinerary requires passport details for every "
                f"passenger. Missing for: {', '.join(missing)}"
            )

    # If any passenger picked a paid seat, its cost must be folded into
    # what Duffel is paid (and what the customer is charged) now - Duffel
    # rejects an order whose payments[].amount doesn't exactly match the
    # order's real total, services included (see _complete_booking).
    if any(p.seat_service_id for p in request.passengers):
        seat_map_response = await duffel_flight_service.view_seat_map(offer_id)
        seat_cost = seat_services_cost(
            seat_map_response.get("data", []), request.passengers
        )
        if seat_cost is not None:
            seat_amount, _seat_currency = seat_cost
            duffel_amount = f"{float(duffel_amount) + float(seat_amount):.2f}"

    # Same reasoning for extra baggage, priced from the available_services
    # already on offer_data - no second Duffel request needed here, unlike
    # seats (which live on the separate seat-map endpoint).
    if any(p.extra_baggage_service_ids for p in request.passengers):
        baggage_cost = extra_baggage_cost(
            offer_data.get("available_services", []), request.passengers
        )
        if baggage_cost is not None:
            baggage_amount, _baggage_currency = baggage_cost
            duffel_amount = f"{float(duffel_amount) + float(baggage_amount):.2f}"

    amount = marked_up_amount(duffel_amount)

    return create_payment(
        session,
        user_id,
        request,
        amount,
        duffel_amount,
        currency,
        provider=provider,
    )


async def _complete_booking(session: Session, payment: Payment) -> None:
    """Replays the snapshotted checkout to Duffel (paid from flyt's own
    balance) to actually create the booking, ticket records, and send the
    confirmation email. Shared by both payment providers - Pesapal
    (finalize_payment, below) and Duffel Payments (confirm_card_payment) -
    once each has independently confirmed the customer's money actually
    landed. Mutates `payment` in place; the caller commits.
    """
    try:
        checkout = CheckoutRequest.model_validate_json(payment.order_request_snapshot)
        order_request = OrderCreate(
            selected_offers=checkout.selected_offers,
            passengers=checkout.passengers,
            payments=[
                # Duffel must be paid the raw fare, never the marked-up
                # `payment.amount` the customer was actually charged - it
                # rejects a payment that doesn't exactly match the order's
                # real total.
                OrderPayment(
                    type="balance",
                    amount=payment.duffel_amount,
                    currency=payment.currency,
                )
            ],
            # Duffel echoes this back on every future GET of the order, so
            # it's a reconciliation hook back to our own Payment/Booking
            # rows that survives independent of - and is queryable straight
            # from Duffel's side without - our own DB (e.g. from Duffel's
            # dashboard/support when investigating a specific order).
            metadata={
                "payment_id": str(payment.id),
                "merchant_reference": payment.merchant_reference,
            },
        )
        request_body = build_order_request_body(order_request)
        duffel_response = await duffel_flight_service.create_flight_order(request_body)
        order = Order.model_validate(duffel_response["data"])

        # See _TICKETING_CONFIRM_RETRIES above: give Duffel a few chances to
        # finish issuing e-tickets before we settle for whatever `documents`
        # came back on the order-creation response.
        for attempt in range(_TICKETING_CONFIRM_RETRIES):
            if order.documents:
                break
            await asyncio.sleep(_TICKETING_CONFIRM_DELAY_SECONDS)
            try:
                refreshed = await duffel_flight_service.get_flight_order(order.id)
                order = Order.model_validate(refreshed["data"])
            except DuffelAPIError as e:
                # The order itself is already paid and confirmed - a failed
                # re-check is not a booking failure, just a missed chance to
                # pick up tickets that may have since been issued.
                logger.warning(
                    "Ticket-issuance re-check %d/%d failed for order %s: %s",
                    attempt + 1,
                    _TICKETING_CONFIRM_RETRIES,
                    order.id,
                    e,
                )
                break
        if not order.documents:
            logger.warning(
                "Order %s still has no issued documents after %d re-check(s) -"
                " booking will be recorded without ticket numbers for now",
                order.id,
                _TICKETING_CONFIRM_RETRIES,
            )

        booking = create_booking_from_order(
            session,
            payment.user_id,
            order,
            seat_designators_by_passenger(order_request),
            charged_amount=payment.amount,
            charged_currency=payment.currency,
        )
        create_tickets_from_order(session, booking, order)

        payment.booking_id = booking.id
        payment.status = PaymentStatus.COMPLETED

        try:
            user = session.get(UserInDB, payment.user_id)
            if user:
                await send_html_email_async(
                    f"You're booked! Reference {booking.booking_reference}",
                    [user.email],
                    booking_confirmation_email_html(booking),
                    from_address=SENDER_BOOKINGS,
                )
        except Exception:
            # The booking itself already succeeded - a failed
            # notification email must not undo that or be mistaken for a
            # booking failure.
            logger.exception(
                "Failed to send confirmation email for booking %s", booking.id
            )
    except DuffelAPIError as e:
        # The customer's money already landed with us at this point -
        # this is the "flag for manual refund" case, not an error to
        # silently swallow.
        logger.error(
            "Booking failed for payment %s after money already collected"
            " (needs manual follow-up): %s",
            payment.id,
            e,
        )
        payment.status = PaymentStatus.BOOKING_FAILED
        payment.failure_reason = str(e)


async def finalize_payment(session: Session, payment: Payment) -> Payment:
    """Checks Pesapal's authoritative transaction status and, on success,
    completes the booking (see _complete_booking).

    Idempotent: called from both the frontend's status-poll endpoint and
    Pesapal's IPN webhook, which may race each other. Once a payment has
    left `pending`, this is a no-op.
    """
    # Re-fetch with a row lock (a real `FOR UPDATE` on Postgres; a no-op on
    # the SQLite engine the unit tests use) so the poll endpoint and the IPN
    # webhook - which legitimately race - serialize on this row instead of
    # both reading `pending` and both replaying the order to Duffel.
    locked_payment = session.exec(
        select(Payment).where(Payment.id == payment.id).with_for_update()
    ).first()
    if locked_payment is None:
        return payment
    payment = locked_payment

    if payment.status != PaymentStatus.PENDING:
        return payment
    if not payment.pesapal_order_tracking_id:
        return payment

    try:
        status = await pesapal_payment_service.get_transaction_status(
            payment.pesapal_order_tracking_id
        )
    except PesapalAPIError as e:
        # Confirmed against a real sandbox transaction: GetTransactionStatus
        # can return an HTTP-level error (with error.code
        # "payment_details_not_found" / message "Pending Payment") for a
        # transaction that's still genuinely in progress, not just for
        # actual failures. Treating every such error as terminal would let
        # a transient/still-processing response tell a customer their
        # payment failed when it might still succeed - so this leaves the
        # payment `pending` for the next poll/IPN, same as an ambiguous
        # status_code below, rather than raising into the router's 502
        # (which would also stop the frontend's poll loop, since a fetch
        # error means query.state.data never gets a status to key off).
        logger.info(
            "Pesapal status check failed for payment %s, still pending: %s",
            payment.id,
            e,
        )
        return payment

    payment.pesapal_status_code = status.status_code
    payment.pesapal_confirmation_code = status.confirmation_code
    payment.payment_method = status.payment_method
    payment.payment_account = status.payment_account
    payment.payment_status_code = status.payment_status_code

    if status.status_code == _PESAPAL_COMPLETED:
        await _complete_booking(session, payment)
    elif status.status_code in _PESAPAL_TERMINAL_FAILURE_CODES:
        payment.status = PaymentStatus.FAILED
        reason = status.payment_status_description or status.description or "Failed"
        if status.payment_status_code:
            reason = f"{reason}: {status.payment_status_code}"
        payment.failure_reason = reason
    # else: still pending on Pesapal's side - leave as `pending` for the
    # next poll/IPN to retry.

    payment.updated_at = datetime.utcnow()
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


async def confirm_card_payment(session: Session, payment: Payment) -> Payment:
    """Confirms a Duffel Payments PaymentIntent and, on success, completes
    the booking exactly like finalize_payment does for Pesapal (see
    _complete_booking) - the two providers converge immediately after
    their own payment-confirmation step.

    Not polled/webhook-driven like Pesapal - the frontend calls this once,
    right after the DuffelPayments component reports a successful card
    collection - but still row-locked and guarded by the same `pending`
    check, in case of an accidental double-submit.
    """
    locked_payment = session.exec(
        select(Payment).where(Payment.id == payment.id).with_for_update()
    ).first()
    if locked_payment is None:
        return payment
    payment = locked_payment

    if payment.status != PaymentStatus.PENDING:
        return payment
    if not payment.duffel_payment_intent_id:
        return payment

    try:
        intent = await duffel_flight_service.confirm_payment_intent(
            payment.duffel_payment_intent_id
        )
    except DuffelAPIError as e:
        logger.warning(
            "Duffel PaymentIntent confirm failed for payment %s: %s", payment.id, e
        )
        payment.status = PaymentStatus.FAILED
        payment.failure_reason = str(e)
        payment.updated_at = datetime.utcnow()
        session.add(payment)
        session.commit()
        session.refresh(payment)
        return payment

    intent_data = intent["data"]
    payment.payment_method = intent_data.get("card_network")
    payment.payment_account = intent_data.get("card_last_four_digits")

    # Confirming can 200 with a non-"succeeded" status (same lesson as
    # Pesapal's status_code - never assume a 2xx response means the money
    # actually moved).
    if intent_data.get("status") == "succeeded":
        await _complete_booking(session, payment)
    else:
        logger.info(
            "Card payment %s not completed (status: %s)",
            payment.id,
            intent_data.get("status"),
        )
        payment.status = PaymentStatus.FAILED
        payment.failure_reason = (
            f"Card payment not completed (status: {intent_data.get('status')})"
        )

    payment.updated_at = datetime.utcnow()
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment
