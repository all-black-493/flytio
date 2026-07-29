import uuid
from datetime import datetime

from sqlmodel import Session, func, select

from backend.models.bookings import (
    Booking,
    BookingPassenger,
    BookingSlice,
    BookingStatus,
    CabinClass,
    PassengerType,
)
from backend.models.flights import Flight
from backend.models.users import UserInDB
from backend.schemas.duffel_orders import Order, OrderCreate


def build_order_request_body(order: OrderCreate) -> dict:
    """Turns an OrderCreate into the exact JSON body Duffel's POST
    /air/orders expects: strips fields that are ours only
    (seat_designator, kept for local display), and collects the
    Duffel-facing ones (seat_service_id, extra_baggage_service_ids) into
    the top-level `services` array Duffel actually expects instead of a
    passenger field - see OrderPassenger's field docstrings. Shared by
    the direct-booking endpoint (routers/bookings.py) and the
    checkout-triggered path (crud/payments.py's _complete_booking)."""
    request_body = order.model_dump(mode="json", exclude_none=True)
    services = []
    for passenger in request_body.get("passengers", []):
        passenger.pop("seat_designator", None)
        seat_service_id = passenger.pop("seat_service_id", None)
        if seat_service_id:
            services.append({"id": seat_service_id, "quantity": 1})
        for baggage_service_id in passenger.pop("extra_baggage_service_ids", []):
            services.append({"id": baggage_service_id, "quantity": 1})
    if services:
        request_body.setdefault("services", [])
        request_body["services"].extend(services)
    return request_body


def seat_designators_by_passenger(order: OrderCreate) -> dict[str, str]:
    """passenger id -> seat designator, for the passengers who picked one
    - passed through to create_booking_from_order for local display."""
    return {p.id: p.seat_designator for p in order.passengers if p.seat_designator}


def _fare_breakdown(
    order: Order, charged_amount: str | None
) -> tuple[str | None, str | None]:
    """Base/tax split for display, in whatever currency the customer was
    actually charged. If charged_amount differs from Duffel's raw
    order.total_amount (flyt's markup - see utils/pricing.py), the
    difference is folded into tax_amount rather than base_amount, the same
    convention apply_markup_to_offer_dict uses for offers - base_amount
    always stays the airline's genuine fare, base+tax always sums to what
    the customer actually paid.
    """
    if order.base_amount is None:
        return None, order.tax_amount
    if charged_amount is None or order.total_amount is None or order.tax_amount is None:
        return order.base_amount, order.tax_amount
    markup = float(charged_amount) - float(order.total_amount)
    return order.base_amount, f"{float(order.tax_amount) + markup:.2f}"


def _passenger_baggage_and_cabin(
    order: Order, duffel_passenger_id: str
) -> tuple[int, int, CabinClass | None]:
    """Scans every segment for this passenger's baggage allowance/cabin
    class and returns the first match - in practice identical across every
    segment of a booking made through this app (one cabin class is chosen
    for the whole trip at search time), so there's no meaningful
    per-segment breakdown to preserve."""
    for slice_data in order.slices:
        for segment in slice_data.segments:
            for seg_passenger in segment.passengers:
                if seg_passenger.passenger_id != duffel_passenger_id:
                    continue
                checked = sum(
                    b.quantity for b in seg_passenger.baggages if b.type == "checked"
                )
                carry_on = sum(
                    b.quantity for b in seg_passenger.baggages if b.type == "carry_on"
                )
                cabin_class = None
                if seg_passenger.cabin_class:
                    try:
                        cabin_class = CabinClass(seg_passenger.cabin_class)
                    except ValueError:
                        cabin_class = None
                return checked, carry_on, cabin_class
    return 0, 0, None


