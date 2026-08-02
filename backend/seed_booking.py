import asyncio
import uuid
from datetime import datetime, timedelta

from sqlmodel import Session, select

from backend.crud.db import engine
from backend.models.bookings import (
    Booking,
    BookingPassenger,
    BookingSlice,
    BookingStatus,
)
from backend.models.flights import Flight
from backend.models.tickets import Ticket
from backend.models.users import UserInDB
from backend.utils.email import SENDER_BOOKINGS, send_html_email_async
from backend.utils.email_templates import booking_confirmation_email_html


def seed():
    with Session(engine) as session:
        user = session.exec(
            select(UserInDB).where(UserInDB.email == "nyangijeremy@gmail.com")
        ).first()
        assert user is not None, "test user not found — register it first"

        booking = Booking(
            user_id=user.id,
            duffel_order_id=f"ord_test_{uuid.uuid4().hex[:10]}",
            booking_reference="FLYT9X",
            status=BookingStatus.CONFIRMED,
            total_amount="482.50",
            total_currency="USD",
            owner_iata_code="KQ",
            owner_name="Kenya Airways",
        )
        session.add(booking)
        session.flush()

        dep = datetime.utcnow() + timedelta(days=21, hours=6)
        arr = dep + timedelta(hours=8, minutes=45)
        slice_ = BookingSlice(
            booking_id=booking.id,
            duffel_slice_id=f"sli_test_{uuid.uuid4().hex[:8]}",
            origin_iata_code="NBO",
            origin_name="Jomo Kenyatta International Airport",
            origin_city_name="Nairobi",
            destination_iata_code="LHR",
            destination_name="Heathrow Airport",
            destination_city_name="London",
            duration="PT8H45M",
        )
        session.add(slice_)
        session.flush()

        flight = Flight(
            slice_id=slice_.id,
            duffel_segment_id=f"seg_test_{uuid.uuid4().hex[:8]}",
            origin_iata_code="NBO",
            origin_name="Jomo Kenyatta International Airport",
            destination_iata_code="LHR",
            destination_name="Heathrow Airport",
            departing_at=dep,
            arriving_at=arr,
            duration="PT8H45M",
            marketing_carrier_iata_code="KQ",
            marketing_carrier_name="Kenya Airways",
            marketing_carrier_flight_number="100",
            operating_carrier_iata_code="KQ",
            operating_carrier_name="Kenya Airways",
            aircraft_name="Boeing 787-8",
        )
        session.add(flight)

        passenger = BookingPassenger(
            booking_id=booking.id,
            duffel_passenger_id=f"pas_test_{uuid.uuid4().hex[:8]}",
            passenger_type="adult",
            given_name="Jeremy",
            family_name="Nyangi",
            email=user.email,
            seat_designator="14A",
        )
        session.add(passenger)
        session.flush()

        ticket = Ticket(
            booking_id=booking.id,
            booking_passenger_id=passenger.id,
            document_type="electronic_ticket",
            ticket_number="1747401234567",
        )
        session.add(ticket)
        session.commit()
        session.refresh(booking)

        print("booking_id:", booking.id)

        # Re-fetch through the relationships the email template walks, same
        # as finalize_payment does, to exercise the real code path.
        session.refresh(booking)
        _ = booking.slices, booking.passengers
        for s in booking.slices:
            _ = s.flights
        for p in booking.passengers:
            _ = p.tickets

        html = booking_confirmation_email_html(booking)

        async def send():
            await send_html_email_async(
                f"You're booked! Reference {booking.booking_reference}",
                [user.email],
                html,
                from_address=SENDER_BOOKINGS,
            )

        asyncio.run(send())
        print("email sent")


if __name__ == "__main__":
    seed()
