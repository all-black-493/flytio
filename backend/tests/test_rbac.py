"""Unit tests for permission resolution and seeding (utils/rbac.py) -
same in-memory SQLite session fixture pattern as
tests/test_account_management.py.
"""

import pytest
from sqlmodel import Session, SQLModel, create_engine, select

import backend.models  # noqa: F401 - registers all tables on SQLModel.metadata
from backend.models.rbac import (
    Group,
    GroupPermission,
    Permission,
    UserGroup,
    UserPermission,
)
from backend.models.users import UserInDB
from backend.utils.rbac import (
    ACTIONS,
    MANAGED_MODELS,
    has_perm,
    has_perms,
    seed_permissions,
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


def _user(session: Session, **overrides) -> UserInDB:
    user = UserInDB(email="staffer@example.com", password="hashed", **overrides)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_seed_permissions_creates_default_set(session: Session):
    created = seed_permissions(session)

    assert len(created) == len(MANAGED_MODELS) * len(ACTIONS)
    assert {p.codename for p in created} >= {
        "view_booking",
        "change_payment",
        "delete_ticket",
    }


def test_seed_permissions_is_idempotent(session: Session):
    seed_permissions(session)
    second_run = seed_permissions(session)

    assert second_run == []
    all_codenames = session.exec(select(Permission.codename)).all()
    assert (
        len(all_codenames)
        == len(set(all_codenames))
        == len(MANAGED_MODELS) * len(ACTIONS)
    )


def test_superuser_has_every_permission_without_any_grant(session: Session):
    user = _user(session, is_superuser=True)

    assert has_perm(session, user, "view_booking") is True
    assert has_perm(session, user, "anything_not_even_a_real_permission") is True


def test_user_without_any_grant_has_no_permission(session: Session):
    user = _user(session)

    assert has_perm(session, user, "view_booking") is False


def test_direct_user_permission_grant(session: Session):
    user = _user(session)
    permission = Permission(
        codename="view_booking", name="Can view booking", content_type="booking"
    )
    session.add(permission)
    session.commit()
    session.refresh(permission)

    session.add(UserPermission(user_id=user.id, permission_id=permission.id))
    session.commit()

    assert has_perm(session, user, "view_booking") is True
    assert has_perm(session, user, "change_booking") is False


def test_group_permission_grant(session: Session):
    user = _user(session)
    group = Group(name="support")
    permission = Permission(
        codename="view_booking", name="Can view booking", content_type="booking"
    )
    session.add(group)
    session.add(permission)
    session.commit()
    session.refresh(group)
    session.refresh(permission)

    session.add(UserGroup(user_id=user.id, group_id=group.id))
    session.add(GroupPermission(group_id=group.id, permission_id=permission.id))
    session.commit()

    assert has_perm(session, user, "view_booking") is True


def test_has_perms_requires_every_permission(session: Session):
    user = _user(session)
    view = Permission(
        codename="view_booking", name="Can view booking", content_type="booking"
    )
    session.add(view)
    session.commit()
    session.refresh(view)
    session.add(UserPermission(user_id=user.id, permission_id=view.id))
    session.commit()

    assert has_perms(session, user, ["view_booking"]) is True
    assert has_perms(session, user, ["view_booking", "change_booking"]) is False
