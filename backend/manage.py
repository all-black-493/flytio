"""flyt's manage.py - a Django-style CLI for one-off admin/staff account
tasks, built with Typer since there's no Django management-command
framework in this stack. Run via:

    uv run python manage.py --help
    uv run python manage.py createsuperuser --email you@example.com
    uv run python manage.py promote --email agent@example.com --staff

Scoped to account provisioning only (creating/promoting staff and
superuser accounts) - it isn't a general-purpose scripts replacement;
backend/scripts/ still holds one-off tasks unrelated to account roles
(seed_permissions, backfill_destination_images, webhook registration).
"""

import sys
from pathlib import Path

# Run directly as `python manage.py ...` (not `python -m backend...`), so
# the `backend` package - one directory up, since this file lives inside
# the package it imports from - isn't on sys.path by default the way it
# is under pytest's own rootdir insertion.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import typer
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlmodel import Session

from backend.crud.db import engine
from backend.crud.users import create_user, get_user_by_email

app = typer.Typer(
    help="flyt admin CLI - account/staff provisioning.", no_args_is_help=True
)

_email_adapter = TypeAdapter(EmailStr)
MIN_PASSWORD_LENGTH = 8


def _validated_email(email: str) -> str:
    try:
        return _email_adapter.validate_python(email)
    except ValidationError:
        typer.secho(f"'{email}' isn't a valid email address.", fg=typer.colors.RED)
        raise typer.Exit(code=1)


@app.command()
def createsuperuser(
    email: str = typer.Option(..., prompt=True),
    password: str = typer.Option(
        ..., prompt=True, hide_input=True, confirmation_prompt=True
    ),
) -> None:
    """Create a brand-new account with is_staff and is_superuser both set.

    Mirrors Django's createsuperuser, but only for a fresh account -
    to promote an account that already registered via POST
    /api/register/, use `promote` instead.
    """
    email = _validated_email(email)
    if len(password) < MIN_PASSWORD_LENGTH:
        typer.secho(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters.",
            fg=typer.colors.RED,
        )
        raise typer.Exit(code=1)

    with Session(engine) as session:
        if get_user_by_email(session, email) is not None:
            typer.secho(f"An account already exists for {email}.", fg=typer.colors.RED)
            raise typer.Exit(code=1)

        user = create_user(session, email=email, password=password)
        user.is_staff = True
        user.is_superuser = True
        session.add(user)
        session.commit()

    typer.secho(f"Superuser created: {email}", fg=typer.colors.GREEN)


@app.command()
def promote(
    email: str = typer.Option(..., prompt=True),
    staff: bool = typer.Option(
        False, "--staff", help="Grant is_staff (admin-surface access)."
    ),
    superuser: bool = typer.Option(
        False,
        "--superuser",
        help="Grant is_superuser (implies --staff and every permission).",
    ),
) -> None:
    """Promote an EXISTING account to staff and/or superuser.

    The account must already exist - register it first via POST
    /api/register/, then run this to grant elevated access.
    """
    if not staff and not superuser:
        typer.secho("Pass --staff and/or --superuser.", fg=typer.colors.RED)
        raise typer.Exit(code=1)
    email = _validated_email(email)

    with Session(engine) as session:
        user = get_user_by_email(session, email)
        if user is None:
            typer.secho(
                f"No account found for {email} - register it first.",
                fg=typer.colors.RED,
            )
            raise typer.Exit(code=1)

        user.is_staff = user.is_staff or staff or superuser
        user.is_superuser = user.is_superuser or superuser
        session.add(user)
        session.commit()
        # Read before the session (and its `with` block) closes - commit()
        # expires every attribute by default, and accessing them
        # afterwards raises DetachedInstanceError.
        is_staff, is_superuser = user.is_staff, user.is_superuser

    typer.echo(f"{email}: is_staff={is_staff}, is_superuser={is_superuser}")


if __name__ == "__main__":
    app()
