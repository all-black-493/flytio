import { describe, expect, it } from "vitest";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { asFastApiError, matchFastApiValidationStatus } from "@interfaces/http/fastapi-errors";
import { router } from "@interfaces/http/router";

const handler = new OpenAPIHandler(router, { interceptors: [matchFastApiValidationStatus] });

async function request(url: string) {
  const { response } = await handler.handle(new Request(url), {
    prefix: "/api/v1",
    context: {} as never,
  });
  const rewritten = await asFastApiError(response!);
  return { status: rewritten.status, body: (await rewritten.json()) as { detail: { loc: unknown[]; msg: string; type: string }[] } };
}

describe("error bodies", () => {
  it("answers a validation failure the way FastAPI does", async () => {
    const { status, body } = await request("https://x/api/v1/shopping/places?lat=1&lng=2");

    expect(status).toBe(422);
    // The frontend's errorDetail() reads exactly this key; oRPC's own
    // envelope has no `detail` and would surface as "Request failed (422)".
    expect(Array.isArray(body.detail)).toBe(true);
    expect(body.detail[0]!).toMatchObject({
      msg: "Provide either `query` or `lat`+`lng`+`rad`, not both",
    });
    expect(body.detail[0]!).toHaveProperty("loc");
    expect(body.detail[0]!).toHaveProperty("type");
  });

  it("reports which field failed", async () => {
    const { body } = await request("https://x/api/v1/flights/popular-destinations?limit=99");
    expect(body.detail[0]!.loc).toContain("limit");
  });

  it("carries a plain message as a string, as FastAPI's HTTPException does", async () => {
    const plain = await asFastApiError(
      Response.json({ code: "UNAUTHORIZED", status: 401, message: "Not authenticated" }, { status: 401 }),
    );
    expect(await plain.json()).toEqual({ detail: "Not authenticated" });
  });

  it("leaves a body that already speaks FastAPI alone", async () => {
    const already = Response.json({ detail: "Password is incorrect." }, { status: 400 });
    expect(await (await asFastApiError(already)).json()).toEqual({ detail: "Password is incorrect." });
  });

  it("does not touch a success", async () => {
    const ok = Response.json({ status: "alive" });
    expect(await (await asFastApiError(ok)).json()).toEqual({ status: "alive" });
  });

  it("keeps headers that carry meaning, like WWW-Authenticate", async () => {
    const challenge = await asFastApiError(
      Response.json({ message: "Not authenticated" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } }),
    );
    expect(challenge.headers.get("WWW-Authenticate")).toBe("Bearer");
  });
});
