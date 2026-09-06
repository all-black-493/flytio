import { z } from "zod";

/** Matches the envelope sqlakeyset already returns. */
export const cursorQuery = z.object({
  cursor: z.string().optional(),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

export function cursorPage<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    current_page: z.string().nullable(),
    previous_page: z.string().nullable(),
    next_page: z.string().nullable(),
  });
}
