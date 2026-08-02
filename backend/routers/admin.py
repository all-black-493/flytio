import uuid
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from backend.crud.bookings import (
    count_all_bookings,
    count_bookings_since,
    count_user_bookings,
    get_all_bookings,
    get_booking,
    get_popular_routes,
    get_user_bookings,
)
from backend.crud.db import get_session
from backend.crud.payments import create_admin_booking, get_revenue_by_currency
from backend.crud.refunds import (
    list_refunds,
    mark_refund_completed,
    send_refund_request,
)
from backend.crud.pricing import (
    create_discount_code,
    create_pricing_sale,
    delete_pricing_sale,
    list_discount_codes,
    list_pricing_sales,
    set_discount_code_active,
)
from backend.crud.rbac import (
    add_group_permissions,
    add_user_groups,
    create_group,
    get_group,
    get_group_by_name,
    get_group_permission_codenames,
    get_groups_by_ids,
    get_permissions_by_codenames,
    get_user_group_ids,
    list_groups,
    list_permissions,
    remove_group_permission,
    remove_user_group,
)
from backend.crud.tickets import backfill_tickets_from_duffel
from backend.crud.users import (
    ban_user,
    count_active_users,
    count_users,
    delete_user_account,
    get_users_by_ids,
    list_users,
    set_user_staff,
    unban_user,
)
from backend.external_services.flight import DuffelAPIError
from backend.models.payments import Payment
from backend.models.pricing import DiscountCode
from backend.models.rbac import Group
from backend.models.refunds import Refund, RefundStatus
from backend.models.users import UserInDB
from backend.schemas.admin import (
    AdminBookingListResponse,
    AdminBookingRead,
    AdminCreateBookingRequest,
    AdminDashboardSummary,
    AdminUserDetail,
    AdminUserListResponse,
    AdminUserRead,
    BanUserRequest,
    CreateDiscountCodeRequest,
    CreatePricingSaleRequest,
    CurrencyTotal,
    DiscountCodeRead,
    PricingSaleRead,
    SetDiscountCodeActiveRequest,
    SetStaffRequest,
)
from backend.schemas.bookings import BookingListResponse, BookingPublic, PopularRoute
from backend.schemas.common import PaginationMeta
from backend.schemas.refunds import RefundRead
from backend.schemas.rbac import (
    AssignGroupsRequest,
    AssignPermissionsRequest,
    GroupCreate,
    GroupRead,
    PermissionRead,
)
from backend.utils.duffel_errors import duffel_http_exception
from backend.utils.email import SENDER_BOOKINGS, send_html_email_async
from backend.utils.email_templates import booking_confirmation_email_html
from backend.utils.log_manager import get_app_logger
from backend.utils.rbac import (
    require_permission,
    require_permissions,
    require_staff,
    require_superuser,
)

logger = get_app_logger(__name__)

# Every route here requires is_staff (require_staff, applied router-wide);
# group/permission management additionally requires is_superuser
# (require_superuser, applied per-route below) - see utils/rbac.py's
# require_superuser docstring for why granting permissions can't itself
# require a permission.
router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_staff)])


def _group_read(session: Session, group: Group) -> GroupRead:
    codenames = get_group_permission_codenames(session, group.id)
    return GroupRead(id=group.id, name=group.name, permissions=codenames)


