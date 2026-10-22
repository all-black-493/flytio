import { z } from "zod";
import { decimalAmount, isoDateTime } from "@interfaces/http/schemas/primitives";

export const discountPreviewRequest = z.object({
  offer_id: z.string().min(1),
  discount_code: z.string().min(1),
});

export const discountPreviewResponse = z.object({
  /** The base fare with the current markup, before the code is applied. */
  original_amount: decimalAmount,
  discounted_amount: decimalAmount,
  currency: z.string(),
  discount_percentage: z.number(),
});

/** What the traveller sees on their own booking page, not the ledger view. */
export const customerRefund = z.object({
  amount: z.string(),
  currency: z.string(),
  status: z.enum(["paid", "processing"]),
  created_at: isoDateTime,
});
