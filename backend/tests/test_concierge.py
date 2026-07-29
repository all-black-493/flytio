"""Tests for the air travel concierge (external_services/concierge.py,
routers/concierge.py). Deliberately never reads the real ambient
OPENAI_API_KEY - a developer's own backend/.env may or may not have a
real key in it, and these tests must pass (and never make a real,
billed OpenAI call) either way. `settings.OPENAI_API_KEY` is always
monkeypatched explicitly to whichever state each test needs, and the
"unconfigured" router path is exercised by patching
external_services.concierge.concierge_agent directly rather than
relying on that ambient state. The _offer_to_card mapping is tested
directly since it needs no LLM at all.
"""

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.config import settings
from backend.crud.db import get_session
from backend.external_services import concierge as concierge_service
from backend.external_services.concierge import _build_agent, _offer_to_card
from backend.main import app
from backend.models.users import UserInDB
from backend.schemas.duffel_flights import Offer
from backend.utils.security import create_access_token

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


def _make_user(session: Session) -> UserInDB:
    user = UserInDB(email="concierge-user@example.com", password="hashed")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


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


def test_chat_rejects_unauthenticated(db_client):
    response = db_client.post("/concierge/chat", json={"messages": []})
    assert response.status_code == 401


def test_chat_returns_503_when_unconfigured(session, db_client, monkeypatch):
    monkeypatch.setattr(concierge_service, "concierge_agent", None)
    user = _make_user(session)
    token = create_access_token(data={"sub": user.email, "purpose": "access"})

    response = db_client.post(
        "/concierge/chat",
        json={"messages": []},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 503
