import { DEFAULT_CREDIT_OWNER_ID } from "@/lib/credits/config/ledger";
import type { CreditPlanKey } from "@/lib/credits";

import { userService } from "@/lib/services/user-service";

export type ActiveActor = {
  email: string | null;
  id: string;
  name: string | null;

  plan: CreditPlanKey;
  clientShareLinkExpiryDays: number;
};

/**
 * Returns the current authenticated actor for server-side billing, storage,
 * upload ownership, and worker audit metadata.
 *
 * The repo is still in a temporary single-user mode, so this resolves to one
 * personal actor until real auth and workspace membership are introduced.
 */
export async function resolveActiveActor(): Promise<ActiveActor> {
  const id = DEFAULT_CREDIT_OWNER_ID;
  const user = await userService.getUser(id);

  return {
    email: user.email,
    id: user.id,
    name: user.displayName ?? user.id,

    plan: user.planKey as CreditPlanKey,
    clientShareLinkExpiryDays: user.clientShareLinkExpiryDays,
  };
}
