"""Promotes a user to full admin, by email.

    python -m backend.scripts.grant_admin someone@example.com

Exists because the admin surface cannot grant the first admin: every
route in routers/admin.py is behind require_staff, so the account that
would do the granting has to be staff already. Django solves this with
createsuperuser; this is the same idea against an account that already
exists.

Sets both flags, because they answer different questions (utils/rbac.py):
is_staff is "may reach the admin surface at all" and is_superuser is
"implicitly has every permission". Staff alone reaches the admin surface
and is refused by every permission check on it.

Idempotent: a user who already has both is left alone and reported.
"""

import sys

from sqlmodel import Session, create_engine, select

from backend.config import settings
from backend.models.users import UserInDB
from backend.utils.log_manager import get_app_logger

logger = get_app_logger(__name__)


def grant_admin(session: Session, email: str) -> bool:
    """Returns whether anything changed."""
    user = session.exec(select(UserInDB).where(UserInDB.email == email)).first()
    if user is None:
        raise LookupError(f"No user with email {email!r}")

    if user.is_staff and user.is_superuser:
        logger.info("%s is already a full admin - nothing to do", email)
        return False

    user.is_staff = True
    user.is_superuser = True
    session.add(user)
    session.commit()
    logger.info("Granted is_staff and is_superuser to %s", email)
    return True


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        return 2

    engine = create_engine(settings.migration_database_url)
    try:
        with Session(engine) as session:
            grant_admin(session, sys.argv[1])
    except LookupError as e:
        logger.error("%s", e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