@router.get("/permissions", response_model=list[PermissionRead], tags=["Admin - RBAC"])
async def list_all_permissions(
    _: UserInDB = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    return list_permissions(session)


@router.get("/groups", response_model=list[GroupRead], tags=["Admin - RBAC"])
async def list_all_groups(
    _: UserInDB = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    groups = list_groups(session)
    return [_group_read(session, group) for group in groups]


@router.post("/groups", response_model=GroupRead, tags=["Admin - RBAC"])
async def create_new_group(
    request: GroupCreate,
    _: UserInDB = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    if get_group_by_name(session, request.name) is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A group with this name already exists.",
        )
    group = create_group(session, request.name)
    return _group_read(session, group)


def _get_group_or_404(session: Session, group_id: int) -> Group:
    group = get_group(session, group_id)
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Group not found"
        )
    return group


@router.post(
    "/groups/{group_id}/permissions", response_model=GroupRead, tags=["Admin - RBAC"]
)
async def assign_group_permissions(
    group_id: int,
    request: AssignPermissionsRequest,
    _: UserInDB = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    group = _get_group_or_404(session, group_id)
    permissions = get_permissions_by_codenames(session, request.codenames)
    found_codenames = {p.codename for p in permissions}
    missing = set(request.codenames) - found_codenames
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown permission codename(s): {', '.join(sorted(missing))}",
        )

    add_group_permissions(session, group_id, permissions)
    return _group_read(session, group)


@router.delete(
    "/groups/{group_id}/permissions/{codename}",
    response_model=GroupRead,
    tags=["Admin - RBAC"],
)
async def revoke_group_permission_by_codename(
    group_id: int,
    codename: str,
    _: UserInDB = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    group = _get_group_or_404(session, group_id)
    remove_group_permission(session, group_id, codename)
    return _group_read(session, group)


@router.post("/users/{user_id}/groups", tags=["Admin - RBAC"])
async def assign_user_groups(
    user_id: uuid.UUID,
    request: AssignGroupsRequest,
    _: UserInDB = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    user = _get_user_or_404(session, user_id)

    groups = get_groups_by_ids(session, request.group_ids)
    found_ids = {g.id for g in groups}
    missing = set(request.group_ids) - found_ids
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown group id(s): {', '.join(str(i) for i in sorted(missing))}",
        )

    add_user_groups(session, user.id, groups)
    return {"message": f"{user.email} added to {len(groups)} group(s)."}


@router.delete("/users/{user_id}/groups/{group_id}", tags=["Admin - RBAC"])
async def remove_user_group_route(
    user_id: uuid.UUID,
    group_id: int,
    _: UserInDB = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    user = _get_user_or_404(session, user_id)
    remove_user_group(session, user.id, group_id)
    return {"message": f"{user.email} removed from group."}


@router.get(
    "/bookings", response_model=AdminBookingListResponse, tags=["Admin - Bookings"]
)
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
        user.id: user.email for user in get_users_by_ids(session, user_ids)
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


@router.post("/bookings", response_model=AdminBookingRead, tags=["Admin - Bookings"])
async def create_admin_booking_route(
    request: AdminCreateBookingRequest,
    _: UserInDB = Depends(require_permission("add_booking")),
    session: Session = Depends(get_session),
):
    """Admin-marked-paid booking on behalf of an existing customer - no
    real payment collection, see crud/payments.py's create_admin_booking
    for what "marked-paid" means and why. The customer must already have
    a flyt account; there's no guest-booking concept here."""
    user = _get_user_or_404(session, request.user_id)
    try:
        payment = await create_admin_booking(session, user.id, request)
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if payment.booking_id is None:
        # The admin's own money isn't at risk here (nothing was collected
        # through flyt), but flyt's Duffel balance may have been charged
        # before the failure - same "needs manual follow-up" situation
        # crud/payments.py's _complete_booking already logs.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=payment.failure_reason or "Booking failed after being marked paid.",
        )

    booking = get_booking(session, payment.booking_id)
    return AdminBookingRead(
        **BookingPublic.model_validate(booking).model_dump(),
        user_id=booking.user_id,
        user_email=user.email,
    )


def _get_admin_booking_or_404(session: Session, booking_id: uuid.UUID):
    booking = get_booking(session, booking_id)
    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found"
        )
    return booking


def _admin_booking_read(session: Session, booking) -> AdminBookingRead:
    owner = session.get(UserInDB, booking.user_id)
    return AdminBookingRead(
        **BookingPublic.model_validate(booking).model_dump(),
        user_id=booking.user_id,
        user_email=owner.email if owner else "",
    )


@router.get(
    "/bookings/{booking_id}", response_model=AdminBookingRead, tags=["Admin - Bookings"]
)
async def get_booking_detail(
    booking_id: uuid.UUID,
    _: UserInDB = Depends(require_permission("view_booking")),
    session: Session = Depends(get_session),
):
    booking = _get_admin_booking_or_404(session, booking_id)
    return _admin_booking_read(session, booking)


@router.post(
    "/bookings/{booking_id}/backfill-tickets",
    response_model=AdminBookingRead,
    tags=["Admin - Bookings"],
)
async def backfill_booking_tickets(
    booking_id: uuid.UUID,
    _: UserInDB = Depends(require_permission("add_ticket")),
    session: Session = Depends(get_session),
):
    """Manually re-checks Duffel for e-tickets on a booking that's still
    ticket-less after _complete_booking's own short retry window
    (crud/payments.py) - closes that gap on demand. Safe to call more
    than once: no-ops if the booking already has tickets (see
    crud/tickets.py's backfill_tickets_from_duffel)."""
    booking = _get_admin_booking_or_404(session, booking_id)
    try:
        await backfill_tickets_from_duffel(session, booking)
    except DuffelAPIError as e:
        raise duffel_http_exception(e)
    session.refresh(booking)
    return _admin_booking_read(session, booking)


@router.post("/bookings/{booking_id}/resend-confirmation", tags=["Admin - Bookings"])
async def resend_booking_confirmation(
    booking_id: uuid.UUID,
    _: UserInDB = Depends(require_permission("change_booking")),
    session: Session = Depends(get_session),
):
    """Re-sends the booking-confirmation email - for a customer who says
    they never got it, or who wants it resent after a manual ticket
    backfill above."""
    booking = _get_admin_booking_or_404(session, booking_id)
    owner = session.get(UserInDB, booking.user_id)
    if owner is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking owner not found"
        )
    try:
        await send_html_email_async(
            f"You're booked! Reference {booking.booking_reference}",
            [owner.email],
            booking_confirmation_email_html(booking),
            from_address=SENDER_BOOKINGS,
        )
    except Exception as e:
        logger.exception(
            "Failed to resend confirmation email for booking %s", booking.id
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't send the email - please try again.",
        ) from e
    return {"message": f"Confirmation email resent to {owner.email}."}


