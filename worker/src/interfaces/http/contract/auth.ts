import { oc } from "@orpc/contract";
import { message, passwordGrant, token, withHeaders } from "@interfaces/http/schemas";

/**
 * Detailed output on both: signing in and out is mostly about the cookie, and
 * compact output has nowhere to put a header.
 */
export const authContract = {
  signIn: oc
    .route({
      method: "POST",
      path: "/token",
      outputStructure: "detailed",
      tags: ["Auth"],
      summary: "Sign in",
    })
    .input(passwordGrant)
    .output(withHeaders(token)),

  signOut: oc
    .route({
      method: "POST",
      path: "/logout",
      outputStructure: "detailed",
      tags: ["Auth"],
      summary: "Sign out",
    })
    .output(withHeaders(message)),
};
