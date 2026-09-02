import { resolveActiveActor } from "@/lib/auth/active-actor";

export type CreditBillingScope = {
  actorUserId: string;
  scopeId: string;
  scopeType: "personal" | "workspace";
};

/**
 * Resolves the credit owner for the current request.
 *
 * Credits currently belong to the actor's personal billing scope. Future
 * Studio and workspace plans can swap this to a workspace-owned scope without
 * rewriting callers.
 */
export async function resolveCreditBillingScope(): Promise<CreditBillingScope> {
  const actor = await resolveActiveActor();

  return {
    actorUserId: actor.id,
    scopeId: actor.id,
    scopeType: "personal",
  };
}