@router.get(
    "/dashboard/summary",
    response_model=AdminDashboardSummary,
    tags=["Admin - Dashboard"],
)
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


@router.get(
    "/dashboard/popular-routes",
    response_model=list[PopularRoute],
    tags=["Admin - Dashboard"],
)
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
            destination_image_url=image.image_url if image else None,
            destination_image_attribution_name=image.photographer_name
            if image
            else None,
            destination_image_attribution_url=image.photographer_profile_url
            if image
            else None,
        )
        for origin_code, origin_city, destination_code, destination_city, count, image in rows
    ]


@router.get("/users", response_model=AdminUserListResponse, tags=["Admin - Users"])
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


@router.get(
    "/users/{user_id}/bookings",
    response_model=BookingListResponse,
    tags=["Admin - Users"],
)
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


@router.post(
    "/users/{user_id}/staff", response_model=AdminUserRead, tags=["Admin - Users"]
)
async def update_user_staff_status(
    user_id: uuid.UUID,
    request: SetStaffRequest,
    _: UserInDB = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    """Granting admin-surface access is exactly the kind of
    bootstrapping-sensitive action group/permission management already
    reserves for superusers - see utils/rbac.py's require_superuser."""
    user = _get_user_or_404(session, user_id)
    user = set_user_staff(session, user, request.is_staff)
    return user


@router.post(
    "/users/{user_id}/deactivate", response_model=AdminUserRead, tags=["Admin - Users"]
)
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


@router.get("/users/{user_id}", response_model=AdminUserDetail, tags=["Admin - Users"])
async def get_user_detail(
    user_id: uuid.UUID,
    _: UserInDB = Depends(require_permission("view_user")),
    session: Session = Depends(get_session),
):
    user = _get_user_or_404(session, user_id)
    banned_by_email = None
    if user.banned_by_user_id is not None:
        banner = session.get(UserInDB, user.banned_by_user_id)
        banned_by_email = banner.email if banner else None
    return AdminUserDetail(
        **AdminUserRead.model_validate(user).model_dump(),
        group_ids=get_user_group_ids(session, user.id),
        banned_by_email=banned_by_email,
    )


@router.post(
    "/users/{user_id}/ban", response_model=AdminUserRead, tags=["Admin - Users"]
)
async def ban_user_route(
    user_id: uuid.UUID,
    request: BanUserRequest,
    current_user: UserInDB = Depends(require_permission("delete_user")),
    session: Session = Depends(get_session),
):
    """Reuses delete_user's permission (same as deactivate_user) - a ban
    is the same class of moderation action, and utils/rbac.py's fixed
    {add,change,delete,view}-per-model permission grid has no room for a
    one-off 'ban' verb. Unlike deactivate_user this is reversible (see
    crud/users.py's ban_user/unban_user) so there's no destructive
    self-lockout risk in letting an admin ban their own account, but
    blocking it anyway avoids a confusing self-ban with no obvious way
    back short of another admin unbanning you."""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="You can't ban yourself."
        )
    user = _get_user_or_404(session, user_id)
    return ban_user(session, user, request.reason, current_user)


@router.post(
    "/users/{user_id}/unban", response_model=AdminUserRead, tags=["Admin - Users"]
)
async def unban_user_route(
    user_id: uuid.UUID,
    _: UserInDB = Depends(require_permission("delete_user")),
    session: Session = Depends(get_session),
):
    user = _get_user_or_404(session, user_id)
    return unban_user(session, user)


@router.get(
    "/pricing/sales", response_model=list[PricingSaleRead], tags=["Admin - Pricing"]
)
async def list_pricing_sales_route(
    _: UserInDB = Depends(require_permission("view_pricing")),
    session: Session = Depends(get_session),
):
    return list_pricing_sales(session)


