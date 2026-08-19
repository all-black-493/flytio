"""Tests for the air travel concierge (external_services/concierge.py,
routers/concierge.py). Deliberately never reads the real ambient
OPENAI_API_KEY - a developer's own backend/.env may or may not have a
real key in it, and these tests must pass (and never make a real,
billed OpenAI call) either way. `settings.OPENAI_API_KEY` is always
bpatched explicitly to whichever state each test needs, and the
"unconfigured" router path is exercised by patching
external_services.concierge.concierge_agent directly rather than
relying on that ambient state. The _offer_to_card mapping is tested
directly since it needs no LLM at all.
"""

import asyncio
from datetime import date, datetime

import pytest
from pydantic_ai import ModelRetry, RunContext
from pydantic_ai.models.test import TestModel
from pydantic_ai.usage import RunUsage
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.config import settings
from backend.crud.bookings import get_booking_by_reference
from backend.crud.db import get_session
from backend.external_services import concierge as concierge_service
from backend.external_services.flight import duffel_flight_service
from backend.external_services.concierge import (
    ConciergeDeps,
    _build_agent,
    _get_owned_booking_or_retry,
    _offer_to_card,
)
from backend.main import app
from backend.models.bookings import Booking, BookingSlice, BookingStatus
from backend.models.flights import Flight
from backend.models.users import UserInDB
from backend.schemas.duffel_flights import Offer
from backend.utils.security import create_access_token

# The 4 booking-management tools (get_my_booking, get_cancellation_quote,
# confirm_cancellation, search_change_options) are only registered as
# @concierge_agent.tool if concierge_agent itself was built - i.e. only
# if OPENAI_API_KEY was set in backend/.env at import time (see
# _build_agent's docstring). Tests that exercise them directly import the
# tool functions lazily (inside the test body, not at module top) and are
# skipped, not failed, on a machine/CI run without a real key - there's
# nothing to import in that case.
requires_concierge_agent = pytest.mark.skipif(
    concierge_service.concierge_agent is None,
    reason="requires OPENAI_API_KEY in backend/.env to construct concierge_agent",
)

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
SQLModel.metadata.create_all(engine)


def _override_get_session():
    with Session(engine) as session:
        yield session


@pytest.fixture
def db_client(api_client):
    app.dependency_overrides[get_session] = _override_get_session
    try:
        yield api_client
    finally:
        app.dependency_overrides.pop(get_session, None)


@pytest.fixture
def session():
    with Session(engine) as session:
        yield session
        for table in reversed(SQLModel.metadata.sorted_tables):
            session.exec(table.delete())
        session.commit()


def _make_user(session: Session, email: str = "concierge-user@example.com") -> UserInDB:
    user = UserInDB(email=email, password="hashed")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _make_booking(
    session: Session,
    user: UserInDB,
    *,
    status: BookingStatus = BookingStatus.CONFIRMED,
    booking_reference: str = "ABC123",
    duffel_order_id: str = "ord_test123",
) -> Booking:
    booking = Booking(
        user_id=user.id,
        duffel_order_id=duffel_order_id,
        booking_reference=booking_reference,
        status=status,
        total_amount="450.00",
        total_currency="USD",
    )
    session.add(booking)
    session.commit()
    session.refresh(booking)

    slice_ = BookingSlice(
        booking_id=booking.id,
        duffel_slice_id="sli_test123",
        origin_iata_code="NBO",
        destination_iata_code="DXB",
    )
    session.add(slice_)
    session.commit()
    session.refresh(slice_)

    session.add(
        Flight(
            slice_id=slice_.id,
            duffel_segment_id="seg_test123",
            origin_iata_code="NBO",
            destination_iata_code="DXB",
            departing_at=datetime(2026, 9, 1, 9, 0, 0),
            arriving_at=datetime(2026, 9, 1, 14, 10, 0),
        )
    )
    session.commit()
    session.refresh(booking)
    return booking


def _make_ctx(user: UserInDB) -> RunContext[ConciergeDeps]:
    """A RunContext with just enough substance for these tools - each of
    them only ever reads ctx.deps.user, never the model/usage machinery a
    real agent run would populate."""
    return RunContext(
        deps=ConciergeDeps(user=user), model=TestModel(), usage=RunUsage()
    )


def _sample_offer() -> Offer:
    return Offer.model_validate(
        {
            "id": "off_test123",
            "total_amount": "450.00",
            "total_currency": "USD",
            "owner": {
                "iata_code": "ZZ",
                "name": "Duffel Airways",
                "logo_symbol_url": "https://example.com/logo.svg",
            },
            "slices": [
                {
                    "id": "sli_test123",
                    "origin": {"iata_code": "NBO", "city_name": "Nairobi"},
                    "destination": {"iata_code": "DXB", "city_name": "Dubai"},
                    "duration": "PT5H10M",
                    "segments": [
                        {
                            "id": "seg_1",
                            "origin": {"iata_code": "NBO", "city_name": "Nairobi"},
                            "destination": {"iata_code": "DXB", "city_name": "Dubai"},
                            "departing_at": "2026-09-01T09:00:00",
                            "arriving_at": "2026-09-01T14:10:00",
                        }
                    ],
                }
            ],
        }
    )


