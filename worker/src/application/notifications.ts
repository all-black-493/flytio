import type { MailMessage } from "@application/ports";

/**
 * Sent by both password paths, so whichever one was not the owner's doing
 * still reaches them.
 */
export function passwordChangedNotice(email: string): MailMessage {
  return {
    to: email,
    from: "transactional",
    subject: "Your flyt password was changed",
    bodyText:
      `Hello ${email},\n\nYour flyt password was just changed, and any devices ` +
      `you were previously signed in on have been signed out. If this wasn't ` +
      `you, contact support immediately.`,
  };
}

export function passwordResetLink(email: string, resetUrl: string): MailMessage {
  return {
    to: email,
    from: "transactional",
    subject: "Reset your flyt password",
    bodyText:
      `Hello ${email},\n\nSomeone requested a password reset for this account. ` +
      `Use the link below to choose a new password - it expires in 30 ` +
      `minutes:\n\n${resetUrl}\n\nIf you didn't request this, you can safely ` +
      `ignore this email.`,
  };
}

export function welcomeNotice(email: string): MailMessage {
  return {
    to: email,
    from: "welcome",
    subject: "Welcome to flyt!",
    bodyText:
      `Hello ${email},\n\nThank you for registering with us. We are excited ` +
      `to have you on board!`,
  };
}