def _add_slices_and_flights(
    session: Session, booking_id: uuid.UUID, order: Order
) -> None:
    """Builds BookingSlice/Flight rows for `order` under an existing
    booking_id - shared by create_booking_from_order (a brand new
    booking) and resync_booking_slices_from_order (an existing booking
    whose flights changed via a confirmed order change). Caller is
    responsible for having cleared any pre-existing slices first."""
    for slice_data in order.slices:
        booking_slice = BookingSlice(
            booking_id=booking_id,
            duffel_slice_id=slice_data.id,
            origin_iata_code=slice_data.origin.iata_code or "",
            origin_name=slice_data.origin.name,
            origin_city_name=slice_data.origin.city_name,
            destination_iata_code=slice_data.destination.iata_code or "",
            destination_name=slice_data.destination.name,
            destination_city_name=slice_data.destination.city_name,
            duration=slice_data.duration,
        )
        session.add(booking_slice)
        session.flush()

        for segment in slice_data.segments:
            session.add(
                Flight(
                    slice_id=booking_slice.id,
                    duffel_segment_id=segment.id,
                    origin_iata_code=segment.origin.iata_code or "",
                    origin_name=segment.origin.name,
                    origin_terminal=(
                        str(segment.origin_terminal)
                        if segment.origin_terminal is not None
                        else None
                    ),
                    destination_iata_code=segment.destination.iata_code or "",
                    destination_name=segment.destination.name,
                    destination_terminal=(
                        str(segment.destination_terminal)
                        if segment.destination_terminal is not None
                        else None
                    ),
                    departing_at=segment.departing_at,
                    arriving_at=segment.arriving_at,
                    duration=segment.duration,
                    marketing_carrier_iata_code=(
                        segment.marketing_carrier.iata_code
                        if segment.marketing_carrier
                        else None
                    ),
                    marketing_carrier_name=(
                        segment.marketing_carrier.name
                        if segment.marketing_carrier
                        else None
                    ),
                    marketing_carrier_logo_url=(
                        segment.marketing_carrier.logo_symbol_url
                        if segment.marketing_carrier
                        else None
                    ),
                    marketing_carrier_flight_number=segment.marketing_carrier_flight_number,
                    operating_carrier_iata_code=(
                        segment.operating_carrier.iata_code
                        if segment.operating_carrier
                        else None
                    ),
                    operating_carrier_name=(
                        segment.operating_carrier.name
                        if segment.operating_carrier
                        else None
                    ),
                    operating_carrier_flight_number=segment.operating_carrier_flight_number,
                    aircraft_name=segment.aircraft.name if segment.aircraft else None,
                )
            )


def create_booking_from_order(
    session: Session,
    user_id: uuid.UUID,
    order: Order,
    seat_by_passenger_id: dict[str, str] | None = None,
    *,
    charged_amount: str | None = None,
    charged_currency: str | None = None,
) -> Booking:
    """Persist a confirmed Duffel order as a Booking, with its slices,
    flights (segments), and passengers, linked to the given user.

    seat_by_passenger_id records the seat picked in our own seat-map UI
    (keyed by the Duffel passenger ID) - it's local-only bookkeeping, not
    a seat actually reserved with the airline via Duffel.

    charged_amount/charged_currency let the caller show what the customer
    actually paid (flyt's marked-up price - see utils/pricing.py) instead
    of order.total_amount, Duffel's raw net fare. finalize_payment always
    passes these; they default to order.total_amount so this stays
    backward compatible for anything that doesn't need the distinction.
    """
    seat_by_passenger_id = seat_by_passenger_id or {}
    final_total = charged_amount or order.total_amount or "0"
    base_amount, tax_amount = _fare_breakdown(order, charged_amount)
    refund = order.conditions.refund_before_departure if order.conditions else None
    change = order.conditions.change_before_departure if order.conditions else None
    booking = Booking(
        user_id=user_id,
        duffel_order_id=order.id,
        booking_reference=order.booking_reference or "",
        # This function only ever runs after Duffel has actually issued the
        # order (see crud/payments.py's _complete_booking) - a Booking row
        # existing at all already means "confirmed" (see this model's own
        # docstring). Explicit rather than relying on the model's PENDING
        # default, which exists for a possible future hold-order flow
        # (reserved, not yet paid), not for this path.
        status=BookingStatus.CONFIRMED,
        total_amount=final_total,
        total_currency=charged_currency or order.total_currency or "",
        base_amount=base_amount,
        base_currency=order.base_currency,
        tax_amount=tax_amount,
        tax_currency=order.tax_currency,
        owner_iata_code=order.owner.iata_code if order.owner else None,
        owner_name=order.owner.name if order.owner else None,
        refund_allowed=refund.allowed if refund else None,
        refund_penalty_amount=refund.penalty_amount if refund else None,
        refund_penalty_currency=refund.penalty_currency if refund else None,
        change_allowed=change.allowed if change else None,
        change_penalty_amount=change.penalty_amount if change else None,
        change_penalty_currency=change.penalty_currency if change else None,
    )
    session.add(booking)
    session.flush()  # assigns booking.id without committing yet

    _add_slices_and_flights(session, booking.id, order)

    for passenger in order.passengers:
        checked_bags, carry_on_bags, cabin_class = _passenger_baggage_and_cabin(
            order, passenger.id
        )
        session.add(
            BookingPassenger(
                booking_id=booking.id,
                duffel_passenger_id=passenger.id,
                passenger_type=PassengerType(passenger.type.value)
                if passenger.type
                else None,
                given_name=passenger.given_name or "",
                family_name=passenger.family_name or "",
                born_on=passenger.born_on,
                email=passenger.email,
                phone_number=passenger.phone_number,
                infant_passenger_id=passenger.infant_passenger_id,
                seat_designator=seat_by_passenger_id.get(passenger.id),
                cabin_class=cabin_class,
                checked_bags=checked_bags,
                carry_on_bags=carry_on_bags,
            )
        )

    session.commit()
    session.refresh(booking)
    return booking


