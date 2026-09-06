import { z } from "zod";

/**
 * Cursor pagination, matching what the FastAPI app already returns via
 * sqlakeyset. Composed rather than repeated: `cursorPage(itemSchema)` gives
 * every list endpoint the same envelope.
 */
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
