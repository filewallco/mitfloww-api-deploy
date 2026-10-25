import { AsyncLocalStorage } from "node:async_hooks";
import { type CreditPlanKey, fromCreditPlanKeyDbValue } from "@/lib/credits";
import { UnauthorizedAppError } from "@/lib/errors/app-error";
import { userService } from "@/lib/services/user-service";
import { type NavigationPreferences, DEFAULT_NAVIGATION_PREFERENCES } from "@/lib/db/schema";
import { isUserProfileComplete } from "@/lib/services/auth-service";
import { sessionService, REFRESH_COOKIE_NAME, LEGACY_SESSION_COOKIE_NAME } from "./session";

export const actorStorage = new AsyncLocalStorage<{ userId: string; sessionId?: string }>();

export type ActiveActor = {
  email: string | null;
  id: string;
  name: string | null;
  avatarUrl?: string | null;
  plan: CreditPlanKey;
  clientShareLinkExpiryDays: number;
  navigationPreferences: NavigationPreferences;
  navigationPreferencesVersion: number;
  onboardingStep: number;
  isProfileComplete: boolean;
};

/**
 * Returns the current active actor for server-side operations.
 * Resolves strictly from server-controlled session cookie or actorStorage.
 * Does not trust arbitrary client headers.
 */
export async function resolveActiveActor(req?: {
  cookies?: Record<string, string>;
  headers?: Record<string, any>;
  sessionRevoked?: boolean;
  authenticatedUserId?: string;
  authenticatedSessionId?: string;
}): Promise<ActiveActor> {
  if (req?.sessionRevoked) {
    throw new UnauthorizedAppError("Session has been revoked. Please sign in again.");
  }

  let id: string | null = req?.authenticatedUserId || actorStorage.getStore()?.userId || null;

  if (!id && (req?.cookies || req?.headers)) {
    const authHeader = req.headers?.authorization;
    const bearerToken =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : undefined;
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    const sessionCookie = req.cookies?.[LEGACY_SESSION_COOKIE_NAME];

    const result = await sessionService.authenticateRequest({
      bearerToken,
      refreshToken,
      sessionCookie,
    });

    if (result.status === "revoked") {
      throw new UnauthorizedAppError("Session has been revoked. Please sign in again.");
    }
    if (result.status === "valid" && result.userId) {
      id = result.userId;
    }
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
    plan: fromCreditPlanKeyDbValue(user.planKey),
    clientShareLinkExpiryDays: user.clientShareLinkExpiryDays,
    navigationPreferences: user.navigationPreferences ?? DEFAULT_NAVIGATION_PREFERENCES,
    navigationPreferencesVersion: user.navigationPreferencesVersion ?? 1,
    onboardingStep: user.onboardingStep,
    isProfileComplete: isUserProfileComplete(user),
  };
}
