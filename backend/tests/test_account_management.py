"""Unit tests for self-service password change and account deletion
(crud/users.py's update_user_password/delete_user_account, and the
deleted_at rejection in utils/security.py).

The one property that actually matters for delete_user_account: booking
and payment history must survive completely untouched - see
models/bookings.py / models/payments.py's user_id ondelete="RESTRICT"
and the plan's whole reasoning for soft-deleting instead of a real
DELETE. Confirmed here by creating real Booking/Payment rows, deleting
the account, and asserting those rows are still there afterwards.
"""

from datetime import date

import pytest
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.crud.payments import create_payment
from backend.crud.users import create_user, delete_user_account, get_user_by_email
from backend.models.bookings import Booking, BookingStatus
from backend.schemas.duffel_flights import OrderPassenger
from backend.schemas.payments import CheckoutRequest
from backend.utils.security import authenticate_user, get_current_user, verify_password
from backend.utils.security import create_access_token
from fastapi import HTTPException

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


def test_delete_user_account_scrubs_identity(session: Session):
    user = create_user(session, email="jane@example.com", password="hunter2hunter2")
    original_id = user.id

    deleted = delete_user_account(session, user)

    assert deleted.id == original_id  # same row, not a new one
    assert deleted.email != "jane@example.com"
    assert deleted.deleted_at is not None
    assert not verify_password("hunter2hunter2", deleted.password)


def test_delete_user_account_preserves_bookings_and_payments(session: Session):
    """The actual point of soft-deleting: booking/payment rows must
    survive, still linked to the (now-anonymized) user row."""
    user = create_user(session, email="jane@example.com", password="hunter2hunter2")
    user_id = user.id

    booking = Booking(
        user_id=user_id,
        duffel_order_id="ord_test123",
        booking_reference="ABC123",
        status=BookingStatus.CONFIRMED,
        total_amount="100.00",
        total_currency="USD",
    )
    session.add(booking)
    session.commit()
    session.refresh(booking)

    payment = create_payment(
        session,
        user_id,
        _checkout_request(),
        amount="100.00",
        duffel_amount="93.46",
        currency="USD",
    )

    delete_user_account(session, user)

    session.expire_all()
    surviving_booking = session.get(Booking, booking.id)
    assert surviving_booking is not None
    assert surviving_booking.user_id == user_id
    assert surviving_booking.booking_reference == "ABC123"

    from backend.crud.payments import get_payment

    surviving_payment = get_payment(session, payment.id)
    assert surviving_payment is not None
    assert surviving_payment.user_id == user_id


def test_deleted_account_cannot_authenticate(session: Session):
    user = create_user(session, email="jane@example.com", password="hunter2hunter2")
    delete_user_account(session, user)

    assert authenticate_user(session, "jane@example.com", "hunter2hunter2") is False


def test_deleted_account_token_rejected_by_get_current_user(session: Session):
    """A token issued before deletion must stop working too - not just
    fresh logins (which already fail since the email is scrubbed)."""
    user = create_user(session, email="jane@example.com", password="hunter2hunter2")
    token = create_access_token(data={"sub": user.email, "purpose": "access"})

    delete_user_account(session, user)

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(token=token, session=session)
    assert exc_info.value.status_code == 401


def test_deleted_email_is_free_for_reuse(session: Session):
    user = create_user(session, email="jane@example.com", password="hunter2hunter2")
    delete_user_account(session, user)

    new_user = create_user(session, email="jane@example.com", password="differentpass1")
    assert new_user.id != user.id
    assert get_user_by_email(session, "jane@example.com").id == new_user.id
