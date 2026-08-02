"""One-off/idempotent setup: creates the default add/change/delete/view
permission for every managed model (utils/rbac.py's MANAGED_MODELS) that
doesn't already exist yet. Mirrors Django's post_migrate
create_permissions signal, run manually here since there's no
migrate-signal equivalent in this stack.

Run after every `alembic upgrade head` that adds a table to
MANAGED_MODELS:

    python -m backend.scripts.seed_permissions
"""

from sqlmodel import Session

from backend.crud.db import engine
from backend.utils.rbac import seed_permissions


def main() -> None:
    with Session(engine) as session:
        created = seed_permissions(session)

    if not created:
        print("No new permissions to create - already up to date.")
        return

    print(f"Created {len(created)} permission(s):")
    for permission in created:
        print(f"  {permission.codename}")


if __name__ == "__main__":
    main()
