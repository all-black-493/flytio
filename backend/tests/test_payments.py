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
from sqlmodel import Session, SQLModel, create_engine, select

import backend.crud.payments as payments_module
import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.crud.bookings import get_booking
from backend.crud.pricing import create_discount_code, get_discount_code_by_code
from backend.crud.users import create_user
from backend.crud.payments import (
    confirm_card_payment,
    create_admin_booking,
    create_payment,
    finalize_payment,
    reconfirm_price_and_create_payment,
)
from backend.external_services.flight import DuffelAPIError, duffel_flight_service
from backend.external_services.payment import PesapalAPIError, pesapal_payment_service
from backend.models.bookings import BookingStatus, CabinClass
from backend.models.payments import PaymentProvider, PaymentStatus
from backend.models.tickets import Ticket
from backend.schemas.duffel_orders import OrderPassenger
from backend.schemas.payments import CheckoutRequest
from backend.schemas.pesapal import PesapalTransactionStatusResponse
from backend.utils.constants import KafkaEventTypes, KafkaTopics

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


_DEFAULT_FAKE_DOCUMENTS = [
    {
        "unique_identifier": "1234567890123",
        "type": "electronic_ticket",
        "passenger_ids": ["pas_test123"],
    }
]


def _fake_duffel_order(documents: list | None = None) -> dict:
    """Defaults to a non-empty `documents` list so callers that don't care
    about ticket-issuance timing (most tests) never hit _complete_booking's
    documents-empty retry path, which calls the real (unmocked, in these
    tests) get_flight_order - pass documents=[] explicitly to opt into
    that path, as test_finalize_payment_retries_and_picks_up_tickets_
    issued_late and test_finalize_payment_completes_even_if_tickets_never_
    arrive do."""
    return {
        "data": {
            "id": "ord_test123",
            "booking_reference": "ABC123",
            # Matches _pending_payment's duffel_amount ("93.46"), not its
            # (marked-up) amount ("100.00") - this is what Duffel actually
            # charges for the order it created.
            "total_amount": "93.46",
            "total_currency": "USD",
            "base_amount": "85.00",
            "base_currency": "USD",
            "tax_amount": "8.46",
            "tax_currency": "USD",
            "conditions": {
                "refund_before_departure": {"allowed": False},
                "change_before_departure": {
                    "allowed": True,
                    "penalty_amount": "50.00",
                    "penalty_currency": "USD",
                },
            },
            "slices": [
                {
                    "id": "sli_test123",
                    "origin": {"iata_code": "JFK"},
                    "destination": {"iata_code": "LHR"},
                    "segments": [
                        {
                            "id": "seg_test123",
                            "origin": {"iata_code": "JFK"},
                            "destination": {"iata_code": "LHR"},
                            "departing_at": "2026-01-01T10:00:00",
                            "arriving_at": "2026-01-01T22:00:00",
                            "passengers": [
                                {
                                    "passenger_id": "pas_test123",
                                    "baggages": [
                                        {"type": "checked", "quantity": 1},
                                        {"type": "carry_on", "quantity": 1},
                                    ],
                                    "cabin_class": "economy",
                                }
                            ],
                        }
                    ],
                }
            ],
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
            "documents": documents
            if documents is not None
            else _DEFAULT_FAKE_DOCUMENTS,
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

    # A Booking row only ever gets created after Duffel has actually
    # issued the order - it must never sit at the model's PENDING default.
    booking = get_booking(session, result.booking_id)
    assert booking.status == BookingStatus.CONFIRMED

    # base_amount stays the airline's genuine fare; the markup (charged
    # amount "100.00" minus Duffel's raw total "93.46") is folded into
    # tax_amount, so base + tax still sums to what the customer paid.
    assert booking.base_amount == "85.00"
    assert booking.tax_amount == "15.00"
    assert booking.refund_allowed is False
    assert booking.change_allowed is True
    assert booking.change_penalty_amount == "50.00"

    passenger = booking.passengers[0]
    assert passenger.checked_bags == 1
    assert passenger.carry_on_bags == 1
    assert passenger.cabin_class == CabinClass.ECONOMY


def test_finalize_payment_publishes_booking_confirmed(session, monkeypatch):
    payment = _pending_payment(session)

    async def fake_get_transaction_status(order_tracking_id):
        return PesapalTransactionStatusResponse(
            status_code=1, confirmation_code="conf_1"
        )

    async def fake_create_flight_order(order):
        return _fake_duffel_order()

    monkeypatch.setattr(
        pesapal_payment_service, "get_transaction_status", fake_get_transaction_status
    )
    monkeypatch.setattr(
        duffel_flight_service, "create_flight_order", fake_create_flight_order
    )

    published = []
    monkeypatch.setattr(
        payments_module.kafka_producer,
        "publish_event",
        lambda topic, event_type, data: published.append((topic, event_type, data)),
    )

    result = asyncio.run(finalize_payment(session, payment))

    assert len(published) == 1
    topic, event_type, data = published[0]
    assert topic == KafkaTopics.BOOKING_EVENTS
    assert event_type == KafkaEventTypes.BOOKING_CONFIRMED
    assert data == {
        "payment_id": result.id,
        "booking_id": result.booking_id,
        "user_id": result.user_id,
    }


def test_finalize_payment_publishes_booking_failed(session, monkeypatch):
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

    published = []
    monkeypatch.setattr(
        payments_module.kafka_producer,
        "publish_event",
        lambda topic, event_type, data: published.append((topic, event_type, data)),
    )

    result = asyncio.run(finalize_payment(session, payment))

    assert len(published) == 1
    topic, event_type, data = published[0]
    assert topic == KafkaTopics.BOOKING_EVENTS
    assert event_type == KafkaEventTypes.BOOKING_FAILED
    assert data["payment_id"] == result.id
    assert data["user_id"] == result.user_id
    assert "offer expired" in data["failure_reason"]


def test_finalize_payment_retries_and_picks_up_tickets_issued_late(
    session, monkeypatch
):
    """Duffel's own docs say ticketing can lag order creation - if the
    creation response comes back with no documents, _complete_booking
    should re-fetch the order rather than settling for zero tickets."""
    payment = _pending_payment(session)

    async def fake_get_transaction_status(order_tracking_id):
        return PesapalTransactionStatusResponse(
            status_code=1,
            confirmation_code="conf_1",
            payment_status_description="COMPLETED",
        )

    async def fake_create_flight_order(order):
        return _fake_duffel_order(documents=[])

    get_flight_order_calls = []

    async def fake_get_flight_order(order_id):
        get_flight_order_calls.append(order_id)
        # Ticket shows up on the first re-check.
        return _fake_duffel_order(
            documents=[
                {
                    "unique_identifier": "1234567890123",
                    "type": "electronic_ticket",
                    "passenger_ids": ["pas_test123"],
                }
            ]
        )

    monkeypatch.setattr(
        pesapal_payment_service, "get_transaction_status", fake_get_transaction_status
    )
    monkeypatch.setattr(
        duffel_flight_service, "create_flight_order", fake_create_flight_order
    )
    monkeypatch.setattr(
        duffel_flight_service, "get_flight_order", fake_get_flight_order
    )
    monkeypatch.setattr("backend.crud.payments._TICKETING_CONFIRM_DELAY_SECONDS", 0)

    result = asyncio.run(finalize_payment(session, payment))

    assert result.status == PaymentStatus.COMPLETED
    assert get_flight_order_calls == ["ord_test123"]
    booking = get_booking(session, result.booking_id)
    tickets = [t for p in booking.passengers for t in p.tickets] + list(
        session.exec(select(Ticket).where(Ticket.booking_id == booking.id))
    )
    assert any(t.ticket_number == "1234567890123" for t in tickets)


def test_finalize_payment_completes_even_if_tickets_never_arrive(session, monkeypatch):
    """If Duffel still hasn't issued documents after every retry, the
    booking still completes (the order is genuinely paid and confirmed) -
    it just ends up with zero Ticket rows rather than blocking forever."""
    payment = _pending_payment(session)

    async def fake_get_transaction_status(order_tracking_id):
        return PesapalTransactionStatusResponse(
            status_code=1,
            confirmation_code="conf_1",
            payment_status_description="COMPLETED",
        )

    async def fake_create_flight_order(order):
        return _fake_duffel_order(documents=[])

    get_flight_order_calls = []

    async def fake_get_flight_order(order_id):
        get_flight_order_calls.append(order_id)
        return _fake_duffel_order(documents=[])

    monkeypatch.setattr(
        pesapal_payment_service, "get_transaction_status", fake_get_transaction_status
    )
    monkeypatch.setattr(
        duffel_flight_service, "create_flight_order", fake_create_flight_order
    )
    monkeypatch.setattr(
        duffel_flight_service, "get_flight_order", fake_get_flight_order
    )
    monkeypatch.setattr("backend.crud.payments._TICKETING_CONFIRM_DELAY_SECONDS", 0)

    result = asyncio.run(finalize_payment(session, payment))

    assert result.status == PaymentStatus.COMPLETED
    assert len(get_flight_order_calls) == 3
    booking = get_booking(session, result.booking_id)
    assert (
        list(session.exec(select(Ticket).where(Ticket.booking_id == booking.id))) == []
    )


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


def test_finalize_payment_sends_seat_choice_as_a_duffel_service(session, monkeypatch):
    """A passenger's seat_service_id (the ase_... id of the seat they
    picked in our seat-map UI) must reach Duffel as a paid service on the
    order - not as a passenger field, which Duffel doesn't recognize - so
    the airline actually holds the seat rather than it being local-only
    bookkeeping."""
    checkout = CheckoutRequest(
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
                seat_designator="14C",
                seat_service_id="ase_test1",
            )
        ],
    )
    payment = create_payment(
        session,
        uuid.uuid4(),
        checkout,
        amount="100.00",
        duffel_amount="93.46",
        currency="USD",
    )
    payment.pesapal_order_tracking_id = "track_123"
    session.add(payment)
    session.commit()
    session.refresh(payment)

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

    asyncio.run(finalize_payment(session, payment))

    assert len(captured_order_requests) == 1
    sent = captured_order_requests[0]
    assert sent["services"] == [{"id": "ase_test1", "quantity": 1}]
    sent_passenger = sent["passengers"][0]
    assert "seat_service_id" not in sent_passenger
    assert "seat_designator" not in sent_passenger


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


