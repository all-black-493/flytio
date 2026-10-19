import type { AccountRepository, Mailer, PasswordHasher } from "@application/ports";
import type { Account } from "@domain/auth/account";
import { welcomeNotice } from "@application/notifications";

export type RegisterOutcome =
  | { ok: true; account: Account }
  | { ok: false; reason: "email_taken" };

/**
 * The welcome email is sent from here rather than published as an event. It
 * was a Kafka message consumed by a separate process; that process ran on the
 * box this migration is replacing, and the queue that would have taken its
 * place (CF-31) is waiting on producers that have not moved yet. Sending it
 * directly is one fewer moving part for one email, and the Mailer is
 * fire-and-forget by contract, so a mail outage cannot cost somebody their
 * account.
 */
export async function register(
  deps: {
    accounts: Pick<AccountRepository, "create">;
    passwords: Pick<PasswordHasher, "hash">;
    mail: Mailer;
  },
  request: { email: string; password: string; now: Date },
): Promise<RegisterOutcome> {
  const account = await deps.accounts.create(
    request.email,
    await deps.passwords.hash(request.password),
    request.now,
  );

  if (account === null) return { ok: false, reason: "email_taken" };

  deps.mail.send(welcomeNotice(account.email));
  return { ok: true, account };
}
