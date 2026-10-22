import { describe, expect, it, vi } from "vitest";
import { register } from "@application/use-cases/register";
import type { Account } from "@domain/auth/account";
import type { MailMessage } from "@application/ports";

const ACCOUNT: Account = {
  id: "6f1b0e7e-6d5c-4a1e-9a4a-1d2c3b4a5e6f",
  email: "newcomer@example.com",
  isStaff: false,
  isSuperuser: false,
  deletedAt: null,
  bannedAt: null,
  passwordChangedAtEpoch: null,
};

const NOW = new Date("2026-10-19T09:00:00Z");

function deps(created: Account | null) {
  const sent: MailMessage[] = [];
  return {
    sent,
    create: vi.fn(async (_email: string, _hash: string, _at: Date) => created),
    passwords: { hash: vi.fn(async (plain: string) => `$2b$12$hashed(${plain})`) },
    mail: { send: (message: MailMessage) => void sent.push(message) },
  };
}

const request = { email: "newcomer@example.com", password: "a good long one", now: NOW };

describe("register", () => {
  it("stores a hash, never the password", async () => {
    const s = deps(ACCOUNT);
    const outcome = await register(
      { accounts: { create: s.create }, passwords: s.passwords, mail: s.mail },
      request,
    );

    expect(outcome).toEqual({ ok: true, account: ACCOUNT });
    const [email, hash, at] = s.create.mock.calls[0]!;
    expect(email).toBe(request.email);
    // What matters is that what reaches the repository came from the hasher
    // and is not the password itself.
    expect(hash).toBe("$2b$12$hashed(a good long one)");
    expect(hash).not.toBe(request.password);
    expect(at).toBe(NOW);
  });

  it("welcomes them, from the address that fits", async () => {
    const s = deps(ACCOUNT);
    await register({ accounts: { create: s.create }, passwords: s.passwords, mail: s.mail }, request);
    expect(s.sent[0]).toMatchObject({
      to: ACCOUNT.email,
      from: "welcome",
      subject: "Welcome to flyt!",
    });
  });

  it("refuses an address already taken, and sends nothing", async () => {
    const s = deps(null);
    const outcome = await register(
      { accounts: { create: s.create }, passwords: s.passwords, mail: s.mail },
      request,
    );

    expect(outcome).toEqual({ ok: false, reason: "email_taken" });
    expect(s.sent).toHaveLength(0);
  });

  it("hashes before asking, so the collision is the database's answer", async () => {
    // The insert carries ON CONFLICT DO NOTHING, so two simultaneous sign-ups
    // for one address both get a straight answer rather than one of them
    // winning a check that was true a moment earlier.
    const s = deps(null);
    await register({ accounts: { create: s.create }, passwords: s.passwords, mail: s.mail }, request);
    expect(s.passwords.hash).toHaveBeenCalledOnce();
    expect(s.create).toHaveBeenCalledOnce();
  });
});
