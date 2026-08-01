import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from backend.config import settings
from backend.crud.bookings import get_booking
from backend.crud.db import get_session
from backend.crud.payments import (
    attach_duffel_payment_intent,
    attach_pesapal_tracking_id,
    confirm_card_payment,
    finalize_payment,
    get_payment,
    get_payment_by_pesapal_tracking_id,
    reconfirm_price_and_create_payment,
)
from backend.crud.pricing import validate_discount_code
from backend.external_services.flight import DuffelAPIError, duffel_flight_service
from backend.external_services.payment import PesapalAPIError, pesapal_payment_service
from backend.models.payments import Payment, PaymentProvider
from backend.models.users import UserInDB
from backend.schemas.bookings import BookingPublic
from backend.schemas.payments import (
    CardCheckoutResponse,
    CheckoutRequest,
    CheckoutResponse,
    DiscountPreviewRequest,
    DiscountPreviewResponse,
    PaymentStatusResponse,
)
from backend.schemas.pesapal import PesapalBillingAddress
from backend.utils.duffel_errors import duffel_http_exception
from backend.utils.guard import guard_deco
from backend.utils.log_manager import get_app_logger
from backend.utils.pricing import (
    apply_discount,
    get_active_markup_rate,
    marked_up_amount,
)
from backend.utils.security import get_current_user

logger = get_app_logger(__name__)

router = APIRouter(prefix="/payments")

FRONTEND_URL = settings.FRONTEND_URL

# Both checkout paths are authenticated and each call re-confirms price
# with Duffel and creates a provider-side order (Pesapal order / Duffel
# PaymentIntent) - this guards against a runaway retry loop (bug or
# otherwise) spamming either provider with duplicate in-flight payments.
# IP-keyed via guard_deco.rate_limit (fastapi-guard) below, not per-user -
# see routers/users.py's constants block for why.
CHECKOUT_IP_LIMIT = 10
CHECKOUT_WINDOW_SECONDS = 60 * 10


def _get_owned_payment(
    session: Session, payment_id: uuid.UUID, current_user: UserInDB
) -> Payment:
    """Mirrors _get_owned_booking in routers/flights.py: 404s (not 403) on
    a mismatch, so a guessed payment_id can't be used to probe existence."""
    payment = get_payment(session, payment_id)
    if payment is None or payment.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found"
        )
    return payment


