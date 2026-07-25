import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from backend.config import settings
from backend.crud.bookings import get_booking
from backend.crud.db import get_session
from backend.crud.payments import (
    confirm_card_payment,
    create_payment,
    finalize_payment,
    get_payment,
)
from backend.external_services.flight import DuffelAPIError, duffel_flight_service
from backend.external_services.payment import PesapalAPIError, pesapal_payment_service
from backend.models.payments import Payment, PaymentProvider
from backend.models.users import UserInDB
from backend.schemas.bookings import BookingPublic
from backend.schemas.payments import (
    CardCheckoutResponse,
    CheckoutRequest,
    CheckoutResponse,
    PaymentStatusResponse,
)
from backend.schemas.pesapal import PesapalBillingAddress
from backend.utils.pricing import marked_up_amount
from backend.utils.security import get_current_user

router = APIRouter(prefix="/payments")

FRONTEND_URL = settings.FRONTEND_URL


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


async def _reconfirm_price_and_create_payment(
    session: Session,
    current_user: UserInDB,
    request: CheckoutRequest,
    provider: PaymentProvider,
) -> Payment:
    """Shared by both checkout endpoints below: re-confirms the offer's
    live price, applies flyt's markup, and persists a pending Payment.
    The one place this money-critical price/markup logic lives, so both
    payment providers can never drift apart on it."""
    offer_id = request.selected_offers[0]
    try:
        priced = await duffel_flight_service.confirm_price(offer_id)
    except DuffelAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.errors)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    offer_data = priced["data"]
    duffel_amount = offer_data["total_amount"]
    currency = offer_data["total_currency"]
    amount = marked_up_amount(duffel_amount)

    return create_payment(
        session,
        current_user.id,
        request,
        amount,
        duffel_amount,
        currency,
        provider=provider,
    )


@router.post("/checkout", response_model=CheckoutResponse)
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
    payment = await _reconfirm_price_and_create_payment(
        session, current_user, request, PaymentProvider.PESAPAL
    )

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
            description=f"flyt.io flight booking ({offer_id})",
            callback_url=f"{FRONTEND_URL}/booking/payment-callback?payment_id={payment.id}",
            cancellation_url=(
                f"{FRONTEND_URL}/booking/payment-callback"
                f"?payment_id={payment.id}&cancelled=1"
            ),
            billing_address=billing_address,
        )
    except (PesapalAPIError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Payment provider error: {e}",
        )

    payment.pesapal_order_tracking_id = pesapal_order.order_tracking_id
    session.add(payment)
    session.commit()

    return CheckoutResponse(
        payment_id=payment.id, redirect_url=pesapal_order.redirect_url
    )


@router.post("/checkout/card", response_model=CardCheckoutResponse)
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
    payment = await _reconfirm_price_and_create_payment(
        session, current_user, request, PaymentProvider.DUFFEL
    )

    try:
        intent = await duffel_flight_service.create_payment_intent(
            payment.amount, payment.currency
        )
    except DuffelAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.errors)

    intent_data = intent["data"]
    payment.duffel_payment_intent_id = intent_data["id"]
    session.add(payment)
    session.commit()

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
    payment = session.exec(
        select(Payment).where(Payment.pesapal_order_tracking_id == OrderTrackingId)
    ).first()
    if payment is not None:
        try:
            await finalize_payment(session, payment)
        except PesapalAPIError:
            pass  # Pesapal retries the IPN on failure; nothing more to do here

    return {
        "orderNotificationType": OrderNotificationType,
        "orderTrackingId": OrderTrackingId,
        "orderMerchantReference": OrderMerchantReference,
        "status": 200,
    }