def _fake_priced_offer() -> dict:
    """Matches _fake_duffel_order's total_amount/currency ("93.46"/"USD")
    so create_admin_booking's two Duffel calls (price re-confirm, then
    order creation) agree on what the raw fare actually is."""
    return {
        "data": {
            "total_amount": "93.46",
            "total_currency": "USD",
            "passenger_identity_documents_required": False,
            "available_services": [],
        }
    }


def test_create_admin_booking_completes_without_real_payment_collection(
    session, monkeypatch
):
    """The point of this whole function: no Pesapal/Duffel Payments call
    anywhere in this path - just a price re-confirm and straight to
    _complete_booking, same as every other provider once its own money-
    confirmation step has passed."""
    admin_user_id = uuid.uuid4()
    customer_user_id = uuid.uuid4()

    async def fake_confirm_price(offer_id):
        assert offer_id == "off_test123"
        return _fake_priced_offer()

    async def fake_create_flight_order(order):
        return _fake_duffel_order()

    monkeypatch.setattr(duffel_flight_service, "confirm_price", fake_confirm_price)
    monkeypatch.setattr(
        duffel_flight_service, "create_flight_order", fake_create_flight_order
    )

    result = asyncio.run(
        create_admin_booking(session, customer_user_id, _checkout_request())
    )

    assert result.status == PaymentStatus.COMPLETED
    assert result.provider == PaymentProvider.ADMIN
    assert result.user_id == customer_user_id
    assert result.booking_id is not None

    booking = get_booking(session, result.booking_id)
    assert booking.user_id == customer_user_id
    assert booking.status == BookingStatus.CONFIRMED
    # Not the admin who created it - the customer it was created for.
    assert booking.user_id != admin_user_id


