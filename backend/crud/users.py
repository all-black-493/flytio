import uuid
from datetime import datetime

from sqlmodel import Session, func, select
from backend.models.bookings import Booking
from backend.models.users import UserInDB
from backend.utils.security import hash_password


def get_user_by_email(session: Session, email: str):
    return session.exec(select(UserInDB).where(UserInDB.email == email)).first()


def get_users_by_ids(session: Session, user_ids: set[uuid.UUID]) -> list[UserInDB]:
    return list(session.exec(select(UserInDB).where(UserInDB.id.in_(user_ids))).all())


def _filtered_users_query(*, search: str | None = None):
    """Shared filter-building base for list_users/count_users, same
    pairing convention as crud/bookings.py's
    _filtered_user_bookings_query."""
    query = select(UserInDB)
    if search:
        query = query.where(func.lower(UserInDB.email).contains(search.lower()))
    return query


def list_users(
    session: Session, *, search: str | None = None, limit: int = 50, offset: int = 0
) -> list[UserInDB]:
    query = _filtered_users_query(search=search)
    query = query.order_by(UserInDB.created_at.desc()).offset(offset).limit(limit)
    return list(session.exec(query).all())


def count_users(session: Session, *, search: str | None = None) -> int:
    query = _filtered_users_query(search=search)
    count_query = select(func.count()).select_from(query.subquery())
    return session.exec(count_query).one()


def count_active_users(session: Session) -> int:
    """Distinct users with at least one Booking row (any status) - a
    real, defensible 'did this person actually buy something' signal,
    picked over a fuzzier 'recently logged in' metric flyt doesn't track
    anywhere (no last_seen_at field exists)."""
    query = select(func.count(func.distinct(Booking.user_id)))
    return session.exec(query).one()


def create_user(session: Session, email: str, password: str):
    hashed_password = hash_password(password)
    user = UserInDB(email=email, password=hashed_password)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def update_user_password(
    session: Session, user: UserInDB, new_password: str
) -> UserInDB:
    user.password = hash_password(new_password)
    user.password_changed_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def set_user_staff(session: Session, user: UserInDB, is_staff: bool) -> UserInDB:
    user.is_staff = is_staff
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def ban_user(
    session: Session, user: UserInDB, reason: str, banned_by: UserInDB
) -> UserInDB:
    """Blocks login and invalidates any active session (password_changed_at,
    same mechanism a password reset uses) - but unlike delete_user_account,
    never touches email/password, so it's fully reversible via unban_user
    and the account stays identifiable to support/other admins."""
    user.banned_at = datetime.utcnow()
    user.banned_reason = reason
    user.banned_by_user_id = banned_by.id
    user.password_changed_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def unban_user(session: Session, user: UserInDB) -> UserInDB:
    user.banned_at = None
    user.banned_reason = None
    user.banned_by_user_id = None
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def delete_user_account(session: Session, user: UserInDB) -> UserInDB:
    """Soft-deletes the account: scrubs identity (email/password) and
    marks it deleted, but never issues a real DELETE on this row -
    bookings/payments stay linked and intact for compliance/support (see
    models/users.py's deleted_at docstring, and models/bookings.py /
    models/payments.py's user_id ondelete="RESTRICT" backstop).

    Frees the real email for reuse (UserInDB.email is unique-indexed) and
    invalidates any other active session via password_changed_at, the
    same mechanism a password change uses."""
    user.email = f"deleted-{user.id}@flyt.africa"
    user.password = hash_password(uuid.uuid4().hex)
    user.deleted_at = datetime.utcnow()
    user.password_changed_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
