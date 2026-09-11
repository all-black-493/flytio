import { oc } from "@orpc/contract";
import { userRead } from "@interfaces/http/schemas";

export const accountContract = {
  me: oc
    .route({ method: "GET", path: "/me", tags: ["Auth"], summary: "The signed-in account" })
    .output(userRead),
};
