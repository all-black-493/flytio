import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { asFastApiError, matchFastApiValidationStatus } from "@interfaces/http/fastapi-errors";
import { hs256Verifier } from "@infrastructure/auth/hs256";
import { readCredential } from "@interfaces/http/credentials";
import { router } from "@interfaces/http/router";
import type { RequestContext } from "@interfaces/http/context";
import type { Account } from "@domain/auth/account";

const tokens = JSON.parse(readFileSync("test/fixtures/tokens.json", "utf8")) as Record<string, string> & {
  issuedAtEpoch: number;
};

const ACCOUNT: Account = {
  id: "6f1b0e7e-6d5c-4a1e-9a4a-1d2c3b4a5e6f",
  email: "traveller@flyt.africa",
  isStaff: false,
  isSuperuser: true,
  deletedAt: null,
  bannedAt: null,
  passwordChangedAtEpoch: null,
};

const handler = new OpenAPIHandler(router, { interceptors: [matchFastApiValidationStatus] });
const unreachable = () => {
  throw new Error("not part of this test");
};

async function me(headers: HeadersInit, account: Account | null = ACCOUNT) {
  const request = new Request("https://api.flyt.africa/api/v1/me", { headers });

  const context = {
    clock: { now: () => new Date((tokens.issuedAtEpoch + 60) * 1000) },
    healthChecks: {},
    routes: { popularRoutes: unreachable },
    places: { suggest: unreachable },
    flights: { searchOffers: unreachable },
    markup: { activeRate: unreachable },
    placesCache: { get: unreachable, set: unreachable },
    searchCache: { get: unreachable, set: unreachable },
    accounts: { byEmail: async () => account },
    tokens: hs256Verifier(tokens.secret!, () => new Date((tokens.issuedAtEpoch + 60) * 1000)),
    credential: readCredential(request),
  } as unknown as RequestContext;

  const { response } = await handler.handle(request, { prefix: "/api/v1", context });
  const rewritten = await asFastApiError(response!);
  return { status: rewritten.status, body: await rewritten.json(), headers: rewritten.headers };
}

describe("GET /me", () => {
  it("answers from the cookie a browser sends", async () => {
    const { status, body } = await me({ Cookie: `flyt_token=${tokens.valid}` });
    expect(status).toBe(200);
    expect(body).toEqual({
      id: ACCOUNT.id,
      email: ACCOUNT.email,
      is_staff: false,
      is_superuser: true,
    });
  });

  it("answers from the bearer header the Next.js server sends during SSR", async () => {
    expect((await me({ Authorization: `Bearer ${tokens.valid}` })).status).toBe(200);
  });

  it("prefers the cookie, which is what real browser traffic carries", async () => {
    const { status } = await me({
      Cookie: `flyt_token=${tokens.valid}`,
      Authorization: `Bearer ${tokens.wrongSecret}`,
    });
    expect(status).toBe(200);
  });

  it("says 'Not authenticated' when nothing was presented", async () => {
    const { status, body, headers } = await me({});
    expect(status).toBe(401);
    expect(body).toEqual({ detail: "Not authenticated" });
    expect(headers.get("WWW-Authenticate")).toBe("Bearer");
  });

  it("says 'Could not validate credentials' when something was", async () => {
    const { status, body } = await me({ Cookie: `flyt_token=${tokens.wrongSecret}` });
    expect(status).toBe(401);
    expect(body).toEqual({ detail: "Could not validate credentials" });
  });

  it("does not say which of the ways a credential failed", async () => {
    const refusals = await Promise.all([
      me({ Cookie: `flyt_token=${tokens.passwordReset}` }),
      me({ Cookie: `flyt_token=${tokens.expired}` }),
      me({ Cookie: `flyt_token=${tokens.unsigned}` }),
      me({ Cookie: `flyt_token=${tokens.valid}` }, null),
      me({ Cookie: `flyt_token=${tokens.valid}` }, { ...ACCOUNT, bannedAt: new Date() }),
      me({ Cookie: `flyt_token=${tokens.valid}` }, { ...ACCOUNT, deletedAt: new Date() }),
    ]);

    for (const refusal of refusals) {
      expect(refusal.status).toBe(401);
      expect(refusal.body).toEqual({ detail: "Could not validate credentials" });
    }
  });
});
