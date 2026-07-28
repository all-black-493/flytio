import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from backend.crud.bookings import count_all_bookings, get_all_bookings
from backend.crud.db import get_session
from backend.models.rbac import Group, GroupPermission, Permission, UserGroup
from backend.models.users import UserInDB
from backend.schemas.bookings import BookingListResponse
from backend.schemas.common import PaginationMeta
from backend.schemas.rbac import (
    AssignGroupsRequest,
    AssignPermissionsRequest,
    GroupCreate,
    GroupRead,
    PermissionRead,
)
from backend.utils.rbac import require_permission, require_staff, require_superuser

# Every route here requires is_staff (require_staff, applied router-wide);
# group/permission management additionally requires is_superuser
# (require_superuser, applied per-route below) - see utils/rbac.py's
# require_superuser docstring for why granting permissions can't itself
# require a permission.
router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_staff)])


def _group_read(session: Session, group: Group) -> GroupRead:
    codenames = session.exec(
        select(Permission.codename)
        .join(GroupPermission, GroupPermission.permission_id == Permission.id)
        .where(GroupPermission.group_id == group.id)
    ).all()
    return GroupRead(id=group.id, name=group.name, permissions=list(codenames))


@router.get("/permissions", response_model=list[PermissionRead])
async def list_permissions(
    _: UserInDB = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    return session.exec(select(Permission)).all()


@router.get("/groups", response_model=list[GroupRead])
async def list_groups(
    _: UserInDB = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    groups = session.exec(select(Group)).all()
    return [_group_read(session, group) for group in groups]


@router.post("/groups", response_model=GroupRead)
async def create_group(
    request: GroupCreate,
    _: UserInDB = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    if session.exec(select(Group).where(Group.name == request.name)).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A group with this name already exists.",
        )
    group = Group(name=request.name)
    session.add(group)
    session.commit()
    session.refresh(group)
    return _group_read(session, group)


def _get_group_or_404(session: Session, group_id: int) -> Group:
    group = session.get(Group, group_id)
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Group not found"
        )
    return group


@router.post("/groups/{group_id}/permissions", response_model=GroupRead)
async def assign_group_permissions(
    group_id: int,
    request: AssignPermissionsRequest,
    _: UserInDB = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    group = _get_group_or_404(session, group_id)
    permissions = session.exec(
        select(Permission).where(Permission.codename.in_(request.codenames))
    ).all()
    found_codenames = {p.codename for p in permissions}
    missing = set(request.codenames) - found_codenames
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown permission codename(s): {', '.join(sorted(missing))}",
        )

    already_granted = set(
        session.exec(
            select(Permission.codename)
            .join(GroupPermission, GroupPermission.permission_id == Permission.id)
            .where(GroupPermission.group_id == group_id)
        ).all()
    )
    for permission in permissions:
        if permission.codename in already_granted:
            continue
        session.add(GroupPermission(group_id=group_id, permission_id=permission.id))
    session.commit()
    return _group_read(session, group)


@router.delete("/groups/{group_id}/permissions/{codename}", response_model=GroupRead)
async def revoke_group_permission(
    group_id: int,
    codename: str,
    _: UserInDB = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    group = _get_group_or_404(session, group_id)
    permission = session.exec(
        select(Permission).where(Permission.codename == codename)
    ).first()
    if permission is not None:
        link = session.get(GroupPermission, (group_id, permission.id))
        if link is not None:
            session.delete(link)
            session.commit()
    return _group_read(session, group)


@router.post("/users/{user_id}/groups")
async def assign_user_groups(
    user_id: uuid.UUID,
    request: AssignGroupsRequest,
    _: UserInDB = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    user = session.get(UserInDB, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    groups = session.exec(select(Group).where(Group.id.in_(request.group_ids))).all()
    found_ids = {g.id for g in groups}
    missing = set(request.group_ids) - found_ids
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown group id(s): {', '.join(str(i) for i in sorted(missing))}",
        )

    already_member = set(
        session.exec(
            select(UserGroup.group_id).where(UserGroup.user_id == user.id)
        ).all()
    )
    for group in groups:
        if group.id in already_member:
            continue
        session.add(UserGroup(user_id=user.id, group_id=group.id))
    session.commit()
    return {"message": f"{user.email} added to {len(groups)} group(s)."}


@router.get("/bookings", response_model=BookingListResponse)
async def list_all_bookings(
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    _: UserInDB = Depends(require_permission("view_booking")),
    session: Session = Depends(get_session),
):
    """Every booking in the system, most recent first - the staff
    counterpart of GET /booking/flight-orders (which is scoped to the
    logged-in user). The first real consumer of require_permission,
    proving the framework end-to-end."""
    bookings = get_all_bookings(session, limit=limit, offset=offset)
    total = count_all_bookings(session)
    return BookingListResponse(
        data=bookings,
        meta=PaginationMeta(
            limit=limit, offset=offset, total=total, has_more=offset + limit < total
        ),
    )
