import { oc } from "@orpc/contract";
import {
  changePasswordRequest,
  deleteAccountRequest,
  forgotPasswordRequest,
  message,
  resetPasswordRequest,
  userRead,
  withHeaders,
} from "@interfaces/http/schemas";

export const accountContract = {
  me: oc
    .route({ method: "GET", path: "/me", tags: ["Auth"], summary: "The signed-in account" })
    .output(userRead),

  forgotPassword: oc
    .route({
      method: "POST",
      path: "/forgot-password",
      tags: ["Auth"],
      summary: "Request a password reset link",
    })
    .input(forgotPasswordRequest)
    .output(message),

  resetPassword: oc
    .route({
      method: "POST",
      path: "/reset-password",
      tags: ["Auth"],
      summary: "Set a new password using an emailed token",
    })
    .input(resetPasswordRequest)
    .output(message),

  // Detailed output on both of these: each one ends the session that made the
  // request, and has to say so in a cookie.
  changePassword: oc
    .route({
      method: "POST",
      path: "/change-password",
      outputStructure: "detailed",
      tags: ["Auth"],
      summary: "Change the password of the signed-in account",
    })
    .input(changePasswordRequest)
    .output(withHeaders(message)),

  deleteAccount: oc
    .route({
      method: "DELETE",
      path: "/me",
      outputStructure: "detailed",
      tags: ["Auth"],
      summary: "Delete the signed-in account",
    })
    .input(deleteAccountRequest)
    .output(withHeaders(message)),
};
