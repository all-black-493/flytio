import { describe, expect, it } from "vitest";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { asFastApiError, matchFastApiValidationStatus } from "@interfaces/http/fastapi-errors";
import { router } from "@interfaces/http/router";
import type { RequestContext } from "@interfaces/http/context";
import type { Account } from "@domain/auth/account";
import type { Booking } from "@domain/bookings/booking";
import { FIRST_PAGE } from "@domain/pagination/keyset";

const ACCOUNT: Account = {
  id: "6f1b0e7e-6d5c-4a1e-9a4a-1d2c3b4a5e6f",
  email: "traveller@flyt.africa",
  isStaff: false,
  isSuperuser: false,
  deletedAt: null,
  bannedAt: null,
  passwordChangedAtEpoch: null,
};

const handler = new OpenAPIHandler(router, { interceptors: [matchFastApiValidationStatus] });
const unreachable = () => {
  throw new Error("not part of this test");
};

type Call = { accountId: string; request?: unknown };

async function request(path: string, bookings: Partial<RequestContext["bookings"]>, calls: Call[] = []) {
  const context = {
    accounts: { byEmail: async () => ACCOUNT },
    tokens: { verify: async () => ({ sub: ACCOUNT.email, purpose: "access", issuedAt: 1, expiresAt: 2 }) },
    credential: "a.valid.token",
    bookings: {
      pageFor: unreachable,
      byIdFor: unreachable,
      byTicketNumberFor: unreachable,
      ...bookings,
    },
    clock: { now: () => new Date() },
  } as unknown as RequestContext;

  const { response } = await handler.handle(new Request(`https://api.flyt.africa/api/v1${path}`), {
    prefix: "/api/v1",
    context,
  });
  const rewritten = await asFastApiError(response!);
  return { status: rewritten.status, body: await rewritten.json(), calls };
}

const EMPTY_PAGE = {
  items: [] as Booking[],
  total: 0,
  current_page: "Pg%3D%3D",
  current_page_backwards: "PA%3D%3D",
  previous_page: null,
  next_page: null,
};

describe("bookings list", () => {
  it("asks only for the signed-in account's bookings", async () => {
    const calls: Call[] = [];
    await request("/booking/flight-orders", {
      pageFor: async (accountId, req) => {
        calls.push({ accountId, request: req });
        return EMPTY_PAGE;
      },
    }, calls);

    expect(calls[0]!.accountId).toBe(ACCOUNT.id);
  });

  it("defaults to the first page, twenty at a time", async () => {
    const calls: Call[] = [];
    await request("/booking/flight-orders", {
      pageFor: async (accountId, req) => {
        calls.push({ accountId, request: req });
        return EMPTY_PAGE;
      },
    }, calls);

    expect(calls[0]!.request).toMatchObject({ cursor: FIRST_PAGE, size: 20 });
  });

  it("passes the filters through, normalising airport codes", async () => {
    const calls: Call[] = [];
    await request("/booking/flight-orders?origin=osl&destination=jfk&status=confirmed&booking_reference=CX4CQP", {
      pageFor: async (accountId, req) => {
        calls.push({ accountId, request: req });
        return EMPTY_PAGE;
      },
    }, calls);

    expect((calls[0]!.request as { filters: unknown }).filters).toEqual({
      origin: "OSL",
      destination: "JFK",
      status: "confirmed",
      bookingReference: "CX4CQP",
    });
  });

  it("refuses a mangled cursor the way sqlakeyset does", async () => {
    // 400 with this wording, not a 422 - it is not a schema failure, and
    // silently restarting the list would repeat rows the reader had passed.
    const { status, body } = await request("/booking/flight-orders?cursor=garbage", {
      pageFor: unreachable,
    });
    expect(status).toBe(400);
    expect(body).toEqual({ detail: "Invalid cursor value" });
  });

  it("refuses a page size the response could not sustain", async () => {
    expect((await request("/booking/flight-orders?size=500", { pageFor: unreachable })).status).toBe(422);
  });
});

describe("one booking", () => {
  it("says not found, not forbidden, for someone else's booking", async () => {
    // Telling them apart would confirm the id exists, which is exactly what
    // somebody guessing ids is trying to learn.
    const { status, body } = await request(
      "/booking/flight-orders/by-id/06b4f792-1c2f-4f7f-ad29-62ecda1100dc",
      { byIdFor: async () => null },
    );
    expect(status).toBe(404);
    expect(body).toEqual({ detail: "Booking not found" });
  });

  it("scopes the ticket lookup to the account too", async () => {
    const calls: Call[] = [];
    await request("/booking/flight-orders/by-ticket/0571234567890", {
      byTicketNumberFor: async (accountId: string) => {
        calls.push({ accountId });
        return null;
      },
    }, calls);

    expect(calls[0]!.accountId).toBe(ACCOUNT.id);
  });

  it("answers the same for an unknown ticket as for one it cannot see", async () => {
    const { status, body } = await request("/booking/flight-orders/by-ticket/0000000000000", {
      byTicketNumberFor: async () => null,
    });
    expect(status).toBe(404);
    expect(body).toEqual({ detail: "Booking not found" });
  });
});

describe("without a session", () => {
  it("does not reach the database at all", async () => {
    const context = {
      accounts: { byEmail: unreachable },
      tokens: { verify: unreachable },
      credential: null,
      bookings: { pageFor: unreachable, byIdFor: unreachable, byTicketNumberFor: unreachable },
    } as unknown as RequestContext;

    const { response } = await handler.handle(
      new Request("https://api.flyt.africa/api/v1/booking/flight-orders"),
      { prefix: "/api/v1", context },
    );
    const rewritten = await asFastApiError(response!);
    expect(rewritten.status).toBe(401);
    expect(await rewritten.json()).toEqual({ detail: "Not authenticated" });
  });
});
