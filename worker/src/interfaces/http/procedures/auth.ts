import { implement, ORPCError } from "@orpc/server";
import { signIn } from "@application/use-cases/sign-in";
import { authContract } from "@interfaces/http/contract/auth";
import { clearedSessionCookie, sessionCookie } from "@interfaces/http/session-cookie";
import type { RequestContext } from "@interfaces/http/context";

const os = implement(authContract).$context<RequestContext>();

export const auth = {
  signIn: os.signIn.handler(async ({ context, input }) => {
    const token = await signIn(
      { accounts: context.accounts, passwords: context.passwords, tokens: context.signer },
      {
        email: input.username,
        password: input.password,
        now: context.clock.now(),
        lifetimeMinutes: context.cookiePolicy.lifetimeMinutes,
      },
    );

    if (!token) {
      throw new ORPCError("UNAUTHORIZED", { message: "Incorrect email or password" });
    }

    return {
      headers: { "set-cookie": sessionCookie(token, context.cookiePolicy) },
      body: { access_token: token, token_type: "bearer" as const },
    };
  }),

  // No credential required, matching the service it replaces: signing out is
  // discarding a cookie, and refusing to do that for an expired session would
  // only strand the browser holding it.
  signOut: os.signOut.handler(({ context }) => ({
    headers: { "set-cookie": clearedSessionCookie(context.cookiePolicy) },
    body: { message: "Logged out" },
  })),
};
