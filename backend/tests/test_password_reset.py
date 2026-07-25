"""Unit tests for the password-reset token machinery in utils/security.py,
including the purpose-claim fix that stops a reset token (or a normal
login token) from being usable as the other kind."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.crud.users import create_user, update_user_password
from backend.utils.security import (
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    create_password_reset_token,
    get_current_user,
    verify_password_reset_token,
)

engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
SQLModel.metadata.create_all(engine)


@pytest.fixture
def session():
    with Session(engine) as session:
        yield session
        for table in reversed(SQLModel.metadata.sorted_tables):
            session.exec(table.delete())
        session.commit()


def test_password_reset_token_round_trip():
    token = create_password_reset_token("jane@example.com")
    assert verify_password_reset_token(token) == "jane@example.com"


def test_expired_password_reset_token_rejected():
    token = create_access_token(
        data={"sub": "jane@example.com", "purpose": "password_reset"},
        expires_delta=timedelta(minutes=-1),
    )
    assert verify_password_reset_token(token) is None


def test_normal_access_token_rejected_as_reset_token():
    """A login token must not double as a password-reset token, even
    though both are otherwise valid, correctly-signed JWTs."""
    access_token = create_access_token(
        data={"sub": "jane@example.com", "purpose": "access"}
    )
    assert verify_password_reset_token(access_token) is None


def test_garbage_token_rejected():
    assert verify_password_reset_token("not-a-real-token") is None


def test_reset_token_cannot_authenticate_as_login_credential(session):
    """The actual security guarantee: a leaked password-reset token must
    not work as a bearer token against endpoints that require login."""
    create_user(session, email="jane@example.com", password="hunter2hunter2")
    reset_token = create_password_reset_token("jane@example.com")

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(token=reset_token, session=session)
    assert exc_info.value.status_code == 401


def test_access_token_still_authenticates(session):
    create_user(session, email="jane@example.com", password="hunter2hunter2")
    access_token = create_access_token(
        data={"sub": "jane@example.com", "purpose": "access"}
    )

    user = get_current_user(token=access_token, session=session)
    assert user.email == "jane@example.com"


def test_access_token_issued_before_password_reset_rejected(session):
    """The actual point of invalidating sessions on reset: a token minted
    before the reset must stop working, even though it's still a validly-
    signed, unexpired JWT - built by hand here (rather than via
    create_access_token) so its `iat` is deterministically in the past,
    instead of relying on a real sleep() between token creation and the
    reset to separate the two timestamps."""
    user = create_user(session, email="jane@example.com", password="hunter2hunter2")
    stale_token = jwt.encode(
        {
            "sub": user.email,
            "purpose": "access",
            "iat": datetime.now(timezone.utc) - timedelta(hours=1),
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )

    update_user_password(session, user, "newpassword456")

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(token=stale_token, session=session)
    assert exc_info.value.status_code == 401


def test_access_token_issued_after_password_reset_still_works(session):
    user = create_user(session, email="jane@example.com", password="hunter2hunter2")
    update_user_password(session, user, "newpassword456")
    fresh_token = create_access_token(data={"sub": user.email, "purpose": "access"})

    authed_user = get_current_user(token=fresh_token, session=session)
    assert authed_user.email == "jane@example.com"
