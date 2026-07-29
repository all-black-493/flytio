"""Django-`auth`-shaped permission resolution and FastAPI dependencies for
the staff/admin surface (routers/admin.py). See models/rbac.py's docstring
for the two deliberate simplifications versus real Django.
"""

from collections.abc import Iterable

from fastapi import Depends, HTTPException, status
from sqlmodel import Session, select

from backend.crud.db import get_session
from backend.models.rbac import GroupPermission, Permission, UserGroup, UserPermission
from backend.models.users import UserInDB
from backend.utils.security import get_current_user

# Which models get the 4 default permissions auto-generated below. Not
# derived from an app registry (this is a single-app backend, unlike
# Django) - adding a new manageable model means adding it here, then
# re-running scripts/seed_permissions.py.
MANAGED_MODELS = ["booking", "payment", "ticket", "user"]
ACTIONS = ["add", "change", "delete", "view"]


def default_permissions() -> list[tuple[str, str, str]]:
    """(codename, human-readable name, content_type) for every default
    permission every managed model should have - the source of truth
    seed_permissions() reconciles the DB against."""
    return [
        (f"{action}_{content_type}", f"Can {action} {content_type}", content_type)
        for content_type in MANAGED_MODELS
        for action in ACTIONS
    ]


def seed_permissions(session: Session) -> list[Permission]:
    """Idempotent - creates any of the default permissions that don't
    already exist yet (keyed by codename), leaves existing ones alone.
    Mirrors Django's post_migrate create_permissions signal, run manually
    here since there's no migrate-signal equivalent in this stack. Returns
    the newly-created rows."""
    existing = set(session.exec(select(Permission.codename)).all())
    created = []
    for codename, name, content_type in default_permissions():
        if codename in existing:
            continue
        permission = Permission(codename=codename, name=name, content_type=content_type)
        session.add(permission)
        created.append(permission)
    if created:
        session.commit()
        for permission in created:
            session.refresh(permission)
    return created


def get_user_permissions(session: Session, user: UserInDB) -> set[str]:
    """Permissions granted directly to `user`, bypassing group
    membership - mirrors Django's user.user_permissions."""
    rows = session.exec(
        select(Permission.codename)
        .join(UserPermission, UserPermission.permission_id == Permission.id)
        .where(UserPermission.user_id == user.id)
    ).all()
    return set(rows)


def get_group_permissions(session: Session, user: UserInDB) -> set[str]:
    """Permissions granted via any group `user` belongs to."""
    rows = session.exec(
        select(Permission.codename)
        .join(GroupPermission, GroupPermission.permission_id == Permission.id)
        .join(UserGroup, UserGroup.group_id == GroupPermission.group_id)
        .where(UserGroup.user_id == user.id)
    ).all()
    return set(rows)


def get_all_permissions(session: Session, user: UserInDB) -> set[str]:
    return get_user_permissions(session, user) | get_group_permissions(session, user)


def has_perm(session: Session, user: UserInDB, perm: str) -> bool:
    """Superuser always True, matching Django - otherwise checks direct
    and group-granted permissions."""
    if user.is_superuser:
        return True
    return perm in get_all_permissions(session, user)


def has_perms(session: Session, user: UserInDB, perms: Iterable[str]) -> bool:
    return all(has_perm(session, user, perm) for perm in perms)


def require_staff(
    user: UserInDB = Depends(get_current_user),
) -> UserInDB:
    """Gate for 'can this user reach the admin surface at all' - Django's
    admin.site login check (is_staff), independent of any specific
    permission. Applied at the router level in routers/admin.py."""
    if not user.is_staff:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required."
        )
    return user


def require_permission(perm: str):
    """Dependency factory - the equivalent of Django's
    @permission_required(perm). Checks has_perm only (superuser bypass
    included there); does NOT itself check is_staff - routers/admin.py
    composes both, same as Django keeps is_staff and has_perm as
    orthogonal checks."""

    def dependency(
        user: UserInDB = Depends(get_current_user),
        session: Session = Depends(get_session),
    ) -> UserInDB:
        if not has_perm(session, user, perm):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permission: {perm}",
            )
        return user

    return dependency


def require_permissions(perms: list[str]):
    """Plural, AND-semantics version of require_permission - for an
    endpoint whose data spans more than one managed model (e.g. the
    dashboard summary needs both view_booking and view_payment)."""

    def dependency(
        user: UserInDB = Depends(get_current_user),
        session: Session = Depends(get_session),
    ) -> UserInDB:
        if not has_perms(session, user, perms):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permission(s): {', '.join(perms)}",
            )
        return user

    return dependency


def require_superuser(
    user: UserInDB = Depends(get_current_user),
) -> UserInDB:
    """Gate for group/permission management itself - granting permissions
    can't sensibly require a permission (nobody could ever be granted the
    first one), so this checks is_superuser directly, same as Django only
    trusting superusers with the admin's Group/Permission screens by
    default."""
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Superuser access required."
        )
    return user
