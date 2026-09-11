import { ORPCError, os } from "@orpc/server";
import { authenticate } from "@application/use-cases/authenticate";
import type { Account } from "@domain/auth/account";
import type { RequestContext } from "@interfaces/http/context";

/**
 * Refuses in the two shapes FastAPI does. The distinction is only about
 * whether a credential was presented at all - every way a presented one can
 * fail answers identically, so none of them says which.
 */
export const requireAccount = os
  .$context<RequestContext>()
  .middleware(async ({ context, next }) => {
    if (!context.credential) {
      throw new ORPCError("UNAUTHORIZED", { message: "Not authenticated" });
    }

    const account = await authenticate(
      { tokens: context.tokens, accounts: context.accounts },
      context.credential,
    );

    if (!account) {
      throw new ORPCError("UNAUTHORIZED", { message: "Could not validate credentials" });
    }

    return next({ context: { account } satisfies { account: Account } });
  });
