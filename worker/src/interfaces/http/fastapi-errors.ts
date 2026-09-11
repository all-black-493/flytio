import { ORPCError } from "@orpc/server";

/**
 * FastAPI answers 422 for a validation failure; oRPC answers 400. Both serve
 * these paths during the migration, so the status has to match.
 */
export async function matchFastApiValidationStatus<T>(
  options: { next(): Promise<T> },
): Promise<T> {
  try {
    return await options.next();
  } catch (error) {
    if (error instanceof ORPCError && error.code === "BAD_REQUEST" && error.status === 400) {
      throw new ORPCError("BAD_REQUEST", {
        status: 422,
        message: error.message,
        data: error.data,
        cause: error,
      });
    }
    throw error;
  }
}

type Issue = {
  code?: string;
  path?: (string | number)[];
  message?: string;
  input?: unknown;
};

type OrpcError = {
  code?: string;
  status?: number;
  message?: string;
  data?: { issues?: Issue[] };
};

/**
 * Rewrites oRPC's error envelope into FastAPI's. Everything downstream reads
 * `detail` - the frontend's errorDetail() does, and so does the mobile app -
 * and oRPC emits `message` instead, so a real error would otherwise surface
 * to the user as "Request failed (422)".
 *
 * `loc` carries zod's path and `type` its issue code, rather than pydantic's
 * own vocabulary for either. Both are read by people, not by code.
 */
export async function asFastApiError(response: Response): Promise<Response> {
  if (response.status < 400) return response;

  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);

  if (body === null || typeof body !== "object" || "detail" in body) return response;

  const error = body as OrpcError;
  const issues = error.data?.issues;

  const detail = issues?.length
    ? issues.map((issue) => ({
        type: issue.code ?? "value_error",
        loc: issue.path ?? [],
        msg: issue.message ?? "",
        input: issue.input ?? null,
      }))
    : (error.message ?? "Internal server error");

  // Everything but the framing of the old body: a stale Content-Length would
  // describe bytes that no longer exist.
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-type");

  // FastAPI challenges on every 401 it raises for a missing or bad credential.
  if (response.status === 401) headers.set("WWW-Authenticate", "Bearer");

  return Response.json({ detail }, { status: response.status, headers });
}
