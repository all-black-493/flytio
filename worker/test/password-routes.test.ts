import { describe, expect, it, vi } from "vitest";
import { changePassword } from "@application/use-cases/change-password";
import { deleteAccount } from "@application/use-cases/delete-account";
import { requestPasswordReset, resetPassword } from "@application/use-cases/reset-password";
import type { Account } from "@domain/auth/account";
import type { MailMessage } from "@application/ports";
import type { TokenClaims } from "@domain/auth/access-token";

const ACCOUNT: Account = {
  id: "6f1b0e7e-6d5c-4a1e-9a4a-1d2c3b4a5e6f",
  email: "traveller@flyt.africa",
  isStaff: false,
  isSuperuser: false,
  deletedAt: null,
  bannedAt: null,
  passwordChangedAtEpoch: null,
};

const NOW = new Date("2026-01-01T12:00:00Z");
const HASH = "$2b$12$existing";

function spies(matches = true) {
  const sent: MailMessage[] = [];
  return {
    sent,
    setPassword: vi.fn(async (_id: string, _hash: string, _at: Date) => {}),
    scrub: vi.fn(async (_account: Account, _hash: string, _at: Date) => {}),
    passwords: {
      verify: vi.fn(async () => matches),
      hash: vi.fn(async (plain: string) => `$2b$12$hashed(${plain})`),
    },
    tokens: { sign: vi.fn(async (_claims: TokenClaims) => "fresh.jwt.token") },
    mail: { send: (message: MailMessage) => void sent.push(message) },
  };
}

describe("change password", () => {
  const request = {
    account: ACCOUNT,
    currentPasswordHash: HASH,
    currentPassword: "old",
    newPassword: "a good long one",
    now: NOW,
    lifetimeMinutes: 60,
  };

  it("stores a new hash and reissues the session it just ended", async () => {
    const s = spies();
    const outcome = await changePassword(
      { accounts: { setPassword: s.setPassword }, passwords: s.passwords, tokens: s.tokens, mail: s.mail },
      request,
    );

    expect(outcome).toEqual({ ok: true, freshToken: "fresh.jwt.token" });
    expect(s.setPassword).toHaveBeenCalledWith(ACCOUNT.id, "$2b$12$hashed(a good long one)", NOW);
  });

  it("refuses without the current password, and writes nothing", async () => {
    const s = spies(false);
    const outcome = await changePassword(
      { accounts: { setPassword: s.setPassword }, passwords: s.passwords, tokens: s.tokens, mail: s.mail },
      request,
    );

    expect(outcome).toEqual({ ok: false, reason: "wrong_password" });
    expect(s.setPassword).not.toHaveBeenCalled();
    expect(s.sent).toHaveLength(0);
  });

  it("tells the owner, in case it was not them", async () => {
    const s = spies();
    await changePassword(
      { accounts: { setPassword: s.setPassword }, passwords: s.passwords, tokens: s.tokens, mail: s.mail },
      request,
    );
    expect(s.sent[0]).toMatchObject({ to: ACCOUNT.email, subject: "Your flyt password was changed" });
  });
});

describe("forgot password", () => {
  it("emails a link when the address is registered", async () => {
    const s = spies();
    await requestPasswordReset(
      { accounts: { byEmail: async () => ACCOUNT }, tokens: s.tokens, mail: s.mail },
      { email: ACCOUNT.email, now: NOW, resetUrl: (t) => `https://flyt.africa/reset-password?token=${t}` },
    );

    expect(s.sent[0]!.bodyText).toContain("https://flyt.africa/reset-password?token=fresh.jwt.token");
    expect(s.tokens.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: ACCOUNT.email, purpose: "password_reset" }),
    );
  });

  it("expires the link in thirty minutes, not the session lifetime", async () => {
    const s = spies();
    await requestPasswordReset(
      { accounts: { byEmail: async () => ACCOUNT }, tokens: s.tokens, mail: s.mail },
      { email: ACCOUNT.email, now: NOW, resetUrl: (t) => t },
    );

    const signed = s.tokens.sign.mock.calls[0]![0];
    expect(signed.expiresAt! - signed.issuedAt!).toBe(30 * 60);
  });

  it("sends nothing for an unknown address, and says so to nobody", async () => {
    const s = spies();
    await requestPasswordReset(
      { accounts: { byEmail: async () => null }, tokens: s.tokens, mail: s.mail },
      { email: "stranger@example.com", now: NOW, resetUrl: (t) => t },
    );
    expect(s.sent).toHaveLength(0);
  });
});

describe("reset password", () => {
  const claims = { sub: ACCOUNT.email, purpose: "password_reset" as const, issuedAt: 1, expiresAt: 2 };
  const request = { token: "t", newPassword: "a good long one", now: NOW };

  function deps(s: ReturnType<typeof spies>, verified: typeof claims | null) {
    return {
      accounts: { byEmail: async () => ACCOUNT, setPassword: s.setPassword },
      passwords: s.passwords,
      tokens: { verify: async () => verified },
      mail: s.mail,
    };
  }

  it("sets the password the token vouches for", async () => {
    const s = spies();
    expect(await resetPassword(deps(s, claims), request)).toEqual({ ok: true });
    expect(s.setPassword).toHaveBeenCalledWith(ACCOUNT.id, "$2b$12$hashed(a good long one)", NOW);
  });

  it("refuses a login token, which is signed with the same key", async () => {
    // Without the purpose check, anyone holding a session cookie could
    // overwrite the password it belongs to without knowing the old one.
    const s = spies();
    const asAccess = { ...claims, purpose: "access" as never };
    expect(await resetPassword(deps(s, asAccess), request)).toEqual({ ok: false, reason: "bad_token" });
    expect(s.setPassword).not.toHaveBeenCalled();
  });

  it("refuses a token that does not verify", async () => {
    const s = spies();
    expect(await resetPassword(deps(s, null), request)).toEqual({ ok: false, reason: "bad_token" });
    expect(s.setPassword).not.toHaveBeenCalled();
  });
});

describe("delete account", () => {
  const request = { account: ACCOUNT, passwordHash: HASH, password: "correct", now: NOW };

  it("scrubs the identity with a hash nobody holds", async () => {
    const s = spies();
    expect(await deleteAccount({ accounts: { scrub: s.scrub }, passwords: s.passwords }, request)).toBe(true);

    const [account, placeholder, at] = s.scrub.mock.calls[0]!;
    expect(account).toBe(ACCOUNT);
    expect(placeholder).not.toBe(HASH);
    expect(at).toBe(NOW);
  });

  it("refuses without the password, so a stolen cookie is not enough", async () => {
    const s = spies(false);
    expect(await deleteAccount({ accounts: { scrub: s.scrub }, passwords: s.passwords }, request)).toBe(false);
    expect(s.scrub).not.toHaveBeenCalled();
  });

  it("refuses an account with no password to check", async () => {
    const s = spies();
    s.passwords.verify = vi.fn(async (_: string, hash: string | null) => hash !== null);
    const noPassword = { ...request, passwordHash: null };
    expect(await deleteAccount({ accounts: { scrub: s.scrub }, passwords: s.passwords }, noPassword)).toBe(false);
    expect(s.scrub).not.toHaveBeenCalled();
  });
});