def resync_booking_slices_from_order(
    session: Session, booking: Booking, order: Order
) -> Booking:
    """Rebuilds a booking's slices/flights (and total/fare breakdown) from
    a freshly re-fetched order - called after a Duffel order change is
    confirmed (routers/bookings.py's confirm_order_change), since the
    flight segments and price may now differ from what was persisted at
    booking time. Passengers are left untouched: order changes only ever
    change flights, never who's traveling."""
    for slice_ in list(booking.slices):
        session.delete(slice_)
    session.flush()

    _add_slices_and_flights(session, booking.id, order)

    base_amount, tax_amount = _fare_breakdown(order, order.total_amount)
    booking.total_amount = order.total_amount or booking.total_amount
    booking.total_currency = order.total_currency or booking.total_currency
    booking.base_amount = base_amount
    booking.base_currency = order.base_currency
    booking.tax_amount = tax_amount
    booking.tax_currency = order.tax_currency
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking


def get_booking_by_duffel_order_id(
    session: Session, duffel_order_id: str
) -> Booking | None:
    return session.exec(
        select(Booking).where(Booking.duffel_order_id == duffel_order_id)
    ).first()


def get_booking(session: Session, booking_id: uuid.UUID) -> Booking | None:
    """Look up by our own primary key, not Duffel's order_id - used by the
    payment status endpoint, which only knows the booking via Payment.booking_id."""
    return session.get(Booking, booking_id)


def _filtered_user_bookings_query(
    user_id: uuid.UUID,
    *,
    booking_reference: str | None = None,
    origin: str | None = None,
    destination: str | None = None,
    status: BookingStatus | None = None,
):
    """Shared filter-building base for get_user_bookings/count_user_bookings
    so pagination (limit/offset/order) and counting always agree on which
    rows match."""
    query = select(Booking).where(Booking.user_id == user_id)
    if booking_reference:
        query = query.where(Booking.booking_reference == booking_reference)
    if status:
        query = query.where(Booking.status == status)
    if origin or destination:
        query = query.join(BookingSlice)
        if origin:
            query = query.where(BookingSlice.origin_iata_code == origin)
        if destination:
            query = query.where(BookingSlice.destination_iata_code == destination)
    return query


def get_user_bookings(
    session: Session,
    user_id: uuid.UUID,
    *,
    booking_reference: str | None = None,
    origin: str | None = None,
    destination: str | None = None,
    status: BookingStatus | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Booking]:
    query = _filtered_user_bookings_query(
        user_id,
        booking_reference=booking_reference,
        origin=origin,
        destination=destination,
        status=status,
    )
    query = query.order_by(Booking.created_at.desc()).offset(offset).limit(limit)
    return list(session.exec(query).all())