def test_create_admin_booking_booking_failed_when_duffel_errors(session, monkeypatch):
    async def fake_confirm_price(offer_id):
        return _fake_priced_offer()

    async def fake_create_flight_order(order):
        raise DuffelAPIError(422, [{"message": "offer expired"}])

    monkeypatch.setattr(duffel_flight_service, "confirm_price", fake_confirm_price)
    monkeypatch.setattr(
        duffel_flight_service, "create_flight_order", fake_create_flight_order
    )

    result = asyncio.run(
        create_admin_booking(session, uuid.uuid4(), _checkout_request())
    )

    assert result.status == PaymentStatus.BOOKING_FAILED
    assert result.booking_id is None
    assert "offer expired" in result.failure_reason


def _checkout_request_with_discount(code: str) -> CheckoutRequest:
    request = _checkout_request()
    request.discount_code = code
    return request


def test_reconfirm_price_and_create_payment_applies_valid_discount_code(
    session, monkeypatch
):
    admin = create_user(session, email="pricing-admin2@example.com", password="hashed")
    create_discount_code(
        session,
        code="SAVE3",
        discount_percentage=3,
        max_redemptions=None,
        expires_at=None,
        created_by=admin.id,
    )

    async def fake_confirm_price(offer_id):
        return _fake_priced_offer()

    monkeypatch.setattr(duffel_flight_service, "confirm_price", fake_confirm_price)

    payment = asyncio.run(
        reconfirm_price_and_create_payment(
            session,
            uuid.uuid4(),
            _checkout_request_with_discount("save3"),
            PaymentProvider.PESAPAL,
        )
    )

    # 93.46 raw -> marked up to 100.00 (7% margin) -> 3% off -> 97.00
    # (well above the 93.46 floor, so this exercises the normal,
    # non-flooring path - see the floor test below for the other one)
    assert payment.amount == "97.00"
    assert payment.discount_code == "SAVE3"


