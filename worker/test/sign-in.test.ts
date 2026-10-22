import { describe, expect, it } from "vitest";
import { signIn } from "@application/use-cases/sign-in";
import type { Account } from "@domain/auth/account";
import type { Credential } from "@application/ports";

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

function deps(credential: Credential | null, matches = true) {
  return {
    accounts: { credentialByEmail: async () => credential },
    passwords: { verify: async (_: string, hash: string | null) => matches && hash !== null },
    tokens: { sign: async () => "signed.jwt.here" },
  };
}

const request = {
  email: ACCOUNT.email,
  password: "correct horse battery staple",
  now: NOW,
  lifetimeMinutes: 60,
};

describe("sign in", () => {
  it("issues a token for the right password", async () => {
    const credential = { account: ACCOUNT, passwordHash: "$2b$12$hash" };
    expect(await signIn(deps(credential), request)).toBe("signed.jwt.here");
  });

  it("refuses an unknown email", async () => {
    expect(await signIn(deps(null), request)).toBeNull();
  });

  it("refuses a wrong password", async () => {
    const credential = { account: ACCOUNT, passwordHash: "$2b$12$hash" };
    expect(await signIn(deps(credential, false), request)).toBeNull();
  });

  it("refuses an account that only ever signed in through a provider", async () => {
    // Google-only accounts store no hash. Treating that as "no password
    // required" would be the worst possible reading of it.
    const google = { account: ACCOUNT, passwordHash: null };
    expect(await signIn(deps(google), request)).toBeNull();
  });

  it("refuses a banned account even with the right password", async () => {
    // A ban never scrubs the email, so nothing earlier in the flow stops it.
    const banned = { account: { ...ACCOUNT, bannedAt: NOW }, passwordHash: "$2b$12$hash" };
    expect(await signIn(deps(banned), request)).toBeNull();
  });

  it("refuses a deleted account", async () => {
    const deleted = { account: { ...ACCOUNT, deletedAt: NOW }, passwordHash: "$2b$12$hash" };
    expect(await signIn(deps(deleted), request)).toBeNull();
  });

  it("signs the email as stored, not as typed", async () => {
    let signed: unknown;
    const stored = { ...ACCOUNT, email: "Traveller@flyt.africa" };
    const watched = {
      accounts: { credentialByEmail: async () => ({ account: stored, passwordHash: "$2b$12$h" }) },
      passwords: { verify: async () => true },
      tokens: {
        sign: async (claims: unknown) => {
          signed = claims;
          return "t";
        },
      },
    };

    await signIn(watched, { ...request, email: "traveller@flyt.africa" });
    expect(signed).toMatchObject({ sub: "Traveller@flyt.africa", purpose: "access" });
  });

  it("dates the token from the clock it was given", async () => {
    let signed: { issuedAt: number; expiresAt: number } | undefined;
    const watched = {
      accounts: { credentialByEmail: async () => ({ account: ACCOUNT, passwordHash: "$2b$12$h" }) },
      passwords: { verify: async () => true },
      tokens: {
        sign: async (claims: never) => {
          signed = claims;
          return "t";
        },
      },
    };

    await signIn(watched, request);
    expect(signed!.issuedAt).toBe(NOW.getTime() / 1000);
    expect(signed!.expiresAt - signed!.issuedAt).toBe(3600);
  });
});
