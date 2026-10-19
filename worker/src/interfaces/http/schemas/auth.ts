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

/**
 * Eight characters, as the Python schemas require. Registration deliberately
 * has no such rule there, so nothing is imposed on it here either - that
 * asymmetry is worth fixing, but not silently during a migration.
 */
const newPassword = z.string().min(8);

export const forgotPasswordRequest = z.object({ email: z.email() });

export const resetPasswordRequest = z.object({
  token: z.string().min(1),
  new_password: newPassword,
});

export const changePasswordRequest = z.object({
  current_password: z.string().min(1),
  new_password: newPassword,
});

export const deleteAccountRequest = z.object({ password: z.string().min(1) });

/**
 * No minimum length, matching the service this replaces: `UserCreate` sets
 * none, while the reset and change schemas require eight. That asymmetry is
 * worth fixing, but not silently during a migration - it would start refusing
 * sign-ups that work today.
 */
export const userCreate = z.object({
  email: z.email(),
  password: z.string().min(1),
});