def test_reconfirm_price_and_create_payment_floors_discount_at_raw_fare(
    session, monkeypatch
):
    """A 7% markup leaves very little room: any discount bigger than
    ~6.5% off the marked-up total would otherwise push the charge below
    what flyt owes Duffel - this confirms that floor is enforced at the
    real checkout call site, not just in apply_discount's own unit test."""
    admin = create_user(session, email="pricing-admin4@example.com", password="hashed")
    create_discount_code(
        session,
        code="SAVE10",
        discount_percentage=10,
        max_redemptions=None,
        expires_at=None,
        created_by=admin.id,
    )

    async def fake_confirm_price(offer_id):
        return _fake_priced_offer()

    monkeypatch.setattr(duffel_flight_service, "confirm_price", fake_confirm_price)

    payment = asyncio.run(
        reconfirm_price_and_create_payment(
            session,
            uuid.uuid4(),
            _checkout_request_with_discount("save10"),
            PaymentProvider.PESAPAL,
        )
    )

    # 100.00 * 0.9 = 90.00 would be below the 93.46 raw fare, so it's
    # floored there instead - flyt earns nothing on this booking, but
    # never charges less than it owes Duffel.
    assert payment.amount == "93.46"


def test_reconfirm_price_and_create_payment_rejects_invalid_discount_code(
    session, monkeypatch
):
    async def fake_confirm_price(offer_id):
        return _fake_priced_offer()

    monkeypatch.setattr(duffel_flight_service, "confirm_price", fake_confirm_price)

    with pytest.raises(ValueError, match="isn't a valid discount code"):
        asyncio.run(
            reconfirm_price_and_create_payment(
                session,
                uuid.uuid4(),
                _checkout_request_with_discount("NOPE"),
                PaymentProvider.PESAPAL,
            )
        )


def test_finalize_payment_redeems_discount_code_on_completion(session, monkeypatch):
    """The point of deferring redemption to _complete_booking: a code's
    times_redeemed only increments once the booking actually completes,
    not the moment checkout starts."""
    admin = create_user(session, email="pricing-admin3@example.com", password="hashed")
    create_discount_code(
        session,
        code="REDEEMME",
        discount_percentage=5,
        max_redemptions=None,
        expires_at=None,
        created_by=admin.id,
    )

    async def fake_confirm_price(offer_id):
        return _fake_priced_offer()

    monkeypatch.setattr(duffel_flight_service, "confirm_price", fake_confirm_price)

    payment = asyncio.run(
        reconfirm_price_and_create_payment(
            session,
            uuid.uuid4(),
            _checkout_request_with_discount("REDEEMME"),
            PaymentProvider.PESAPAL,
        )
    )
    payment.pesapal_order_tracking_id = "track_discount"
    session.add(payment)
    session.commit()
    session.refresh(payment)

    discount_before = get_discount_code_by_code(session, "REDEEMME")
    assert discount_before.times_redeemed == 0

    async def fake_get_transaction_status(order_tracking_id):
        return PesapalTransactionStatusResponse(
            status_code=1, confirmation_code="conf_discount"
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
    discount_after = get_discount_code_by_code(session, "REDEEMME")
    assert discount_after.times_redeemed == 1