@router.post("/pricing/sales", response_model=PricingSaleRead, tags=["Admin - Pricing"])
async def create_pricing_sale_route(
    request: CreatePricingSaleRequest,
    current_user: UserInDB = Depends(require_permission("add_pricing")),
    session: Session = Depends(get_session),
):
    try:
        return create_pricing_sale(
            session,
            name=request.name,
            markup_rate=request.markup_rate,
            starts_at=request.starts_at,
            ends_at=request.ends_at,
            created_by=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/pricing/sales/{sale_id}", tags=["Admin - Pricing"])
async def delete_pricing_sale_route(
    sale_id: uuid.UUID,
    _: UserInDB = Depends(require_permission("delete_pricing")),
    session: Session = Depends(get_session),
):
    delete_pricing_sale(session, sale_id)
    return {"message": "Sale deleted."}


@router.get(
    "/pricing/discount-codes",
    response_model=list[DiscountCodeRead],
    tags=["Admin - Pricing"],
)
async def list_discount_codes_route(
    _: UserInDB = Depends(require_permission("view_pricing")),
    session: Session = Depends(get_session),
):
    return list_discount_codes(session)


@router.post(
    "/pricing/discount-codes",
    response_model=DiscountCodeRead,
    tags=["Admin - Pricing"],
)
async def create_discount_code_route(
    request: CreateDiscountCodeRequest,
    current_user: UserInDB = Depends(require_permission("add_pricing")),
    session: Session = Depends(get_session),
):
    try:
        return create_discount_code(
            session,
            code=request.code,
            discount_percentage=request.discount_percentage,
            max_redemptions=request.max_redemptions,
            expires_at=request.expires_at,
            created_by=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


def _get_discount_code_or_404(session: Session, discount_code_id: uuid.UUID):
    discount = session.get(DiscountCode, discount_code_id)
    if discount is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Discount code not found"
        )
    return discount


@router.post(
    "/pricing/discount-codes/{discount_code_id}/active",
    response_model=DiscountCodeRead,
    tags=["Admin - Pricing"],
)
async def set_discount_code_active_route(
    discount_code_id: uuid.UUID,
    request: SetDiscountCodeActiveRequest,
    _: UserInDB = Depends(require_permission("change_pricing")),
    session: Session = Depends(get_session),
):
    discount = _get_discount_code_or_404(session, discount_code_id)
    return set_discount_code_active(session, discount, request.is_active)


def _get_refund_or_404(session: Session, refund_id: uuid.UUID) -> Refund:
    refund = session.get(Refund, refund_id)
    if refund is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Refund not found"
        )
    return refund


@router.get("/refunds", response_model=list[RefundRead], tags=["Admin - Refunds"])
async def list_refunds_route(
    status_filter: Annotated[RefundStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    _: UserInDB = Depends(require_permission("view_payment")),
    session: Session = Depends(get_session),
):
    """Every customer refund, newest first. Filter by status=manual_required
    to find the ones Pesapal couldn't carry and a human still owes someone -
    see crud/refunds.py for when that happens."""
    return list_refunds(session, status=status_filter, limit=limit, offset=offset)


@router.post(
    "/refunds/{refund_id}/retry", response_model=RefundRead, tags=["Admin - Refunds"]
)
async def retry_refund_route(
    refund_id: uuid.UUID,
    _: UserInDB = Depends(require_permission("change_payment")),
    session: Session = Depends(get_session),
):
    """Re-sends a FAILED refund to Pesapal - for a rejection that has since
    been fixed (or was transient). Deliberately re-sends the existing row
    rather than creating a second one: Pesapal accepts only one refund per
    payment, so a duplicate would be rejected outright."""
    refund = _get_refund_or_404(session, refund_id)
    if refund.status != RefundStatus.FAILED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only a failed refund can be retried (this one is {refund.status.value}).",
        )
    payment = session.get(Payment, refund.payment_id)
    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The payment this refund belongs to no longer exists.",
        )
    return await send_refund_request(session, refund, payment)


@router.post(
    "/refunds/{refund_id}/complete", response_model=RefundRead, tags=["Admin - Refunds"]
)
async def complete_refund_route(
    refund_id: uuid.UUID,
    _: UserInDB = Depends(require_permission("change_payment")),
    session: Session = Depends(get_session),
):
    """Marks a refund as actually paid out. Pesapal exposes no way to learn
    this (no webhook, no status lookup for refunds), so reconciliation is
    necessarily manual - this is also how a manual_required refund gets
    closed once someone has sent the money another way."""
    refund = _get_refund_or_404(session, refund_id)
    return mark_refund_completed(session, refund)