def test_offer_to_card_maps_route_and_price():
    card = _offer_to_card(_sample_offer())

    assert card.offer_id == "off_test123"
    assert card.origin_iata_code == "NBO"
    assert card.origin_city_name == "Nairobi"
    assert card.destination_iata_code == "DXB"
    assert card.destination_city_name == "Dubai"
    assert card.stops == 0
    assert card.airline_name == "Duffel Airways"
    assert card.total_amount == "450.00"
    assert card.total_currency == "USD"


def test_offer_to_card_counts_stops_from_segments():
    offer = _sample_offer()
    offer.slices[0].segments.append(offer.slices[0].segments[0])

    card = _offer_to_card(offer)

    assert card.stops == 1


def test_build_agent_is_none_without_api_key(monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    assert _build_agent() is None


def test_build_agent_constructs_when_api_key_set(monkeypatch):
    """Construction alone (unlike .run()/.run_stream()) makes no network
    call, so this is safe to exercise directly without hitting OpenAI or
    depending on whether this machine's real .env happens to have a key."""
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test-not-real")
    assert _build_agent() is not None


def test_chat_is_open_to_signed_out_visitors(db_client, monkeypatch):
    """Anyone can ask the concierge about flights.

    The question a first-time visitor has - "what does NBO to DXB cost?" -
    is exactly the one a login wall would block, so this endpoint takes no
    credential. What signing in unlocks is acting on an answer, which the
    booking tools enforce themselves (see below).
    """
    monkeypatch.setattr(concierge_service, "concierge_agent", None)
    response = db_client.post("/api/v1/concierge/chat", json={"messages": []})
    # 503 because no agent is configured in tests - the point is that it is
    # NOT 401: the request got past auth.
    assert response.status_code == 503


def test_booking_tools_refuse_without_an_account():
    """The other half of the bargain: search is open, acting is not.

    _require_user raises ModelRetry rather than an exception that would end
    the run, so the agent relays "sign in to do this" as an answer instead
    of the whole reply failing.
    """
    from pydantic_ai import ModelRetry

    with pytest.raises(ModelRetry) as excinfo:
        concierge_service._require_user(None)
    assert "sign in" in str(excinfo.value).lower()


def test_require_user_passes_a_real_user_through(session):
    user = _make_user(session)
    assert concierge_service._require_user(user) is user


def test_chat_returns_503_when_unconfigured(session, db_client, monkeypatch):
    monkeypatch.setattr(concierge_service, "concierge_agent", None)
    user = _make_user(session)
    token = create_access_token(data={"sub": user.email, "purpose": "access"})

    response = db_client.post(
        "/api/v1/concierge/chat",
        json={"messages": []},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 503


def test_get_booking_by_reference_scoped_by_owner(session):
    user = _make_user(session)
    other = _make_user(session, email="someone-else@example.com")
    _make_booking(session, user)

    assert get_booking_by_reference(session, "ABC123", user.id) is not None
    assert get_booking_by_reference(session, "ABC123", other.id) is None
    assert get_booking_by_reference(session, "NOTREAL", user.id) is None


def test_get_owned_booking_or_retry_returns_booking(session):
    user = _make_user(session)
    booking = _make_booking(session, user)

    found = _get_owned_booking_or_retry(session, "ABC123", user)

    assert found.id == booking.id


def test_get_owned_booking_or_retry_raises_when_not_found(session):
    user = _make_user(session)

    with pytest.raises(ModelRetry):
        _get_owned_booking_or_retry(session, "NOPE", user)


@requires_concierge_agent
def test_get_my_booking_returns_summary(session, monkeypatch):
    from backend.external_services.concierge import get_my_booking

    monkeypatch.setattr(concierge_service, "engine", engine)
    user = _make_user(session)
    _make_booking(session, user)

    result = asyncio.run(get_my_booking(_make_ctx(user), "ABC123"))

    assert result.booking_reference == "ABC123"
    assert result.status == "confirmed"
    assert result.origin_iata_code == "NBO"
    assert result.destination_iata_code == "DXB"
    assert result.total_amount == "450.00"


@requires_concierge_agent
def test_get_my_booking_rejects_unowned_reference(session, monkeypatch):
    from backend.external_services.concierge import get_my_booking

    monkeypatch.setattr(concierge_service, "engine", engine)
    user = _make_user(session)

    with pytest.raises(ModelRetry):
        asyncio.run(get_my_booking(_make_ctx(user), "NOPE"))


@requires_concierge_agent
def test_get_cancellation_quote_returns_unconfirmed_quote(session, monkeypatch):
    from backend.external_services.concierge import get_cancellation_quote

    monkeypatch.setattr(concierge_service, "engine", engine)
    user = _make_user(session)
    _make_booking(session, user)

    async def fake_request_order_cancellation(order_id):
        assert order_id == "ord_test123"
        return {
            "data": {
                "id": "oc_test123",
                "refund_amount": "100.00",
                "refund_currency": "USD",
                "expires_at": "2026-08-01T00:00:00Z",
            }
        }

    monkeypatch.setattr(
        duffel_flight_service,
        "request_order_cancellation",
        fake_request_order_cancellation,
    )

    result = asyncio.run(get_cancellation_quote(_make_ctx(user), "ABC123"))

    assert result.cancellation_id == "oc_test123"
    assert result.refund_amount == "100.00"
    assert result.confirmed is False


@requires_concierge_agent
def test_get_cancellation_quote_rejects_already_cancelled(session, monkeypatch):
    from backend.external_services.concierge import get_cancellation_quote

    monkeypatch.setattr(concierge_service, "engine", engine)
    user = _make_user(session)
    _make_booking(session, user, status=BookingStatus.CANCELLED)

    with pytest.raises(ModelRetry):
        asyncio.run(get_cancellation_quote(_make_ctx(user), "ABC123"))


@requires_concierge_agent
def test_confirm_cancellation_marks_booking_cancelled(session, monkeypatch):
    from backend.external_services.concierge import confirm_cancellation

    monkeypatch.setattr(concierge_service, "engine", engine)
    user = _make_user(session)
    booking = _make_booking(session, user)

    async def fake_confirm_order_cancellation(cancellation_id):
        assert cancellation_id == "oc_test123"
        return {
            "data": {
                "id": "oc_test123",
                "refund_amount": "100.00",
                "refund_currency": "USD",
                "expires_at": "2026-08-01T00:00:00Z",
            }
        }

    monkeypatch.setattr(
        duffel_flight_service,
        "confirm_order_cancellation",
        fake_confirm_order_cancellation,
    )

    result = asyncio.run(confirm_cancellation(_make_ctx(user), "ABC123", "oc_test123"))

    assert result.confirmed is True
    session.refresh(booking)
    assert booking.status == BookingStatus.CANCELLED
    assert booking.cancelled_at is not None


@requires_concierge_agent
def test_confirm_cancellation_rejects_already_cancelled(session, monkeypatch):
    from backend.external_services.concierge import confirm_cancellation

    monkeypatch.setattr(concierge_service, "engine", engine)
    user = _make_user(session)
    _make_booking(session, user, status=BookingStatus.CANCELLED)

    with pytest.raises(ModelRetry):
        asyncio.run(confirm_cancellation(_make_ctx(user), "ABC123", "oc_test123"))


@requires_concierge_agent
def test_search_change_options_returns_priced_options(session, monkeypatch):
    from backend.external_services.concierge import search_change_options

    monkeypatch.setattr(concierge_service, "engine", engine)
    user = _make_user(session)
    _make_booking(session, user)

    async def fake_create_order_change_request(order_id, slices):
        assert order_id == "ord_test123"
        assert slices["remove"][0]["slice_id"] == "sli_test123"
        return {"data": {"id": "ocr_test123", "order_id": order_id, "live_mode": False}}

    async def fake_list_order_change_offers(order_change_request_id):
        assert order_change_request_id == "ocr_test123"
        return {
            "data": {
                "offers": [
                    {
                        "id": "oco_test123",
                        "change_total_amount": "50.00",
                        "change_total_currency": "USD",
                        "penalty_total_amount": "20.00",
                        "penalty_total_currency": "USD",
                    }
                ]
            }
        }

    monkeypatch.setattr(
        duffel_flight_service,
        "create_order_change_request",
        fake_create_order_change_request,
    )
    monkeypatch.setattr(
        duffel_flight_service, "list_order_change_offers", fake_list_order_change_offers
    )

    result = asyncio.run(
        search_change_options(
            _make_ctx(user), "ABC123", "NBO", "DXB", "NBO", "LHR", date(2026, 10, 1)
        )
    )

    assert len(result) == 1
    assert result[0].change_offer_id == "oco_test123"
    assert result[0].change_total_amount == "50.00"
    assert result[0].penalty_total_amount == "20.00"


@requires_concierge_agent
def test_search_change_options_rejects_unmatched_slice(session, monkeypatch):
    from backend.external_services.concierge import search_change_options

    monkeypatch.setattr(concierge_service, "engine", engine)
    user = _make_user(session)
    _make_booking(session, user)

    with pytest.raises(ModelRetry):
        asyncio.run(
            search_change_options(
                _make_ctx(user), "ABC123", "XXX", "YYY", "NBO", "LHR", date(2026, 10, 1)
            )
        )
