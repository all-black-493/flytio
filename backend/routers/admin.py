import uuid
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from backend.crud.bookings import (
    count_all_bookings,
    count_bookings_since,
    count_user_bookings,
    get_all_bookings,
    get_popular_routes,
    get_user_bookings,
)
from backend.crud.db import get_session
from backend.crud.payments import get_revenue_by_currency
from backend.crud.users import (
    count_active_users,
    count_users,
    delete_user_account,
    list_users,
)
from backend.models.rbac import Group, GroupPermission, Permission, UserGroup
from backend.models.users import UserInDB
from backend.schemas.admin import (
    AdminBookingListResponse,
    AdminBookingRead,
    AdminDashboardSummary,
    AdminUserListResponse,
    AdminUserRead,
    CurrencyTotal,
    SetStaffRequest,
)
from backend.schemas.bookings import BookingListResponse, BookingPublic, PopularRoute
from backend.schemas.common import PaginationMeta
from backend.schemas.rbac import (
    AssignGroupsRequest,
    AssignPermissionsRequest,
    GroupCreate,
    GroupRead,
    PermissionRead,
)
from backend.utils.rbac import (
    require_permission,
    require_permissions,
    require_staff,
    require_superuser,
)

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


@router.get("/bookings", response_model=AdminBookingListResponse)
async def list_all_bookings(
    search: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    _: UserInDB = Depends(require_permission("view_booking")),
    session: Session = Depends(get_session),
):
    """Every booking in the system, most recent first - the staff
    counterpart of GET /booking/flight-orders (which is scoped to the
    logged-in user). `search` matches booking reference or owner email."""
    bookings = get_all_bookings(session, search=search, limit=limit, offset=offset)
    total = count_all_bookings(session, search=search)

    user_ids = {b.user_id for b in bookings}
    email_by_user_id = {
        user.id: user.email
        for user in session.exec(
            select(UserInDB).where(UserInDB.id.in_(user_ids))
        ).all()
    }
    data = [
        AdminBookingRead(
            **BookingPublic.model_validate(booking).model_dump(),
            user_id=booking.user_id,
            user_email=email_by_user_id.get(booking.user_id, ""),
        )
        for booking in bookings
    ]
    return AdminBookingListResponse(
        data=data,
        meta=PaginationMeta(
            limit=limit, offset=offset, total=total, has_more=offset + limit < total
        ),
    )


@router.get("/dashboard/summary", response_model=AdminDashboardSummary)
async def dashboard_summary(
    _: UserInDB = Depends(require_permissions(["view_booking", "view_payment"])),
    session: Session = Depends(get_session),
):
    now = datetime.utcnow()
    start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start_of_week = start_of_today - timedelta(days=start_of_today.weekday())

    revenue = get_revenue_by_currency(session)
    return AdminDashboardSummary(
        total_bookings=count_all_bookings(session),
        bookings_today=count_bookings_since(session, start_of_today),
        bookings_this_week=count_bookings_since(session, start_of_week),
        total_users=count_users(session),
        active_users=count_active_users(session),
        revenue=[
            CurrencyTotal(currency=currency, total_amount=amount)
            for currency, amount in revenue.items()
        ],
    )


@router.get("/dashboard/popular-routes", response_model=list[PopularRoute])
async def dashboard_popular_routes(
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    _: UserInDB = Depends(require_permission("view_booking")),
    session: Session = Depends(get_session),
):
    """Staff see real signal from a single booking up - the public
    counterpart (routers/flights.py's popular_destinations) uses a much
    higher min_bookings so a lone booking never looks 'popular' to a
    customer."""
    rows = get_popular_routes(session, limit=limit, min_bookings=1)
    return [
        PopularRoute(
            origin_iata_code=origin_code,
            origin_city_name=origin_city,
            destination_iata_code=destination_code,
            destination_city_name=destination_city,
            booking_count=count,
        )
        for origin_code, origin_city, destination_code, destination_city, count in rows
    ]


@router.get("/users", response_model=AdminUserListResponse)
async def list_all_users(
    search: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    _: UserInDB = Depends(require_permission("view_user")),
    session: Session = Depends(get_session),
):
    users = list_users(session, search=search, limit=limit, offset=offset)
    total = count_users(session, search=search)
    return AdminUserListResponse(
        data=users,
        meta=PaginationMeta(
            limit=limit, offset=offset, total=total, has_more=offset + limit < total
        ),
    )


def _get_user_or_404(session: Session, user_id: uuid.UUID) -> UserInDB:
    user = session.get(UserInDB, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return user


@router.get("/users/{user_id}/bookings", response_model=BookingListResponse)
async def get_user_bookings_admin(
    user_id: uuid.UUID,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    _: UserInDB = Depends(require_permission("view_user")),
    session: Session = Depends(get_session),
):
    user = _get_user_or_404(session, user_id)
    bookings = get_user_bookings(session, user.id, limit=limit, offset=offset)
    total = count_user_bookings(session, user.id)
    return BookingListResponse(
        data=bookings,
        meta=PaginationMeta(
            limit=limit, offset=offset, total=total, has_more=offset + limit < total
        ),
    )


@router.post("/users/{user_id}/staff", response_model=AdminUserRead)
async def set_user_staff(
    user_id: uuid.UUID,
    request: SetStaffRequest,
    _: UserInDB = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    """Granting admin-surface access is exactly the kind of
    bootstrapping-sensitive action group/permission management already
    reserves for superusers - see utils/rbac.py's require_superuser."""
    user = _get_user_or_404(session, user_id)
    user.is_staff = request.is_staff
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.post("/users/{user_id}/deactivate", response_model=AdminUserRead)
async def deactivate_user(
    user_id: uuid.UUID,
    current_user: UserInDB = Depends(require_permission("delete_user")),
    session: Session = Depends(get_session),
):
    """A staff-initiated deactivation is the same soft-delete a
    self-service account deletion already is (crud/users.py's
    delete_user_account) - booking/payment history is preserved
    unchanged, only identity is scrubbed. Blocks deactivating your own
    account through this admin action - self-service deletion
    (DELETE /api/me) already covers that and requires re-entering your
    password; this path shouldn't be a way to accidentally lock yourself
    out with one misclick."""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use account settings to deactivate your own account.",
        )
    user = _get_user_or_404(session, user_id)
    return delete_user_account(session, user)
