/**
 * The Worker and the Python service share a signing key, so a session issued
 * by either must be honoured by both. These tokens are minted by PyJWT -
 * regenerate with:
 *
 *   PYTHONPATH=. uv run --project backend python worker/test/token_fixtures.py
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hs256Verifier } from "@infrastructure/auth/hs256";

const tokens = JSON.parse(readFileSync("test/fixtures/tokens.json", "utf8")) as Record<
  string,
  string
> & { issuedAtEpoch: number; expiresAtEpoch: number };

const whileValid = () => new Date((tokens.issuedAtEpoch + 60) * 1000);
const verifier = hs256Verifier(tokens.secret!, whileValid);

describe("HS256 verification", () => {
  it("accepts what the Python service issues, claims and all", async () => {
    expect(await verifier.verify(tokens.valid!)).toEqual({
      sub: "traveller@flyt.africa",
      purpose: "access",
      issuedAt: tokens.issuedAtEpoch,
      expiresAt: tokens.expiresAtEpoch,
    });
  });

  it("reads a reset token's purpose rather than rejecting it outright", async () => {
    // Refusing it is authenticate()'s job; this layer only reports the claim.
    expect(await verifier.verify(tokens.passwordReset!)).toMatchObject({
      purpose: "password_reset",
    });
  });

  it("refuses a signature from a different key", async () => {
    expect(await verifier.verify(tokens.wrongSecret!)).toBeNull();
  });

  it("refuses a payload edited after signing", async () => {
    expect(await verifier.verify(tokens.tampered!)).toBeNull();
  });

  it("refuses an unsigned token claiming alg=none", async () => {
    expect(await verifier.verify(tokens.unsigned!)).toBeNull();
  });

  it("refuses HS512 even though the key would verify it", async () => {
    // Obeying the header's `alg` instead of pinning one is how JWT
    // verification gets talked out of doing its job.
    expect(await verifier.verify(tokens.hs512!)).toBeNull();
  });

  it("refuses an expired token", async () => {
    expect(await verifier.verify(tokens.expired!)).toBeNull();
  });

  it("refuses a good token once it expires", async () => {
    const later = hs256Verifier(tokens.secret!, () => new Date((tokens.expiresAtEpoch + 1) * 1000));
    expect(await later.verify(tokens.valid!)).toBeNull();
  });

  it("accepts a token in its final second", async () => {
    const edge = hs256Verifier(tokens.secret!, () => new Date((tokens.expiresAtEpoch - 1) * 1000));
    expect(await edge.verify(tokens.valid!)).not.toBeNull();
  });

  it("refuses anything that is not a JWT", async () => {
    for (const junk of [tokens.notAJwt!, "", "a.b", "a.b.c.d"]) {
      expect(await verifier.verify(junk)).toBeNull();
    }
  });
});
