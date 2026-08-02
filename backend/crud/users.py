import uuid
from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, func, select
from backend.models.bookings import Booking
from backend.models.users import UserInDB
from backend.utils.security import hash_password


class OAuthEmailConflictError(Exception):
    """Raised by get_or_create_oauth_user - see its docstring."""


def get_user_by_email(session: Session, email: str):
    return session.exec(select(UserInDB).where(UserInDB.email == email)).first()


def get_user_by_oauth_id(
    session: Session, provider: str, oauth_id: str
) -> UserInDB | None:
    return session.exec(
        select(UserInDB).where(
            UserInDB.oauth_provider == provider, UserInDB.oauth_id == oauth_id
        )
    ).first()


def link_oauth_to_user(
    session: Session, user: UserInDB, provider: str, oauth_id: str
) -> UserInDB:
    user.oauth_provider = provider
    user.oauth_id = oauth_id
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def create_oauth_user(
    session: Session, *, email: str, provider: str, oauth_id: str
) -> UserInDB:
    user = UserInDB(
        email=email, password=None, oauth_provider=provider, oauth_id=oauth_id
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def get_or_create_oauth_user(
    session: Session,
    *,
    provider: str,
    oauth_id: str,
    email: str,
    email_verified: bool,
) -> UserInDB:
    """Finds the account this OAuth login belongs to, or creates one.

    Priority: (1) an account already linked to this exact provider
    identity - the common case on every login after the first; (2) an
    existing password account with the same, provider-verified email -
    auto-linked so someone who registered with email/password doesn't end
    up with two separate accounts just because they later used "Sign in
    with Google". Only case (2) touches email_verified - Google is
    trustworthy here (it never reports an unverified email as verified),
    this check is defense in depth against ever reusing this generically
    for a less trustworthy provider later. (3) otherwise, a brand new
    account.

    Raises OAuthEmailConflictError if the email already belongs to
    another account but wasn't verified by the provider - it can't be
    auto-linked (case 2 requires verification) and it can't become a
    second account either (UserInDB.email is unique), so this is a real
    dead end the caller must surface, not silently swallow.
    """
    user = get_user_by_oauth_id(session, provider, oauth_id)
    if user is not None:
        return user

    if email_verified:
        existing = get_user_by_email(session, email)
        if existing is not None:
            return link_oauth_to_user(session, existing, provider, oauth_id)
    elif get_user_by_email(session, email) is not None:
        raise OAuthEmailConflictError(
            f"{email} is already registered, but the provider didn't report "
            f"this login's email as verified"
        )

    try:
        return create_oauth_user(
            session, email=email, provider=provider, oauth_id=oauth_id
        )
    except IntegrityError:
        # Two concurrent first-time logins for the same brand-new Google
        # account (double-click, two tabs) both got past the lookup above
        # before either committed - the uq_user_oauth_identity constraint
        # (models/users.py) let exactly one INSERT through. The other
        # request's row now exists; use it instead of failing the login.
        session.rollback()
        user = get_user_by_oauth_id(session, provider, oauth_id)
        if user is None:
            raise
        return user


def get_users_by_ids(session: Session, user_ids: set[uuid.UUID]) -> list[UserInDB]:
    return list(session.exec(select(UserInDB).where(UserInDB.id.in_(user_ids))).all())


def _filtered_users_query(*, search: str | None = None):
    """Shared filter-building base for users_query/count_users, so the
    listing and the count always agree on which rows match - same pairing
    convention as crud/bookings.py's _filtered_user_bookings_query."""
    query = select(UserInDB)
    if search:
        query = query.where(func.lower(UserInDB.email).contains(search.lower()))
    return query


def users_query(*, search: str | None = None):
    """Ordered statement behind GET /api/admin/users - see
    crud/bookings.py's user_bookings_query for why id joins the ordering
    (keyset pagination needs a total order, and created_at isn't unique)."""
    return _filtered_users_query(search=search).order_by(
        UserInDB.created_at.desc(), UserInDB.id.desc()
    )


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
