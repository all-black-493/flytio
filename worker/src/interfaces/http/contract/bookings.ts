import { oc } from "@orpc/contract";
import { z } from "zod";
import { bookingListQuery, bookingPage, bookingPublic, uuid } from "@interfaces/http/schemas";

export const bookingsContract = {
  list: oc
    .route({
      method: "GET",
      path: "/booking/flight-orders",
      tags: ["Bookings"],
      summary: "The signed-in account's bookings, most recent first",
    })
    .input(bookingListQuery)
    .output(bookingPage),

  byId: oc
    .route({
      method: "GET",
      path: "/booking/flight-orders/by-id/{booking_id}",
      tags: ["Bookings"],
      summary: "One booking by our own id",
    })
    .input(z.object({ booking_id: uuid }))
    .output(bookingPublic),

  // For a traveller holding the ticket but not our booking id.
  byTicketNumber: oc
    .route({
      method: "GET",
      path: "/booking/flight-orders/by-ticket/{ticket_number}",
      tags: ["Bookings"],
      summary: "One booking by an airline-issued ticket number",
    })
    .input(z.object({ ticket_number: z.string().min(1) }))
    .output(bookingPublic),
};
