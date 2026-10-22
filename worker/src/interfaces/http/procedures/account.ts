import { implement, ORPCError } from "@orpc/server";
import { changePassword } from "@application/use-cases/change-password";
import { register } from "@application/use-cases/register";
import { deleteAccount } from "@application/use-cases/delete-account";
import { requestPasswordReset, resetPassword } from "@application/use-cases/reset-password";
import { accountContract } from "@interfaces/http/contract/account";
import { requireAccount } from "@interfaces/http/authenticated";
import { clearedSessionCookie, sessionCookie } from "@interfaces/http/session-cookie";
import type { RequestContext } from "@interfaces/http/context";

const os = implement(accountContract).$context<RequestContext>();

/** The same acknowledgement whether or not the address is registered. */
const FORGOT_PASSWORD_ACK = "If that email is registered, a reset link has been sent.";

function badRequest(message: string): never {
  throw new ORPCError("BAD_REQUEST", { status: 400, message });
}

function toWire(account: { id: string; email: string; isStaff: boolean; isSuperuser: boolean }) {
  return {
    id: account.id,
    email: account.email,
    is_staff: account.isStaff,
    is_superuser: account.isSuperuser,
  };
}

export const account = {
  register: os.register.handler(async ({ context, input }) => {
    const outcome = await register(
      { accounts: context.accounts, passwords: context.passwords, mail: context.mail },
      { email: input.email, password: input.password, now: context.clock.now() },
    );

    if (!outcome.ok) badRequest("Email already registered");
    return toWire(outcome.account);
  }),

  me: os.me.use(requireAccount).handler(({ context }) => toWire(context.account)),

  forgotPassword: os.forgotPassword.handler(async ({ context, input }) => {
    await requestPasswordReset(
      { accounts: context.accounts, tokens: context.signer, mail: context.mail },
      {
        email: input.email,
        now: context.clock.now(),
        resetUrl: (token) => `${context.frontendUrl}/reset-password?token=${token}`,
      },
    );
    return { message: FORGOT_PASSWORD_ACK };
  }),

  resetPassword: os.resetPassword.handler(async ({ context, input }) => {
    const outcome = await resetPassword(
      {
        accounts: context.accounts,
        passwords: context.passwords,
        tokens: context.tokens,
        mail: context.mail,
      },
      { token: input.token, newPassword: input.new_password, now: context.clock.now() },
    );

    if (!outcome.ok) badRequest("This reset link is invalid or has expired.");
    return { message: "Password updated - you can now sign in." };
  }),

  changePassword: os.changePassword.use(requireAccount).handler(async ({ context, input }) => {
    const credential = await context.accounts.credentialByEmail(context.account.email);
    const now = context.clock.now();

    const outcome = await changePassword(
      {
        accounts: context.accounts,
        passwords: context.passwords,
        tokens: context.signer,
        mail: context.mail,
      },
      {
        account: context.account,
        currentPasswordHash: credential?.passwordHash ?? null,
        currentPassword: input.current_password,
        newPassword: input.new_password,
        now,
        lifetimeMinutes: context.cookiePolicy.lifetimeMinutes,
      },
    );

    if (!outcome.ok) badRequest("Current password is incorrect.");

    return {
      headers: { "set-cookie": sessionCookie(outcome.freshToken, context.cookiePolicy) },
      body: { message: "Password updated." },
    };
  }),

  deleteAccount: os.deleteAccount.use(requireAccount).handler(async ({ context, input }) => {
    const credential = await context.accounts.credentialByEmail(context.account.email);

    const deleted = await deleteAccount(
      { accounts: context.accounts, passwords: context.passwords },
      {
        account: context.account,
        passwordHash: credential?.passwordHash ?? null,
        password: input.password,
        now: context.clock.now(),
      },
    );

    if (!deleted) badRequest("Password is incorrect.");

    return {
      headers: { "set-cookie": clearedSessionCookie(context.cookiePolicy) },
      body: { message: "Account deleted." },
    };
  }),
};
