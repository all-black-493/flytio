"""Unit tests for crud/pricing.py (sales + discount codes) and the two
new utils/pricing.py functions they back - get_active_markup_rate and
apply_discount. See tests/test_pricing.py for the pre-existing markup/
seat/baggage math tests this file doesn't duplicate.
"""

import uuid
from datetime import datetime, timedelta

import pytest
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.crud.pricing import (
    create_discount_code,
    create_pricing_sale,
    redeem_discount_code,
    set_discount_code_active,
    validate_discount_code,
)
from backend.crud.users import create_user
from backend.utils.pricing import MARKUP_RATE, apply_discount, get_active_markup_rate

engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
SQLModel.metadata.create_all(engine)


@pytest.fixture
def session():
    with Session(engine) as session:
        yield session
        for table in reversed(SQLModel.metadata.sorted_tables):
            session.exec(table.delete())
        session.commit()


def _admin(session: Session):
    return create_user(session, email="pricing-admin@example.com", password="hashed")


# ---------- get_active_markup_rate ----------


def test_get_active_markup_rate_returns_default_when_no_sale(session):
    assert get_active_markup_rate(session) == MARKUP_RATE


def test_get_active_markup_rate_returns_sale_rate_when_active(session):
    admin = _admin(session)
    now = datetime.utcnow()
    create_pricing_sale(
        session,
        name="Black Friday",
        markup_rate=0.03,
        starts_at=now - timedelta(hours=1),
        ends_at=now + timedelta(hours=1),
        created_by=admin.id,
    )

    assert get_active_markup_rate(session) == 0.03


def test_get_active_markup_rate_ignores_past_and_future_sales(session):
    admin = _admin(session)
    now = datetime.utcnow()
    create_pricing_sale(
        session,
        name="Past sale",
        markup_rate=0.01,
        starts_at=now - timedelta(days=2),
        ends_at=now - timedelta(days=1),
        created_by=admin.id,
    )
    create_pricing_sale(
        session,
        name="Future sale",
        markup_rate=0.02,
        starts_at=now + timedelta(days=1),
        ends_at=now + timedelta(days=2),
        created_by=admin.id,
    )

    assert get_active_markup_rate(session) == MARKUP_RATE


# ---------- create_pricing_sale ----------


def test_create_pricing_sale_rejects_end_before_start(session):
    admin = _admin(session)
    now = datetime.utcnow()

    with pytest.raises(ValueError, match="ends_at must be after starts_at"):
        create_pricing_sale(
            session,
            name="Broken",
            markup_rate=0.03,
            starts_at=now,
            ends_at=now - timedelta(hours=1),
            created_by=admin.id,
        )


def test_create_pricing_sale_rejects_overlap(session):
    admin = _admin(session)
    now = datetime.utcnow()
    create_pricing_sale(
        session,
        name="First",
        markup_rate=0.03,
        starts_at=now,
        ends_at=now + timedelta(days=2),
        created_by=admin.id,
    )

    with pytest.raises(ValueError, match="Overlaps existing sale"):
        create_pricing_sale(
            session,
            name="Second",
            markup_rate=0.05,
            starts_at=now + timedelta(days=1),
            ends_at=now + timedelta(days=3),
            created_by=admin.id,
        )


def test_create_pricing_sale_allows_back_to_back_non_overlapping_windows(session):
    admin = _admin(session)
    now = datetime.utcnow()
    create_pricing_sale(
        session,
        name="First",
        markup_rate=0.03,
        starts_at=now,
        ends_at=now + timedelta(days=1),
        created_by=admin.id,
    )

    # Starts exactly when the first ends - not an overlap.
    second = create_pricing_sale(
        session,
        name="Second",
        markup_rate=0.05,
        starts_at=now + timedelta(days=1),
        ends_at=now + timedelta(days=2),
        created_by=admin.id,
    )
    assert second.name == "Second"


# ---------- apply_discount ----------


def test_apply_discount_normal_case():
    assert apply_discount("107.00", 10, floor_amount="93.46") == "96.30"


def test_apply_discount_floors_at_raw_fare():
    """A discount that would push the price below what flyt owes Duffel
    is capped there instead - flyt earns nothing on the booking, but
    never pays out of pocket."""
    assert apply_discount("107.00", 90, floor_amount="93.46") == "93.46"


# ---------- discount codes ----------


def test_create_discount_code_normalizes_case(session):
    admin = _admin(session)
    discount = create_discount_code(
        session,
        code="flyt10",
        discount_percentage=10,
        max_redemptions=None,
        expires_at=None,
        created_by=admin.id,
    )
    assert discount.code == "FLYT10"


def test_create_discount_code_rejects_duplicate_case_insensitively(session):
    admin = _admin(session)
    create_discount_code(
        session,
        code="FLYT10",
        discount_percentage=10,
        max_redemptions=None,
        expires_at=None,
        created_by=admin.id,
    )

    with pytest.raises(ValueError, match="already exists"):
        create_discount_code(
            session,
            code="flyt10",
            discount_percentage=15,
            max_redemptions=None,
            expires_at=None,
            created_by=admin.id,
        )


def test_validate_discount_code_rejects_unknown_code(session):
    with pytest.raises(ValueError, match="isn't a valid discount code"):
        validate_discount_code(session, "NOPE")


def test_validate_discount_code_rejects_inactive(session):
    admin = _admin(session)
    discount = create_discount_code(
        session,
        code="OFF20",
        discount_percentage=20,
        max_redemptions=None,
        expires_at=None,
        created_by=admin.id,
    )
    set_discount_code_active(session, discount, False)

    with pytest.raises(ValueError, match="no longer active"):
        validate_discount_code(session, "OFF20")


def test_validate_discount_code_rejects_expired(session):
    admin = _admin(session)
    create_discount_code(
        session,
        code="EXPIRED",
        discount_percentage=20,
        max_redemptions=None,
        expires_at=datetime.utcnow() - timedelta(days=1),
        created_by=admin.id,
    )

    with pytest.raises(ValueError, match="expired"):
        validate_discount_code(session, "EXPIRED")


def test_validate_discount_code_rejects_fully_redeemed(session):
    admin = _admin(session)
    create_discount_code(
        session,
        code="LIMITED",
        discount_percentage=20,
        max_redemptions=1,
        expires_at=None,
        created_by=admin.id,
    )
    redeem_discount_code(session, "LIMITED")

    with pytest.raises(ValueError, match="fully redeemed"):
        validate_discount_code(session, "LIMITED")


def test_redeem_discount_code_increments_count(session):
    admin = _admin(session)
    create_discount_code(
        session,
        code="COUNT5",
        discount_percentage=5,
        max_redemptions=None,
        expires_at=None,
        created_by=admin.id,
    )

    redeem_discount_code(session, "COUNT5")
    redeem_discount_code(session, "COUNT5")

    discount = validate_discount_code(session, "COUNT5")
    assert discount.times_redeemed == 2


def test_redeem_discount_code_is_a_noop_for_unknown_code(session):
    """Must never raise - a booking that already succeeded shouldn't be
    endangered by a code that's since been deleted."""
    redeem_discount_code(session, "GHOST" + uuid.uuid4().hex[:6])
