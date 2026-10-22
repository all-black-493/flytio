import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  customerRefund,
  discountPreviewRequest,
  discountPreviewResponse,
  uuid,
} from "@interfaces/http/schemas";

/**
 * The parts of checkout that quote money without moving any. Everything that
 * charges a customer or refunds one is still served by the origin.
 */
export const paymentsContract = {
  previewDiscount: oc
    .route({
      method: "POST",
      path: "/payments/discounts/preview",
      tags: ["Payments"],
      summary: "What a discount code would save",
    })
    .input(discountPreviewRequest)
    .output(discountPreviewResponse),

  bookingRefund: oc
    .route({
      method: "GET",
      path: "/booking/flight-orders/by-id/{booking_id}/refund",
      tags: ["Bookings"],
      summary: "The refund owed on a cancelled booking",
    })
    .input(z.object({ booking_id: uuid }))
    .output(customerRefund),
};
