import uuid
from datetime import datetime

from sqlmodel import Session, func, select

from backend.models.bookings import (
    Booking,
    BookingPassenger,
    BookingSlice,
    BookingStatus,
    PassengerType,
)
from backend.models.flights import Flight
from backend.schemas.duffel_flights import Order


def create_booking_from_order(
    session: Session,
    user_id: uuid.UUID,
    order: Order,
    seat_by_passenger_id: dict[str, str] | None = None,
) -> Booking:
    """Persist a confirmed Duffel order as a Booking, with its slices,
    flights (segments), and passengers, linked to the given user.

    seat_by_passenger_id records the seat picked in our own seat-map UI
    (keyed by the Duffel passenger ID) - it's local-only bookkeeping, not
    a seat actually reserved with the airline via Duffel.
    """
    seat_by_passenger_id = seat_by_passenger_id or {}
    booking = Booking(
        user_id=user_id,
        duffel_order_id=order.id,
        booking_reference=order.booking_reference or "",
        total_amount=order.total_amount or "0",
        total_currency=order.total_currency or "",
        owner_iata_code=order.owner.iata_code if order.owner else None,
        owner_name=order.owner.name if order.owner else None,
    )
    session.add(booking)
    session.flush()  # assigns booking.id without committing yet

    for slice_data in order.slices:
        booking_slice = BookingSlice(
            booking_id=booking.id,
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
                    destination_iata_code=segment.destination.iata_code or "",
                    destination_name=segment.destination.name,
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
                    aircraft_name=segment.aircraft.name if segment.aircraft else None,
                )
            )

    for passenger in order.passengers:
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
            )
        )

    session.commit()
    session.refresh(booking)
    return booking


def get_booking_by_duffel_order_id(
    session: Session, duffel_order_id: str
) -> Booking | None:
    return session.exec(
        select(Booking).where(Booking.duffel_order_id == duffel_order_id)
    ).first()


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


def mark_booking_cancelled(session: Session, booking: Booking) -> Booking:
    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = datetime.utcnow()
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking
