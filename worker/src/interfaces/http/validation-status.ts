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
