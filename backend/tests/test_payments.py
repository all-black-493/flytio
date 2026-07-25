"""Unit tests for the payment state machine (crud/payments.py's
finalize_payment), with Pesapal and Duffel calls mocked - fully runnable
without real Pesapal credentials or a live Duffel connection.

Uses an isolated in-memory SQLite engine rather than the app's configured
Postgres DB, so this test doesn't depend on Docker Compose being up.
"""

import asyncio
import uuid
from datetime import date

import pytest
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.crud.bookings import get_booking
from backend.crud.payments import confirm_card_payment, create_payment, finalize_payment
from backend.external_services.flight import DuffelAPIError, duffel_flight_service
from backend.external_services.payment import PesapalAPIError, pesapal_payment_service
from backend.models.payments import PaymentProvider, PaymentStatus
from backend.schemas.duffel_flights import OrderPassenger
from backend.schemas.payments import CheckoutRequest
from backend.schemas.pesapal import PesapalTransactionStatusResponse

engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
SQLModel.metadata.create_all(engine)


@pytest.fixture
def session():
    with Session(engine) as session:
        yield session
        for table in reversed(SQLModel.metadata.sorted_tables):
            session.exec(table.delete())
        session.commit()


def _checkout_request() -> CheckoutRequest:
    return CheckoutRequest(
        selected_offers=["off_test123"],
        passengers=[
            OrderPassenger(
                id="pas_test123",
                title="mr",
                gender="m",
                given_name="Test",
                family_name="Passenger",
                born_on=date(1990, 1, 1),
                email="test@example.com",
                phone_number="+254757573984",
            )
        ],
    )


def _pending_payment(session: Session):
    payment = create_payment(
        session,
        uuid.uuid4(),
        _checkout_request(),
        amount="100.00",
        duffel_amount="93.46",
        currency="USD",
    )
    payment.pesapal_order_tracking_id = "track_123"
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


def _pending_card_payment(session: Session):
    payment = create_payment(
        session,
        uuid.uuid4(),
        _checkout_request(),
        amount="100.00",
        duffel_amount="93.46",
        currency="USD",
        provider=PaymentProvider.DUFFEL,
    )
    payment.duffel_payment_intent_id = "pit_test123"
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


def _fake_duffel_order() -> dict:
    return {
        "data": {
            "id": "ord_test123",
            "booking_reference": "ABC123",
            # Matches _pending_payment's duffel_amount ("93.46"), not its
            # (marked-up) amount ("100.00") - this is what Duffel actually
            # charges for the order it created.
            "total_amount": "93.46",
            "total_currency": "USD",
            "slices": [],
            "passengers": [
                {
                    "id": "pas_test123",
                    "given_name": "Test",
                    "family_name": "Passenger",
                    "born_on": "1990-01-01",
                    "email": "test@example.com",
                    "phone_number": "+254757573984",
                }
            ],
            "documents": [],
        }
    }


def test_finalize_payment_completed(session, monkeypatch):
    payment = _pending_payment(session)

    async def fake_get_transaction_status(order_tracking_id):
        assert order_tracking_id == "track_123"
        return PesapalTransactionStatusResponse(
            status_code=1,
            confirmation_code="conf_1",
            payment_status_description="COMPLETED",
        )

    async def fake_create_flight_order(order):
        return _fake_duffel_order()

    monkeypatch.setattr(
        pesapal_payment_service, "get_transaction_status", fake_get_transaction_status
    )
    monkeypatch.setattr(
        duffel_flight_service, "create_flight_order", fake_create_flight_order
    )

    result = asyncio.run(finalize_payment(session, payment))

    assert result.status == PaymentStatus.COMPLETED
    assert result.booking_id is not None
    assert result.pesapal_confirmation_code == "conf_1"


