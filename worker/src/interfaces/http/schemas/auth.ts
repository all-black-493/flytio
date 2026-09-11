import { z } from "zod";

/**
 * OAuth2's password grant, as FastAPI's OAuth2PasswordRequestForm accepts it:
 * form-encoded, and `username` carries an email address.
 */
export const passwordGrant = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  grant_type: z.string().optional(),
  scope: z.string().optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
});

export const token = z.object({
  access_token: z.string(),
  token_type: z.literal("bearer"),
});

export const message = z.object({ message: z.string() });
