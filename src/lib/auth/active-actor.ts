import { AsyncLocalStorage } from "node:async_hooks";
import type { CreditPlanKey } from "@/lib/credits";
import { UnauthorizedAppError } from "@/lib/errors/app-error";
import { userService } from "@/lib/services/user-service";
import { sessionService, verifySessionToken } from "./session";

export const actorStorage = new AsyncLocalStorage<{ userId: string }>();

export type ActiveActor = {
  email: string | null;
  id: string;
  name: string | null;
  avatarUrl?: string | null;
  plan: CreditPlanKey;
  clientShareLinkExpiryDays: number;
};

/**
 * Returns the current active actor for server-side operations.
 * Resolves strictly from server-controlled session cookie, refresh cookie, or actorStorage.
 * Does not trust arbitrary client headers.
 */
export async function resolveActiveActor(req?: {
  cookies?: Record<string, string>;
}): Promise<ActiveActor> {
  let id: string | null = null;
  if (req?.cookies?.mitfloww_session) {
    id = verifySessionToken(req.cookies.mitfloww_session);
  }
  if (!id && req?.cookies?.mitfloww_refresh) {
    try {
      id = await sessionService.getUserIdByRefreshToken(req.cookies.mitfloww_refresh);
    } catch {
      // Fallback
    }
  }
  if (!id) {
    id = actorStorage.getStore()?.userId || null;
  }
  if (!id) {
    throw new UnauthorizedAppError("Authentication required.");
  }

  const user = await userService.getUser(id);

  return {
    email: user.email,
    id: user.id,
    name: user.displayName ?? user.id,
    avatarUrl: user.avatarUrl,
    plan: user.planKey as CreditPlanKey,
    clientShareLinkExpiryDays: user.clientShareLinkExpiryDays,
  };
}
