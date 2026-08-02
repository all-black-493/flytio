"""Refunding a cancelled booking's customer.

Cancelling a Duffel order refunds *flyt's own Duffel balance* (flyt pays
for every order from balance - see crud/payments.py's _complete_booking),
which does nothing for the person who actually paid. Getting their money
back is a separate movement down the rail they paid on, and this module
owns deciding how much that is and whether Pesapal can even carry it.
"""

import uuid
from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from backend.config import settings
from backend.external_services.payment import PesapalAPIError, pesapal_payment_service
from backend.models.payments import Payment, PaymentProvider
from backend.models.refunds import Refund, RefundStatus
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)

# Pesapal reports the channel actually used in `payment_method` (e.g.
# "MpesaKE", "Visa"). Anything that isn't a card is mobile money as far
# as its refund rules are concerned, and mobile money can only be
# refunded in full - so the check is "is this a card?", not "is this
# M-Pesa?", to stay correct for any other mobile channel Pesapal adds.
_CARD_PAYMENT_METHODS = {"visa", "mastercard", "card", "amex"}


def _is_card_payment(payment_method: str | None) -> bool:
    if not payment_method:
        return False
    return payment_method.strip().lower() in _CARD_PAYMENT_METHODS


def customer_refund_amount(payment: Payment, duffel_refund_amount: str | None) -> str:
    """What the customer gets back, as a 2dp string.

    flyt passes the airline's refund straight through and keeps its
    markup: that markup is flyt's only revenue and it already absorbed
    Pesapal's ~3% processing fee, which Pesapal does not return when a
    payment is refunded. Refunding the markup too would make every
    penalised cancellation a net loss.

    Capped at what the customer actually paid - a discount code can leave
    the raw fare (which is what Duffel refunds against) higher than the
    charged amount, and refunding more than was collected would be real
    money out the door.
    """
    if duffel_refund_amount is None:
        return "0.00"
    refund = float(duffel_refund_amount)
    paid = float(payment.amount)
    return f"{max(0.0, min(refund, paid)):.2f}"


def refund_blocker(payment: Payment, amount: str) -> str | None:
    """Why this refund can't go through Pesapal's API, or None if it can.

    Every one of these is a hard constraint rather than a policy choice -
    the money is genuinely owed in each case, it just has to leave flyt
    some other way, so the caller records it for a human instead of
    silently dropping it.
    """
    if payment.provider == PaymentProvider.ADMIN:
        return (
            "Booking was recorded as paid outside flyt (cash/bank/invoice), so "
            "there is no Pesapal transaction to refund - pay the customer back "
            "the same way they paid."
        )
    if payment.provider == PaymentProvider.DUFFEL:
        return (
            "Paid via Duffel Payments, which flyt does not collect on - refund "
            "it from the Duffel dashboard instead of Pesapal."
        )
    if not payment.pesapal_confirmation_code:
        return (
            "No Pesapal confirmation code was stored for this payment, and "
            "Pesapal's RefundRequest identifies a transaction only by that code."
        )
    if float(amount) < float(payment.amount) and not _is_card_payment(
        payment.payment_method
    ):
        return (
            f"Pesapal only allows full refunds on mobile money, and this is a "
            f"partial refund ({amount} of {payment.amount} {payment.currency}) "
            f"on {payment.payment_method or 'a non-card method'} - pay the "
            f"difference out manually."
        )
    return None


def get_refund_for_payment(session: Session, payment_id: uuid.UUID) -> Refund | None:
    return session.exec(select(Refund).where(Refund.payment_id == payment_id)).first()


def get_refund_for_booking(session: Session, booking_id: uuid.UUID) -> Refund | None:
    """The refund owed for one booking - what the traveller sees on their
    own booking page (routers/bookings.py)."""
    return session.exec(select(Refund).where(Refund.booking_id == booking_id)).first()


def _save(session: Session, refund: Refund) -> Refund:
    refund.updated_at = datetime.utcnow()
    session.add(refund)
    session.commit()
    session.refresh(refund)
    return refund