def count_user_bookings(
    session: Session,
    user_id: uuid.UUID,
    *,
    booking_reference: str | None = None,
    origin: str | None = None,
    destination: str | None = None,
    status: BookingStatus | None = None,
) -> int:
    query = _filtered_user_bookings_query(
        user_id,
        booking_reference=booking_reference,
        origin=origin,
        destination=destination,
        status=status,
    )
    # .distinct(): the origin/destination filters join BookingSlice, which
    # would otherwise double-count a booking matching on more than one slice.
    count_query = select(func.count()).select_from(query.distinct().subquery())
    return session.exec(count_query).one()


def _filtered_all_bookings_query(*, search: str | None = None):
    """Shared filter-building base for get_all_bookings/count_all_bookings
    - search matches booking_reference OR the owning user's email
    (case-insensitive substring), same pairing convention as
    _filtered_user_bookings_query above."""
    query = select(Booking)
    if search:
        pattern = search.lower()
        query = query.join(UserInDB, UserInDB.id == Booking.user_id).where(
            func.lower(Booking.booking_reference).contains(pattern)
            | func.lower(UserInDB.email).contains(pattern)
        )
    return query


def get_all_bookings(
    session: Session, *, search: str | None = None, limit: int = 50, offset: int = 0
) -> list[Booking]:
    """Every booking in the system, unfiltered by owner - the staff/admin
    counterpart to get_user_bookings, backing routers/admin.py's
    GET /api/admin/bookings (gated by utils/rbac.py's require_permission
    ("view_booking"))."""
    query = (
        _filtered_all_bookings_query(search=search)
        .order_by(Booking.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(session.exec(query).all())


def count_all_bookings(session: Session, *, search: str | None = None) -> int:
    query = _filtered_all_bookings_query(search=search)
    count_query = select(func.count()).select_from(query.subquery())
    return session.exec(count_query).one()


def count_bookings_since(session: Session, since: datetime) -> int:
    return session.exec(
        select(func.count()).select_from(Booking).where(Booking.created_at >= since)
    ).one()


def get_popular_routes(
    session: Session, *, limit: int = 10, min_bookings: int = 1
) -> list[tuple[str, str | None, str, str | None, int]]:
    """(origin_iata_code, origin_city_name, destination_iata_code,
    destination_city_name, booking_count) for the most-booked routes,
    grouped over every BookingSlice (a round trip's outbound and return
    legs are different (origin, destination) pairs, so both are counted
    - no double-counting). `min_bookings` is the real/public split: staff
    (routers/admin.py) see real signal from 1 booking up; the public
    endpoint (routers/flights.py) uses a much higher bar so a single
    booking never looks like a 'popular destination' to a customer."""
    query = (
        select(
            BookingSlice.origin_iata_code,
            BookingSlice.origin_city_name,
            BookingSlice.destination_iata_code,
            BookingSlice.destination_city_name,
            func.count().label("booking_count"),
        )
        .group_by(
            BookingSlice.origin_iata_code,
            BookingSlice.origin_city_name,
            BookingSlice.destination_iata_code,
            BookingSlice.destination_city_name,
        )
        .having(func.count() >= min_bookings)
        .order_by(func.count().desc())
        .limit(limit)
    )
    return list(session.exec(query).all())


def mark_booking_cancelled(session: Session, booking: Booking) -> Booking:
    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = datetime.utcnow()
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking


def record_airline_initiated_change(
    session: Session, duffel_order_id: str
) -> Booking | None:
    """Flags a booking as having an airline-initiated change pending
    review - called by the Duffel webhook receiver (routers/webhooks.py)
    on an order.airline_initiated_change_detected event. Returns None
    (and does nothing) if the order isn't one of ours."""
    booking = get_booking_by_duffel_order_id(session, duffel_order_id)
    if booking is None:
        return None
    booking.airline_initiated_change_detected_at = datetime.utcnow()
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking
