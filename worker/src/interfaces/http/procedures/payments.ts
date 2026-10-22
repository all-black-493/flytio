import { implement, ORPCError } from "@orpc/server";
import { previewDiscount } from "@application/use-cases/preview-discount";
import { paymentsContract } from "@interfaces/http/contract/payments";
import { requireAccount } from "@interfaces/http/authenticated";
import type { RequestContext } from "@interfaces/http/context";

const os = implement(paymentsContract).$context<RequestContext>();

export const payments = {
  // Authenticated, though it reads nothing of the caller's: it spends a live
  // Duffel call, so it is not left open to anyone passing by.
  previewDiscount: os.previewDiscount.use(requireAccount).handler(async ({ context, input }) => {
    const outcome = await previewDiscount(
      { offers: context.offers, discounts: context.discounts, markup: context.markup },
      { offerId: input.offer_id, code: input.discount_code, now: context.clock.now() },
    );

    if (!outcome.ok) {
      throw new ORPCError("BAD_REQUEST", { status: 400, message: outcome.refusal.message });
    }
    return outcome.preview;
  }),

  bookingRefund: os.bookingRefund.use(requireAccount).handler(async ({ context, input }) => {
    const refund = await context.refunds.forBooking(context.account.id, input.booking_id);

    // One message for a booking that is not theirs, one that was never
    // cancelled, and one whose fare refunded nothing - the service this
    // replaces separates the first from the other two, so this does too.
    if (!refund) {
      const booking = await context.bookings.byIdFor(context.account.id, input.booking_id);
      throw new ORPCError("NOT_FOUND", {
        message: booking
          ? "No refund has been recorded for this booking."
          : "Booking not found",
      });
    }
    return refund;
  }),
};
