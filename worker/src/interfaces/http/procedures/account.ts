import { implement } from "@orpc/server";
import { accountContract } from "@interfaces/http/contract/account";
import { requireAccount } from "@interfaces/http/authenticated";
import type { RequestContext } from "@interfaces/http/context";

const os = implement(accountContract).$context<RequestContext>();

export const account = {
  me: os.me.use(requireAccount).handler(({ context }) => ({
    id: context.account.id,
    email: context.account.email,
    is_staff: context.account.isStaff,
    is_superuser: context.account.isSuperuser,
  })),
};
