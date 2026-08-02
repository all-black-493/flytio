"""Tests for the customer-refund leg of a cancellation (crud/refunds.py).

The money rules being pinned down here, all of which cost real money if
they regress: flyt refunds the airline's refund and keeps its markup;
never more than the customer actually paid; and anything Pesapal's API
physically can't carry (partial refunds on mobile money above all) is
recorded for a human instead of silently dropped or wrongly sent.
"""

import asyncio
import uuid

import pytest
from sqlmodel import Session, select

import backend.crud.refunds as refunds_module
from backend.crud.refunds import (
    customer_refund_amount,
    initiate_refund,
    list_refunds,
    mark_refund_completed,
    send_refund_request,
)
from backend.external_services.payment import PesapalAPIError
from backend.models.payments import Payment, PaymentProvider, PaymentStatus
from backend.models.refunds import Refund, RefundStatus


def _run(coro):
    return asyncio.run(coro)


def _payment(
    session: Session,
    *,
    amount: str = "10700.00",
    provider: PaymentProvider = PaymentProvider.PESAPAL,
    payment_method: str | None = "MpesaKE",
    confirmation_code: str | None = "AA11BB22",
    currency: str = "KES",
) -> Payment:
    payment = Payment(
        user_id=uuid.uuid4(),
        order_request_snapshot="{}",
        amount=amount,
        duffel_amount="10000.00",
        currency=currency,
        merchant_reference=f"flyt-{uuid.uuid4().hex[:10]}",
        provider=provider,
        payment_method=payment_method,
        pesapal_confirmation_code=confirmation_code,
        status=PaymentStatus.COMPLETED,
    )
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


@pytest.fixture
def accepted_pesapal(monkeypatch):
    """Pesapal accepting every refund, recording what it was asked for."""
    calls = []

    async def fake_request_refund(**kwargs):
        calls.append(kwargs)
        return None

    monkeypatch.setattr(
        refunds_module.pesapal_payment_service, "request_refund", fake_request_refund
    )
    return calls


# ---------- the money calculation ----------


def test_customer_gets_airline_refund_and_flyt_keeps_its_markup(sqlite_engine):
    """The worked example: customer paid 10,700 (10,000 fare + 700
    markup), airline penalty 2,000 so Duffel refunds flyt 8,000. The
    customer gets exactly that 8,000 - flyt's 700 stays put, because it
    already paid Pesapal's non-refundable processing fee out of it."""
    with Session(sqlite_engine) as session:
        payment = _payment(session, amount="10700.00")
        assert customer_refund_amount(payment, "8000.00") == "8000.00"


def test_refund_never_exceeds_what_the_customer_actually_paid(sqlite_engine):
    """A discount code can leave the raw fare Duffel refunds against
    higher than the amount charged - paying out the raw figure would send
    out money that was never collected."""
    with Session(sqlite_engine) as session:
        payment = _payment(session, amount="9700.00")  # 1,000 discount applied
        assert customer_refund_amount(payment, "10000.00") == "9700.00"


def test_non_refundable_fare_owes_nothing(sqlite_engine):
    with Session(sqlite_engine) as session:
        payment = _payment(session)
        assert customer_refund_amount(payment, "0.00") == "0.00"
        assert customer_refund_amount(payment, None) == "0.00"


def test_no_refund_row_written_when_nothing_is_owed(sqlite_engine, accepted_pesapal):
    with Session(sqlite_engine) as session:
        payment = _payment(session)
        refund = _run(
            initiate_refund(
                session,
                payment=payment,
                booking_id=uuid.uuid4(),
                duffel_refund_amount="0.00",
            )
        )
        assert refund is None
        assert session.exec(select(Refund)).all() == []
        assert accepted_pesapal == []


# ---------- the happy path ----------


def test_full_refund_is_sent_to_pesapal(sqlite_engine, accepted_pesapal):
    with Session(sqlite_engine) as session:
        payment = _payment(session, amount="10700.00")
        refund = _run(
            initiate_refund(
                session,
                payment=payment,
                booking_id=uuid.uuid4(),
                duffel_refund_amount="10700.00",
            )
        )

        assert refund.status == RefundStatus.REQUESTED
        assert refund.amount == "10700.00"
        assert refund.currency == "KES"
        assert len(accepted_pesapal) == 1
        # Pesapal identifies the transaction by the payment's confirmation
        # code, not our merchant reference or their tracking id.
        assert accepted_pesapal[0]["confirmation_code"] == "AA11BB22"
        assert accepted_pesapal[0]["amount"] == 10700.00


def test_partial_refund_on_a_card_is_allowed(sqlite_engine, accepted_pesapal):
    """Pesapal permits partial refunds on cards - only mobile money is
    restricted to full refunds."""
    with Session(sqlite_engine) as session:
        payment = _payment(session, amount="10700.00", payment_method="Visa")
        refund = _run(
            initiate_refund(
                session,
                payment=payment,
                booking_id=uuid.uuid4(),
                duffel_refund_amount="8000.00",
            )
        )

        assert refund.status == RefundStatus.REQUESTED
        assert refund.amount == "8000.00"
        assert len(accepted_pesapal) == 1


# ---------- the cases Pesapal can't carry ----------