async def initiate_refund(
    session: Session,
    *,
    payment: Payment,
    booking_id: uuid.UUID | None,
    duffel_refund_amount: str | None,
) -> Refund | None:
    """Creates the Refund row and, when Pesapal can carry it, requests it.

    Returns None when nothing is owed (a fully non-refundable fare), so
    no row is written for a cancellation that was never going to return
    money.

    Idempotent: the caller is a Kafka consumer with at-least-once
    delivery, so a redelivered booking_cancelled event must not refund
    anyone twice. Guarded both by an up-front lookup and by
    Refund.payment_id's unique constraint, which is what actually holds
    if two deliveries race.
    """
    amount = customer_refund_amount(payment, duffel_refund_amount)
    if float(amount) <= 0:
        logger.info(
            "No refund owed for payment %s (Duffel refunded %s) - nothing to do",
            payment.id,
            duffel_refund_amount,
        )
        return None

    existing = get_refund_for_payment(session, payment.id)
    if existing is not None:
        logger.info(
            "Refund %s already exists for payment %s - skipping",
            existing.id,
            payment.id,
        )
        return existing

    blocked = refund_blocker(payment, amount)
    refund = Refund(
        payment_id=payment.id,
        booking_id=booking_id,
        amount=amount,
        currency=payment.currency,
        pesapal_confirmation_code=payment.pesapal_confirmation_code,
        status=RefundStatus.MANUAL_REQUIRED if blocked else RefundStatus.REQUESTED,
        failure_reason=blocked,
    )
    try:
        session.add(refund)
        session.commit()
        session.refresh(refund)
    except IntegrityError:
        # A concurrent delivery of the same event won the unique
        # constraint on payment_id - that one owns the refund.
        session.rollback()
        existing = get_refund_for_payment(session, payment.id)
        if existing is None:
            raise
        logger.info(
            "Lost refund-creation race for payment %s, reusing existing row", payment.id
        )
        return existing

    if blocked:
        logger.warning(
            "Refund %s for payment %s needs a manual payout: %s",
            refund.id,
            payment.id,
            blocked,
        )
        return refund

    return await send_refund_request(session, refund, payment)


async def send_refund_request(
    session: Session, refund: Refund, payment: Payment
) -> Refund:
    """Sends an already-created Refund to Pesapal. Split out from
    initiate_refund so the admin retry endpoint can re-send a FAILED one
    without recreating the row (Pesapal would reject a second refund for
    the same payment, so there must only ever be one)."""
    try:
        await pesapal_payment_service.request_refund(
            confirmation_code=refund.pesapal_confirmation_code,
            amount=float(refund.amount),
            username=settings.PESAPAL_REFUND_USERNAME,
            remarks=f"flyt booking cancellation - payment {payment.merchant_reference}",
        )
    except PesapalAPIError as e:
        logger.exception(
            "Pesapal rejected refund %s for payment %s", refund.id, payment.id
        )
        refund.status = RefundStatus.FAILED
        refund.failure_reason = str(e.message)
        return _save(session, refund)

    logger.info(
        "Refund %s (%s %s) queued with Pesapal for payment %s",
        refund.id,
        refund.amount,
        refund.currency,
        payment.id,
    )
    refund.status = RefundStatus.REQUESTED
    refund.failure_reason = None
    return _save(session, refund)


def mark_refund_completed(session: Session, refund: Refund) -> Refund:
    """Staff confirming the customer actually received the money. Pesapal
    exposes no way to learn this automatically (see RefundStatus), so
    this is the only path to COMPLETED."""
    refund.status = RefundStatus.COMPLETED
    refund.failure_reason = None
    return _save(session, refund)


def refunds_query(*, status: RefundStatus | None = None):
    """Ordered statement behind GET /api/admin/refunds - see
    crud/bookings.py's user_bookings_query on the id tiebreaker."""
    query = select(Refund)
    if status is not None:
        query = query.where(Refund.status == status)
    return query.order_by(Refund.created_at.desc(), Refund.id.desc())
