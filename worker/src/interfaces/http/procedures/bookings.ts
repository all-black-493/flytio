import { implement, ORPCError } from "@orpc/server";
import type { Booking } from "@domain/bookings/booking";
import { decodeCursor } from "@domain/pagination/keyset";
import { bookingsContract } from "@interfaces/http/contract/bookings";
import { requireAccount } from "@interfaces/http/authenticated";
import type { RequestContext } from "@interfaces/http/context";

const os = implement(bookingsContract).$context<RequestContext>();

/**
 * Not found, not forbidden, for a booking somebody else owns - telling the
 * difference would confirm the id exists.
 */
function found(booking: Booking | null): Booking {
  if (!booking) throw new ORPCError("NOT_FOUND", { message: "Booking not found" });
  return booking;
}

export const bookings = {
  list: os.list.use(requireAccount).handler(async ({ context, input }) => {
    const cursor = decodeCursor(input.cursor);
    // 400 and this exact wording, matching sqlakeyset's own refusal - a
    // schema failure would be 422, and this is not one.
    if (!cursor) {
      throw new ORPCError("BAD_REQUEST", { status: 400, message: "Invalid cursor value" });
    }

    return context.bookings.pageFor(context.account.id, {
      filters: {
        bookingReference: input.booking_reference ?? null,
        origin: input.origin ?? null,
        destination: input.destination ?? null,
        status: input.status ?? null,
      },
      cursor,
      size: input.size,
    });
  }),

  byId: os.byId.use(requireAccount).handler(async ({ context, input }) =>
    found(await context.bookings.byIdFor(context.account.id, input.booking_id)),
  ),

  byTicketNumber: os.byTicketNumber.use(requireAccount).handler(async ({ context, input }) =>
    found(await context.bookings.byTicketNumberFor(context.account.id, input.ticket_number)),
  ),
};