def test_partial_refund_on_mpesa_is_flagged_for_manual_payout(
    sqlite_engine, accepted_pesapal
):
    """The constraint that drove this whole design: Pesapal only refunds
    mobile money in full, so a penalised M-Pesa cancellation cannot be
    settled through the API at all. It must be recorded, not attempted."""
    with Session(sqlite_engine) as session:
        payment = _payment(session, amount="10700.00", payment_method="MpesaKE")
        refund = _run(
            initiate_refund(
                session,
                payment=payment,
                booking_id=uuid.uuid4(),
                duffel_refund_amount="8000.00",
            )
        )

        assert refund.status == RefundStatus.MANUAL_REQUIRED
        assert refund.amount == "8000.00"
        assert "full refunds on mobile money" in refund.failure_reason
        # Crucially, nothing was sent - a partial mobile refund would just
        # be rejected, burning the single refund Pesapal allows.
        assert accepted_pesapal == []


@pytest.mark.parametrize(
    "kwargs,expected_fragment",
    [
        ({"provider": PaymentProvider.ADMIN}, "outside flyt"),
        ({"provider": PaymentProvider.DUFFEL}, "Duffel Payments"),
        ({"confirmation_code": None}, "confirmation code"),
    ],
)
def test_unrefundable_payment_kinds_are_flagged_not_attempted(
    sqlite_engine, accepted_pesapal, kwargs, expected_fragment
):
    with Session(sqlite_engine) as session:
        payment = _payment(session, amount="10700.00", **kwargs)
        refund = _run(
            initiate_refund(
                session,
                payment=payment,
                booking_id=uuid.uuid4(),
                duffel_refund_amount="10700.00",
            )
        )

        assert refund.status == RefundStatus.MANUAL_REQUIRED
        assert expected_fragment in refund.failure_reason
        assert accepted_pesapal == []


def test_pesapal_rejection_is_recorded_as_failed(sqlite_engine, monkeypatch):
    async def fake_request_refund(**kwargs):
        raise PesapalAPIError(200, "Refund rejected: Invalid confirmation code.")

    monkeypatch.setattr(
        refunds_module.pesapal_payment_service, "request_refund", fake_request_refund
    )

    with Session(sqlite_engine) as session:
        payment = _payment(session, amount="10700.00")
        refund = _run(
            initiate_refund(
                session,
                payment=payment,
                booking_id=uuid.uuid4(),
                duffel_refund_amount="10700.00",
            )
        )

        assert refund.status == RefundStatus.FAILED
        assert "Invalid confirmation code" in refund.failure_reason


# ---------- idempotency ----------


def test_second_delivery_of_the_same_event_does_not_refund_twice(
    sqlite_engine, accepted_pesapal
):
    """The consumer has at-least-once delivery, so a redelivered
    booking_cancelled event must not send a second refund - Pesapal
    allows only one per payment, and a double payout is real money."""
    with Session(sqlite_engine) as session:
        payment = _payment(session, amount="10700.00")
        booking_id = uuid.uuid4()

        first = _run(
            initiate_refund(
                session,
                payment=payment,
                booking_id=booking_id,
                duffel_refund_amount="10700.00",
            )
        )
        second = _run(
            initiate_refund(
                session,
                payment=payment,
                booking_id=booking_id,
                duffel_refund_amount="10700.00",
            )
        )

        assert second.id == first.id
        assert len(accepted_pesapal) == 1
        assert len(session.exec(select(Refund)).all()) == 1


# ---------- admin actions ----------


def test_retry_resends_the_existing_row_rather_than_creating_another(
    sqlite_engine, monkeypatch
):
    attempts = []

    async def failing(**kwargs):
        attempts.append(kwargs)
        raise PesapalAPIError(200, "temporarily unavailable")

    monkeypatch.setattr(
        refunds_module.pesapal_payment_service, "request_refund", failing
    )

    with Session(sqlite_engine) as session:
        payment = _payment(session, amount="10700.00")
        refund = _run(
            initiate_refund(
                session,
                payment=payment,
                booking_id=uuid.uuid4(),
                duffel_refund_amount="10700.00",
            )
        )
        assert refund.status == RefundStatus.FAILED

        async def succeeding(**kwargs):
            attempts.append(kwargs)
            return None

        monkeypatch.setattr(
            refunds_module.pesapal_payment_service, "request_refund", succeeding
        )
        retried = _run(send_refund_request(session, refund, payment))

        assert retried.id == refund.id
        assert retried.status == RefundStatus.REQUESTED
        assert retried.failure_reason is None
        assert len(attempts) == 2
        assert len(session.exec(select(Refund)).all()) == 1


def test_mark_completed_is_the_only_route_to_completed(sqlite_engine, accepted_pesapal):
    with Session(sqlite_engine) as session:
        payment = _payment(session, amount="10700.00")
        refund = _run(
            initiate_refund(
                session,
                payment=payment,
                booking_id=uuid.uuid4(),
                duffel_refund_amount="10700.00",
            )
        )
        # Pesapal accepting it only means "queued for their finance team".
        assert refund.status == RefundStatus.REQUESTED

        completed = mark_refund_completed(session, refund)
        assert completed.status == RefundStatus.COMPLETED


def test_list_refunds_filters_by_status(sqlite_engine, accepted_pesapal):
    with Session(sqlite_engine) as session:
        manual_payment = _payment(session, amount="10700.00", payment_method="MpesaKE")
        _run(
            initiate_refund(
                session,
                payment=manual_payment,
                booking_id=uuid.uuid4(),
                duffel_refund_amount="8000.00",
            )
        )
        ok_payment = _payment(session, amount="5000.00", payment_method="Visa")
        _run(
            initiate_refund(
                session,
                payment=ok_payment,
                booking_id=uuid.uuid4(),
                duffel_refund_amount="5000.00",
            )
        )

        assert len(list_refunds(session)) == 2
        manual = list_refunds(session, status=RefundStatus.MANUAL_REQUIRED)
        assert len(manual) == 1
        assert manual[0].payment_id == manual_payment.id
