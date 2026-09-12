import { z } from "zod";

/** Matches the envelope sqlakeyset already returns. */
export const cursorQuery = z.object({
  cursor: z.string().optional(),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

export function cursorPage<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int(),
    current_page: z.string().nullable(),
    current_page_backwards: z.string().nullable(),
    previous_page: z.string().nullable(),
    next_page: z.string().nullable(),
  });
}

/**
 * Offset pagination, kept only where it is genuinely cheaper than a cursor:
 * flight search pages a list already held in memory, and its UI shows a count
 * and lets you jump around.
 */
export const offsetMeta = z.object({
  limit: z.number().int(),
  offset: z.number().int(),
  total: z.number().int(),
  has_more: z.boolean(),
});

export const offsetQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
