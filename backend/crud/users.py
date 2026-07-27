import uuid
from datetime import datetime

from sqlmodel import Session, select
from backend.models.users import UserInDB
from backend.utils.security import hash_password


def get_user_by_email(session: Session, email: str):
    return session.exec(select(UserInDB).where(UserInDB.email == email)).first()


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


def delete_user_account(session: Session, user: UserInDB) -> UserInDB:
    """Soft-deletes the account: scrubs identity (email/password) and
    marks it deleted, but never issues a real DELETE on this row -
    bookings/payments stay linked and intact for compliance/support (see
    models/users.py's deleted_at docstring, and models/bookings.py /
    models/payments.py's user_id ondelete="RESTRICT" backstop).

    Frees the real email for reuse (UserInDB.email is unique-indexed) and
    invalidates any other active session via password_changed_at, the
    same mechanism a password change uses."""
    user.email = f"deleted-{user.id}@flyt.io"
    user.password = hash_password(uuid.uuid4().hex)
    user.deleted_at = datetime.utcnow()
    user.password_changed_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
