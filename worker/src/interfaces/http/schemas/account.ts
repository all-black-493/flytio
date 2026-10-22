import { z } from "zod";
import { uuid } from "@interfaces/http/schemas/primitives";

/** Mirrors schemas/users.py's UserRead - never the password or the flags around it. */
export const userRead = z.object({
  id: uuid,
  email: z.email(),
  is_staff: z.boolean(),
  is_superuser: z.boolean(),
});

export type UserRead = z.infer<typeof userRead>;
