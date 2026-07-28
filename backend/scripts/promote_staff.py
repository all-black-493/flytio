"""One-off setup: flips is_staff (and optionally is_superuser) on an
*existing* account - register normally via POST /api/register/ first.
Mirrors Django's createsuperuser, but only promotes rather than also
creating the account, since registration already exists and there's no
reason to duplicate its password-hashing/email-validation.

There's no admin UI to do this from yet (this script IS the bootstrap
step) - run once per environment for whoever needs staff/superuser
access:

    python -m backend.scripts.promote_staff --email you@example.com --superuser
    python -m backend.scripts.promote_staff --email agent@example.com --staff
"""

import argparse

from sqlmodel import Session

from backend.crud.db import engine
from backend.crud.users import get_user_by_email


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument(
        "--staff", action="store_true", help="Grant is_staff (admin-surface access)."
    )
    parser.add_argument(
        "--superuser",
        action="store_true",
        help="Grant is_superuser (implies --staff and every permission).",
    )
    args = parser.parse_args()

    if not args.staff and not args.superuser:
        parser.error("Pass --staff and/or --superuser.")

    with Session(engine) as session:
        user = get_user_by_email(session, args.email)
        if user is None:
            parser.error(f"No account found for {args.email} - register it first.")

        user.is_staff = user.is_staff or args.staff or args.superuser
        user.is_superuser = user.is_superuser or args.superuser
        session.add(user)
        session.commit()
        # Read these before the session (and its `with` block) closes -
        # commit() expires every attribute by default, and accessing them
        # afterwards raises DetachedInstanceError.
        is_staff, is_superuser = user.is_staff, user.is_superuser

    print(f"{args.email}: is_staff={is_staff}, is_superuser={is_superuser}")


if __name__ == "__main__":
    main()
