import type { HtmlMailMessage, HtmlMailer, MailMessage, MailSender, Mailer } from "@application/ports";
import { emailShell, escapeHtml, paragraphs } from "@infrastructure/mail/shell";

export type MailConfig = {
  apiKey: string;
  /** Verified in Resend; every sender address lives at it. */
  domain: string;
  fromName: string;
  /** Builds the logo URL, so the shell matches the app it came from. */
  frontendUrl: string;
};

/**
 * Once a domain is verified in Resend any address at it can send, so each
 * kind of email goes out under the address that fits its purpose rather than
 * everything sharing one.
 */
const SENDERS: Record<MailSender, string> = {
  welcome: "hello",
  transactional: "noreply",
  bookings: "bookings",
  support: "support",
};

export function renderEmail(message: MailMessage, logoUrl: string): string {
  const heading = `<h2 style='margin:0 0 16px;font-size:18px;'>${escapeHtml(message.subject)}</h2>`;
  return emailShell(message.subject, heading + paragraphs(message.bodyText), logoUrl);
}

/**
 * `schedule` is what makes this fire-and-forget - the Worker's waitUntil, so
 * the send outlives the response without delaying it.
 */
function deliver(config: MailConfig, message: { from: MailSender; to: string; subject: string; html: string }) {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${config.fromName} <${SENDERS[message.from]}@${config.domain}>`,
      to: [message.to],
      subject: message.subject,
      html: message.html,
    }),
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Resend refused the message: ${response.status} ${await response.text()}`);
    }
  });
}

export function resendMailer(
  config: MailConfig,
  schedule: (work: Promise<unknown>) => void,
): Mailer {
  return {
    send(message: MailMessage): void {
      schedule(
        deliver(config, {
          ...message,
          html: renderEmail(message, `${config.frontendUrl}/logo-email.png`),
        }),
      );
    },
  };
}

/**
 * Awaited rather than scheduled. The sweep has no request to outlive, and it
 * has to know a send failed so it can hand the leg back for the next one.
 */
export function resendHtmlMailer(config: MailConfig): HtmlMailer {
  return {
    sendHtml(message: HtmlMailMessage): Promise<void> {
      return deliver(config, message);
    },
  };
}
