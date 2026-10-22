import { describe, expect, it } from "vitest";
import { clearedSessionCookie, sessionCookie } from "@interfaces/http/session-cookie";

describe("session cookie", () => {
  it("matches what the Python service sets today", () => {
    // Captured from a real POST /api/v1/token against the running service.
    expect(sessionCookie("abc.def.ghi", { domain: null, secure: false, lifetimeMinutes: 60 })).toBe(
      "flyt_token=abc.def.ghi; HttpOnly; Max-Age=3600; Path=/; SameSite=lax",
    );
  });

  it("adds Secure and the parent domain in production", () => {
    // Also captured from Starlette, with the production COOKIE_DOMAIN.
    expect(
      sessionCookie("abc.def.ghi", { domain: ".flyt.africa", secure: true, lifetimeMinutes: 60 }),
    ).toBe(
      "flyt_token=abc.def.ghi; Domain=.flyt.africa; HttpOnly; Max-Age=3600; Path=/; SameSite=lax; Secure",
    );
  });

  it("expires the cookie on the same domain it was set on", () => {
    // A clear scoped to the wrong domain leaves the original in place, and
    // the browser keeps sending it.
    expect(clearedSessionCookie({ domain: "flyt.africa" })).toContain("Domain=flyt.africa");
    expect(clearedSessionCookie({ domain: null })).toBe(
      "flyt_token=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/; SameSite=lax",
    );
  });
});
