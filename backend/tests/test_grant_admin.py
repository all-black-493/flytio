"""The first admin cannot be granted through the admin surface.

Every route in routers/admin.py is behind require_staff, so the account
doing the granting would have to be staff already.
"""

import uuid

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 - registers every table
from backend.models.users import UserInDB
from backend.scripts.grant_admin import grant_admin


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def _user(session, email: str, **kwargs) -> UserInDB:
    user = UserInDB(id=uuid.uuid4(), email=email, hashed_password="x", **kwargs)
    session.add(user)
    session.commit()
    return user


def test_an_ordinary_user_becomes_a_full_admin(session):
    user = _user(session, "someone@example.com")
    assert not user.is_staff and not user.is_superuser

    assert grant_admin(session, "someone@example.com") is True

    session.refresh(user)
    # Both, because they answer different questions: staff alone reaches
    # the admin surface and is refused by every permission check on it.
    assert user.is_staff
    assert user.is_superuser


def test_granting_twice_changes_nothing(session):
    _user(session, "someone@example.com")
    assert grant_admin(session, "someone@example.com") is True
    assert grant_admin(session, "someone@example.com") is False


def test_staff_without_superuser_is_completed(session):
    """The half-granted case: reaches the surface, refused by every check."""
    user = _user(session, "half@example.com", is_staff=True)

    assert grant_admin(session, "half@example.com") is True

    session.refresh(user)
    assert user.is_superuser


def test_an_unknown_email_is_an_error_not_a_silent_no_op(session):
    with pytest.raises(LookupError):
        grant_admin(session, "nobody@example.com")
