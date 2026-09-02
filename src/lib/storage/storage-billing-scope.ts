import { resolveActiveActor } from "@/lib/auth/active-actor";
import type { StorageScopeType } from "@/lib/storage/types";

export type StorageBillingScope = {
  actorUserId: string;
  scopeId: string;
  scopeType: StorageScopeType;
};

/**
 * Resolves the storage owner for the current request.
 *
 * Storage currently belongs to the actor's personal scope. Future workspace
 * plans can return a workspace scope here without changing upload callers.
 */
export async function resolveStorageBillingScope(): Promise<StorageBillingScope> {
  const actor = await resolveActiveActor();

  return {
    actorUserId: actor.id,
    scopeId: actor.id,
    scopeType: "personal",
  };
}