def test_finalize_payment_pays_duffel_the_raw_amount_not_the_charged_one(
    session, monkeypatch
):
    """The actual money-correctness guarantee this whole markup feature
    hinges on: Duffel gets paid payment.duffel_amount (raw), never
    payment.amount (marked-up) - and the persisted booking shows the
    customer what they actually paid, not Duffel's raw net fare."""
    payment = _pending_payment(session)
    assert payment.amount == "100.00"
    assert payment.duffel_amount == "93.46"

    captured_order_requests = []

    async def fake_get_transaction_status(order_tracking_id):
        return PesapalTransactionStatusResponse(
            status_code=1, confirmation_code="conf_1"
        )

    async def fake_create_flight_order(order):
        captured_order_requests.append(order)
        return _fake_duffel_order()

    monkeypatch.setattr(
        pesapal_payment_service, "get_transaction_status", fake_get_transaction_status
    )
    monkeypatch.setattr(
        duffel_flight_service, "create_flight_order", fake_create_flight_order
    )

    result = asyncio.run(finalize_payment(session, payment))

    assert len(captured_order_requests) == 1
    sent_payment = captured_order_requests[0]["payments"][0]
    assert sent_payment["amount"] == "93.46"  # raw - what Duffel is owed
    assert sent_payment["amount"] != payment.amount  # never the marked-up figure

    booking = get_booking(session, result.booking_id)
    assert booking.total_amount == "100.00"  # what the customer paid, not "93.46"


def test_finalize_payment_failed(session, monkeypatch):
    payment = _pending_payment(session)

    async def fake_get_transaction_status(order_tracking_id):
        return PesapalTransactionStatusResponse(
            status_code=2,
            payment_status_description="FAILED",
            description="Card declined",
        )

    monkeypatch.setattr(
        pesapal_payment_service, "get_transaction_status", fake_get_transaction_status
    )

    result = asyncio.run(finalize_payment(session, payment))

    assert result.status == PaymentStatus.FAILED
    assert result.booking_id is None
    assert result.failure_reason == "FAILED"


def test_finalize_payment_failed_captures_channel_and_specific_reason(
    session, monkeypatch
):
    """Real Pesapal sandbox responses include a payment_status_code much
    more specific than the coarse status_code (e.g. an M-Pesa decline) -
    finalize_payment should persist it, not just the generic description."""
    payment = _pending_payment(session)

    async def fake_get_transaction_status(order_tracking_id):
        return PesapalTransactionStatusResponse(
            status_code=2,
            payment_status_description="Failed",
            payment_status_code="request_terminated_by_user",
            payment_method="MpesaKE",
            payment_account="2547xxx73984",
        )

    monkeypatch.setattr(
        pesapal_payment_service, "get_transaction_status", fake_get_transaction_status
    )

    result = asyncio.run(finalize_payment(session, payment))

    assert result.status == PaymentStatus.FAILED
    assert result.payment_method == "MpesaKE"
    assert result.payment_account == "2547xxx73984"
    assert result.payment_status_code == "request_terminated_by_user"
    assert result.failure_reason == "Failed: request_terminated_by_user"


def test_finalize_payment_invalid_status_code_stays_pending(session, monkeypatch):
    """status_code 0 (INVALID) isn't always a dead transaction - Pesapal's
    sandbox has returned it mid-payment with error.code
    'payment_details_not_found' / message 'Pending Payment'. Only 2/3
    (FAILED/REVERSED) are treated as terminal."""
    payment = _pending_payment(session)

    async def fake_get_transaction_status(order_tracking_id):
        return PesapalTransactionStatusResponse(status_code=0)

    monkeypatch.setattr(
        pesapal_payment_service, "get_transaction_status", fake_get_transaction_status
    )

    result = asyncio.run(finalize_payment(session, payment))

    assert result.status == PaymentStatus.PENDING


def test_finalize_payment_stays_pending_when_status_check_errors(session, monkeypatch):
    """Confirmed against a real sandbox transaction: GetTransactionStatus
    can return an HTTP-level error for a payment that's still genuinely
    processing, not just for actual failures. This must not surface as a
    terminal failure, and must not raise (a raised error would 502 the
    status-poll endpoint, which stops the frontend's poll loop entirely)."""
    payment = _pending_payment(session)

    async def fake_get_transaction_status(order_tracking_id):
        raise PesapalAPIError(500, "payment_details_not_found: Pending Payment")

    monkeypatch.setattr(
        pesapal_payment_service, "get_transaction_status", fake_get_transaction_status
    )

    result = asyncio.run(finalize_payment(session, payment))

    assert result.status == PaymentStatus.PENDING


