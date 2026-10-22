import { describe, expect, it } from "vitest";
import { authenticate } from "@application/use-cases/authenticate";
import type { Account } from "@domain/auth/account";
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

const CLAIMS: TokenClaims = {
  sub: ACCOUNT.email,
  purpose: "access",
  issuedAt: 1_800_000_000,
  expiresAt: 1_800_003_600,
};

function deps(claims: TokenClaims | null, account: Account | null = ACCOUNT) {
  return {
    tokens: { verify: async () => claims },
    accounts: { byEmail: async () => account },
  };
}

describe("authenticate", () => {
  it("identifies the holder of a good token", async () => {
    expect(await authenticate(deps(CLAIMS), "token")).toEqual(ACCOUNT);
  });

  it("refuses no credential without asking the database", async () => {
    let asked = false;
    const watched = {
      tokens: { verify: async () => CLAIMS },
      accounts: {
        byEmail: async () => {
          asked = true;
          return ACCOUNT;
        },
      },
    };
    expect(await authenticate(watched, null)).toBeNull();
    expect(asked).toBe(false);
  });

  it("refuses a token the verifier could not vouch for", async () => {
    expect(await authenticate(deps(null), "tampered")).toBeNull();
  });

  it("refuses a password-reset token used as a session", async () => {
    // The whole reason `purpose` exists: this is a validly signed JWT for the
    // same key, so nothing else here would catch it.
    const reset = { ...CLAIMS, purpose: "password_reset" as const };
    expect(await authenticate(deps(reset), "reset")).toBeNull();
  });

  it("refuses a token with no subject", async () => {
    expect(await authenticate(deps({ ...CLAIMS, sub: null }), "anon")).toBeNull();
  });

  it("refuses an account that no longer exists", async () => {
    expect(await authenticate(deps(CLAIMS, null), "token")).toBeNull();
  });

  it("refuses a deleted account", async () => {
    const deleted = { ...ACCOUNT, deletedAt: new Date("2026-01-01") };
    expect(await authenticate(deps(CLAIMS, deleted), "token")).toBeNull();
  });

  it("refuses a banned account", async () => {
    const banned = { ...ACCOUNT, bannedAt: new Date("2026-01-01") };
    expect(await authenticate(deps(CLAIMS, banned), "token")).toBeNull();
  });

  it("refuses a session older than the password reset meant to end it", async () => {
    const reset = { ...ACCOUNT, passwordChangedAtEpoch: CLAIMS.issuedAt! + 1 };
    expect(await authenticate(deps(CLAIMS, reset), "token")).toBeNull();
  });

  it("keeps a session issued in the same second as the reset", async () => {
    // iat has whole-second resolution, so rounding alone must not log
    // somebody out of the session they just got from changing their password.
    const reset = { ...ACCOUNT, passwordChangedAtEpoch: CLAIMS.issuedAt! };
    expect(await authenticate(deps(CLAIMS, reset), "token")).toEqual(reset);
  });

  it("keeps a session on an account that has never reset a password", async () => {
    expect(await authenticate(deps({ ...CLAIMS, issuedAt: null }), "token")).toEqual(ACCOUNT);
  });
});