@router.post("/discounts/preview", response_model=DiscountPreviewResponse)
@guard_deco.rate_limit(requests=CHECKOUT_IP_LIMIT, window=CHECKOUT_WINDOW_SECONDS)
async def preview_discount(
    request: DiscountPreviewRequest,
    _: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Non-persisting check so the customer sees whether a code works (and
    roughly what it saves) before committing to checkout - see
    DiscountPreviewRequest's docstring for why this previews the base
    fare only, not the final total with seats/baggage folded in. The real
    checkout call re-validates and applies the code for real."""
    try:
        priced = await duffel_flight_service.confirm_price(request.offer_id)
    except DuffelAPIError as e:
        raise duffel_http_exception(e)

    offer_data = priced["data"]
    duffel_amount = offer_data["total_amount"]
    currency = offer_data["total_currency"]
    markup_rate = get_active_markup_rate(session)
    original_amount = marked_up_amount(duffel_amount, markup_rate)

    try:
        discount = validate_discount_code(session, request.discount_code)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    discounted_amount = apply_discount(
        original_amount, discount.discount_percentage, floor_amount=duffel_amount
    )
    return DiscountPreviewResponse(
        original_amount=original_amount,
        discounted_amount=discounted_amount,
        currency=currency,
        discount_percentage=discount.discount_percentage,
    )


@router.post("/checkout", response_model=CheckoutResponse)
@guard_deco.rate_limit(requests=CHECKOUT_IP_LIMIT, window=CHECKOUT_WINDOW_SECONDS)
async def checkout(
    request: CheckoutRequest,
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Starts a purchase: re-confirms the offer's live price, stores the
    passenger details for later, and hands back a Pesapal redirect URL.

    Duffel is NOT contacted to create an order here - that only happens
    once Pesapal confirms payment (see GET /payments/{payment_id}/status
    and /payments/ipn), so no airline-side hold is ever created for a
    purchase the customer doesn't complete.
    """
    offer_id = request.selected_offers[0]
    try:
        payment = await reconfirm_price_and_create_payment(
            session, current_user.id, request, PaymentProvider.PESAPAL
        )
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    primary_passenger = request.passengers[0]
    billing_address = PesapalBillingAddress(
        email_address=primary_passenger.email,
        phone_number=primary_passenger.phone_number,
        first_name=primary_passenger.given_name,
        last_name=primary_passenger.family_name,
    )

    try:
        pesapal_order = await pesapal_payment_service.submit_order_request(
            merchant_reference=payment.merchant_reference,
            amount=float(payment.amount),
            currency=payment.currency,
            description=f"flyt flight booking ({offer_id})",
            callback_url=f"{FRONTEND_URL}/booking/payment-callback?payment_id={payment.id}",
            cancellation_url=(
                f"{FRONTEND_URL}/booking/payment-callback"
                f"?payment_id={payment.id}&cancelled=1"
            ),
            billing_address=billing_address,
        )
    except (PesapalAPIError, ValueError) as e:
        print("DEBUG PESAPAL ERROR: ", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Payment provider error: {e}",
        )

    attach_pesapal_tracking_id(session, payment, pesapal_order.order_tracking_id)

    return CheckoutResponse(
        payment_id=payment.id, redirect_url=pesapal_order.redirect_url
    )


@router.post("/checkout/card", response_model=CardCheckoutResponse)
@guard_deco.rate_limit(requests=CHECKOUT_IP_LIMIT, window=CHECKOUT_WINDOW_SECONDS)
async def checkout_card(
    request: CheckoutRequest,
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Card-payment alternative to /checkout: re-confirms price the same way,
    then starts a Duffel Payments PaymentIntent instead of redirecting to
    Pesapal. Returns a client_token for the frontend's DuffelPayments
    component to collect the card directly with Duffel - card details
    never reach our backend. See POST /payments/{payment_id}/confirm-card
    for what happens once the customer submits their card.
    """
    try:
        payment = await reconfirm_price_and_create_payment(
            session, current_user.id, request, PaymentProvider.DUFFEL
        )
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    try:
        intent = await duffel_flight_service.create_payment_intent(
            payment.amount, payment.currency
        )
    except DuffelAPIError as e:
        raise duffel_http_exception(e)

    intent_data = intent["data"]
    attach_duffel_payment_intent(session, payment, intent_data["id"])

    return CardCheckoutResponse(
        payment_id=payment.id, client_token=intent_data["client_token"]
    )


@router.post("/{payment_id}/confirm-card", response_model=PaymentStatusResponse)
async def confirm_card(
    payment_id: uuid.UUID,
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Called by the frontend right after DuffelPayments reports a
    successful card collection. Confirms the PaymentIntent (which tops up
    our Duffel Balance) and, on success, completes the booking - the
    card-path equivalent of GET /payments/{payment_id}/status, returning
    the same response shape so the frontend can reuse its result UI.
    """
    payment = _get_owned_payment(session, payment_id, current_user)
    try:
        payment = await confirm_card_payment(session, payment)
    except DuffelAPIError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    booking = get_booking(session, payment.booking_id) if payment.booking_id else None
    return PaymentStatusResponse(
        id=payment.id,
        status=payment.status,
        booking_id=payment.booking_id,
        failure_reason=payment.failure_reason,
        booking=BookingPublic.model_validate(booking) if booking else None,
    )


@router.get("/{payment_id}/status", response_model=PaymentStatusResponse)
async def payment_status(
    payment_id: uuid.UUID,
    current_user: UserInDB = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Polled by the frontend right after Pesapal redirects the customer back
    to the callback URL - the primary confirmation path. Triggers a live
    Pesapal status check (and, on success, the Duffel booking) if the
    payment is still `pending`; otherwise just returns its current state.
    """
    payment = _get_owned_payment(session, payment_id, current_user)
    try:
        payment = await finalize_payment(session, payment)
    except PesapalAPIError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    booking = get_booking(session, payment.booking_id) if payment.booking_id else None
    return PaymentStatusResponse(
        id=payment.id,
        status=payment.status,
        booking_id=payment.booking_id,
        failure_reason=payment.failure_reason,
        booking=BookingPublic.model_validate(booking) if booking else None,
    )


@router.api_route("/ipn", methods=["GET", "POST"])
async def pesapal_ipn(
    OrderTrackingId: Annotated[str, Query()],
    OrderMerchantReference: Annotated[str, Query()] = "",
    OrderNotificationType: Annotated[str, Query()] = "",
    session: Session = Depends(get_session),
):
    """
    Pesapal's server-to-server webhook. Not authenticated, since Pesapal
    calls this directly; the payment is looked up by the tracking ID
    Pesapal itself generated, not anything client-suppliable.

    Accepts both GET and POST regardless of which `ipn_notification_type`
    was registered (see backend/scripts/register_pesapal_ipn.py) - Pesapal
    always delivers OrderTrackingId/OrderMerchantReference/
    OrderNotificationType as query params either way (confirmed across
    their IPN, callback, and recurring-payment docs), so there's no
    parsing difference between the two methods, and accepting both is a
    free hedge against the registered type ever drifting from what we
    expect.

    A reliability backstop for the status-poll endpoint above, for cases
    where the customer closes their browser before returning from Pesapal.
    Must respond with this exact JSON echo per Pesapal's IPN spec.
    """
    payment = get_payment_by_pesapal_tracking_id(session, OrderTrackingId)
    if payment is not None:
        try:
            await finalize_payment(session, payment)
        except PesapalAPIError as e:
            # Pesapal retries the IPN on failure; nothing more to do here
            # beyond a record of it, since this is expected to self-heal.
            logger.info(
                "IPN-triggered status check failed for payment %s: %s", payment.id, e
            )

    return {
        "orderNotificationType": OrderNotificationType,
        "orderTrackingId": OrderTrackingId,
        "orderMerchantReference": OrderMerchantReference,
        "status": 200,
    }