def test_finalize_payment_booking_failed_when_duffel_errors(session, monkeypatch):
    payment = _pending_payment(session)

    async def fake_get_transaction_status(order_tracking_id):
        return PesapalTransactionStatusResponse(
            status_code=1, confirmation_code="conf_2"
        )

    async def fake_create_flight_order(order):
        raise DuffelAPIError(422, [{"message": "offer expired"}])

    monkeypatch.setattr(
        pesapal_payment_service, "get_transaction_status", fake_get_transaction_status
    )
    monkeypatch.setattr(
        duffel_flight_service, "create_flight_order", fake_create_flight_order
    )

    result = asyncio.run(finalize_payment(session, payment))

    assert result.status == PaymentStatus.BOOKING_FAILED
    assert result.booking_id is None
    assert "offer expired" in result.failure_reason


def test_finalize_payment_still_pending_leaves_status_unchanged(session, monkeypatch):
    payment = _pending_payment(session)

    async def fake_get_transaction_status(order_tracking_id):
        return PesapalTransactionStatusResponse(status_code=None)

    monkeypatch.setattr(
        pesapal_payment_service, "get_transaction_status", fake_get_transaction_status
    )

    result = asyncio.run(finalize_payment(session, payment))

    assert result.status == PaymentStatus.PENDING


def test_finalize_payment_is_idempotent_once_completed(session, monkeypatch):
    payment = _pending_payment(session)
    payment.status = PaymentStatus.COMPLETED
    session.add(payment)
    session.commit()

    calls = []

    async def fake_get_transaction_status(order_tracking_id):
        calls.append(order_tracking_id)
        return PesapalTransactionStatusResponse(status_code=1)

    monkeypatch.setattr(
        pesapal_payment_service, "get_transaction_status", fake_get_transaction_status
    )

    result = asyncio.run(finalize_payment(session, payment))

    assert result.status == PaymentStatus.COMPLETED
    assert calls == []  # never re-checked Pesapal - the no-op guard short-circuited


def test_confirm_card_payment_completed(session, monkeypatch):
    """The card-path equivalent of test_finalize_payment_completed - same
    _complete_booking helper, reached via Duffel Payments confirmation
    instead of a Pesapal status check."""
    payment = _pending_card_payment(session)

    async def fake_confirm_payment_intent(payment_intent_id):
        assert payment_intent_id == "pit_test123"
        return {
            "data": {
                "status": "succeeded",
                "card_network": "visa",
                "card_last_four_digits": "4242",
            }
        }

    async def fake_create_flight_order(order):
        return _fake_duffel_order()

    monkeypatch.setattr(
        duffel_flight_service, "confirm_payment_intent", fake_confirm_payment_intent
    )
    monkeypatch.setattr(
        duffel_flight_service, "create_flight_order", fake_create_flight_order
    )

    result = asyncio.run(confirm_card_payment(session, payment))

    assert result.status == PaymentStatus.COMPLETED
    assert result.booking_id is not None
    assert result.payment_method == "visa"
    assert result.payment_account == "4242"

    booking = get_booking(session, result.booking_id)
    assert booking.total_amount == "100.00"  # charged amount, not Duffel's raw fare


def test_confirm_card_payment_not_succeeded_marks_failed(session, monkeypatch):
    """Confirming a PaymentIntent can 200 with a non-'succeeded' status -
    same lesson as Pesapal's status_code, a 2xx response alone doesn't
    mean the money moved."""
    payment = _pending_card_payment(session)

    async def fake_confirm_payment_intent(payment_intent_id):
        return {"data": {"status": "requires_payment_method"}}

    monkeypatch.setattr(
        duffel_flight_service, "confirm_payment_intent", fake_confirm_payment_intent
    )

    result = asyncio.run(confirm_card_payment(session, payment))

    assert result.status == PaymentStatus.FAILED
    assert result.booking_id is None
    assert "requires_payment_method" in result.failure_reason


def test_confirm_card_payment_is_idempotent_once_completed(session, monkeypatch):
    payment = _pending_card_payment(session)
    payment.status = PaymentStatus.COMPLETED
    session.add(payment)
    session.commit()

    calls = []

    async def fake_confirm_payment_intent(payment_intent_id):
        calls.append(payment_intent_id)
        return {"data": {"status": "succeeded"}}

    monkeypatch.setattr(
        duffel_flight_service, "confirm_payment_intent", fake_confirm_payment_intent
    )

    result = asyncio.run(confirm_card_payment(session, payment))

    assert result.status == PaymentStatus.COMPLETED
    assert calls == []  # never re-confirmed - the no-op guard short-circuited
