import crypto from "node:crypto";
import type { Response } from "express";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users, UserStatus, type SessionRecord, type UserRecord } from "@/lib/db/schema";
import { AppError, UnauthorizedAppError } from "@/lib/errors/app-error";

const SESSION_SECRET = process.env.SESSION_SECRET || "mitfloww_secure_session_secret_key_2026";
const ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const REFRESH_TOKEN_EXPIRY_MS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export const REFRESH_COOKIE_NAME = "mitfloww_refresh";
export const LEGACY_SESSION_COOKIE_NAME = "mitfloww_session";

export type AccessTokenPayload = {
  sub: string; // userId
  sessionId: string;
  iat: number;
  exp: number;
};

/**
 * Creates a signed short-lived access token JWT (15-minute expiry).
 */
export function createAccessToken(userId: string, sessionId: string): string {
  const now = Date.now();
  const payload: AccessTokenPayload = {
    sub: userId,
    sessionId,
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRY_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies an access token.
 */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  const expectedSig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payloadB64)
    .digest("base64url");

  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as AccessTokenPayload;

    if (!payload.sub || !payload.exp) return null;
    if (Date.now() > payload.exp) return null; // Expired

    return payload;
  } catch {
    return null;
  }
}

/**
 * Computes SHA-256 hash of a raw refresh token before database storage.
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Backward compatibility: verify legacy HMAC session token if present.
 */
export function verifyLegacySessionToken(token: string): string | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payload, hmac] = token.split(".");
  if (!payload || !hmac) return null;
  const expectedHmac = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  if (hmac !== expectedHmac) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.userId || null;
  } catch {
    return null;
  }
}

export const verifySessionToken = verifyLegacySessionToken;


function parseUserAgent(ua?: string | null): { device: string; browser: string; os: string } {
  if (!ua) return { device: "Desktop Browser", browser: "Web Browser", os: "Unknown OS" };

  let browser = "Web Browser";
  let os = "Unknown OS";
  let device = "Desktop Device";

  if (/windows/i.test(ua)) os = "Windows";
  else if (/macintosh|mac os/i.test(ua)) os = "macOS";
  else if (/iphone|ipad|ipod/i.test(ua)) {
    os = "iOS";
    device = /ipad/i.test(ua) ? "iPad" : "iPhone";
  } else if (/android/i.test(ua)) {
    os = "Android";
    device = "Android Device";
  } else if (/linux/i.test(ua)) os = "Linux";

  if (/edg/i.test(ua)) browser = "Edge";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
  else if (/opera|opr/i.test(ua)) browser = "Opera";

  if (device === "Desktop Device") {
    device = `${browser} on ${os}`;
  } else {
    device = `${browser} on ${device}`;
  }

  return { device, browser, os };
}

function resolveIpLocation(ip?: string | null): string {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.") || ip === "localhost") {
    return "Local Network";
  }
  return "Online Device";
}

// In-memory cache for fast session validity lookups with instant eviction on revocation
type SessionCacheEntry = {
  status: "valid" | "revoked" | "expired";
  userId?: string;
  sessionId?: string;
  expiresAt?: number;
  cachedAt: number;
};

const sessionValidationCache = new Map<string, SessionCacheEntry>();
const CACHE_TTL_VALID_MS = 10_000; // 10s for valid sessions

function evictSessionCacheForUser(userId: string, keepRefreshTokenHash?: string | null) {
  for (const [key, entry] of sessionValidationCache.entries()) {
    if (entry.userId === userId) {
      if (keepRefreshTokenHash && key === keepRefreshTokenHash) {
        continue;
      }
      sessionValidationCache.set(key, {
        status: "revoked",
        userId,
        cachedAt: Date.now(),
      });
    }
  }
}

export class SessionService {
  /**
   * Authenticates and verifies that the incoming request's session has not been revoked.
   */
  async authenticateRequest(credentials: {
    bearerToken?: string;
    refreshToken?: string;
    sessionCookie?: string;
  }): Promise<
    | { status: "valid"; userId: string; sessionId: string }
    | { status: "revoked"; reason: string }
    | { status: "expired"; reason?: string }
    | { status: "invalid" }
  > {
    const now = Date.now();

    // 1. Check refresh token cookie (primary session token in production)
    if (credentials.refreshToken && typeof credentials.refreshToken === "string") {
      const trimmed = credentials.refreshToken.trim();
      if (trimmed.length >= 32) {
        const hash = hashRefreshToken(trimmed);
        const cached = sessionValidationCache.get(hash);

        if (cached) {
          if (cached.status === "revoked") {
            return { status: "revoked", reason: "Session has been revoked." };
          }
          if (cached.status === "valid" && cached.userId && cached.sessionId) {
            if (now - cached.cachedAt < CACHE_TTL_VALID_MS) {
              return { status: "valid", userId: cached.userId, sessionId: cached.sessionId };
            }
          }
        }

        const [sessionRecord] = await db
          .select({
            id: sessions.id,
            userId: sessions.userId,
            revokedAt: sessions.revokedAt,
            expiresAt: sessions.expiresAt,
          })
          .from(sessions)
          .where(eq(sessions.refreshTokenHash, hash))
          .limit(1);

        if (!sessionRecord) {
          sessionValidationCache.set(hash, { status: "revoked", cachedAt: now });
          return { status: "invalid" };
        }

        if (sessionRecord.revokedAt !== null) {
          sessionValidationCache.set(hash, {
            status: "revoked",
            userId: sessionRecord.userId,
            sessionId: sessionRecord.id,
            cachedAt: now,
          });
          return { status: "revoked", reason: "Session has been revoked." };
        }

        if (new Date() > sessionRecord.expiresAt) {
          return { status: "expired", reason: "Session has expired." };
        }

        sessionValidationCache.set(hash, {
          status: "valid",
          userId: sessionRecord.userId,
          sessionId: sessionRecord.id,
          expiresAt: sessionRecord.expiresAt.getTime(),
          cachedAt: now,
        });

        return {
          status: "valid",
          userId: sessionRecord.userId,
          sessionId: sessionRecord.id,
        };
      }
    }

    // 2. Check Bearer access token
    if (credentials.bearerToken && typeof credentials.bearerToken === "string") {
      const payload = verifyAccessToken(credentials.bearerToken);
      if (payload && payload.sessionId) {
        const cached = sessionValidationCache.get(payload.sessionId);
        if (cached) {
          if (cached.status === "revoked") {
            return { status: "revoked", reason: "Session has been revoked." };
          }
          if (cached.status === "valid" && cached.userId) {
            if (now - cached.cachedAt < CACHE_TTL_VALID_MS) {
              return { status: "valid", userId: cached.userId, sessionId: payload.sessionId };
            }
          }
        }

        const [sessionRecord] = await db
          .select({
            id: sessions.id,
            userId: sessions.userId,
            revokedAt: sessions.revokedAt,
            expiresAt: sessions.expiresAt,
          })
          .from(sessions)
          .where(eq(sessions.id, payload.sessionId))
          .limit(1);

        if (!sessionRecord || sessionRecord.revokedAt !== null) {
          sessionValidationCache.set(payload.sessionId, { status: "revoked", cachedAt: now });
          return { status: "revoked", reason: "Session has been revoked." };
        }

        if (new Date() > sessionRecord.expiresAt) {
          return { status: "expired", reason: "Session has expired." };
        }

        sessionValidationCache.set(payload.sessionId, {
          status: "valid",
          userId: sessionRecord.userId,
          sessionId: sessionRecord.id,
          expiresAt: sessionRecord.expiresAt.getTime(),
          cachedAt: now,
        });

        return {
          status: "valid",
          userId: sessionRecord.userId,
          sessionId: sessionRecord.id,
        };
      }
    }

    // 3. Fallback: Legacy HMAC session token
    if (credentials.sessionCookie && !credentials.refreshToken) {
      const userId = verifyLegacySessionToken(credentials.sessionCookie);
      if (userId) {
        const [activeSession] = await db
          .select({ id: sessions.id })
          .from(sessions)
          .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
          .limit(1);

        if (!activeSession) {
          return { status: "revoked", reason: "Session has been revoked." };
        }

        return { status: "valid", userId, sessionId: activeSession.id };
      }
    }

    return { status: "invalid" };
  }

  /**
   * Fetches all active non-revoked sessions for a user with device and location metadata.
   */
  async getUserSessions(
    userId: string,
    currentRefreshToken?: string,
  ): Promise<Array<{
    id: string;
    device: string;
    browser: string;
    os: string;
    ipAddress: string;
    location: string;
    isCurrent: boolean;
    lastUsedAt: string;
    createdAt: string;
  }>> {
    const currentHash = currentRefreshToken ? hashRefreshToken(currentRefreshToken.trim()) : null;

    const userSessions = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .orderBy(desc(sessions.lastUsedAt));

    // Deduplicate active sessions by unique device signature (device + browser + IP)
    const seenDevices = new Map<string, typeof userSessions[0]>();
    const duplicateIdsToRevoke: string[] = [];

    // Prioritize keeping the current active session
    let currentSessionId: string | null = null;
    if (currentHash) {
      const match = userSessions.find((s) => s.refreshTokenHash === currentHash);
      if (match) {
        currentSessionId = match.id;
        const key = `${match.userAgent || "ua"}::${match.ipAddress || "ip"}`;
        seenDevices.set(key, match);
      }
    }

    for (const sess of userSessions) {
      const key = `${sess.userAgent || "ua"}::${sess.ipAddress || "ip"}`;
      if (!seenDevices.has(key)) {
        seenDevices.set(key, sess);
      } else if (seenDevices.get(key)!.id !== sess.id) {
        duplicateIdsToRevoke.push(sess.id);
      }
    }

    // Clean up duplicate session records in the background
    if (duplicateIdsToRevoke.length > 0) {
      void Promise.all(
        duplicateIdsToRevoke.map((id) =>
          db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, id))
        )
      ).catch(() => {});
    }

    const uniqueSessions = Array.from(seenDevices.values());

    return uniqueSessions.map((sess) => {
      const parsed = parseUserAgent(sess.userAgent);
      const isCurrent = Boolean(
        currentSessionId ? sess.id === currentSessionId : currentHash && sess.refreshTokenHash === currentHash
      );
      return {
        id: sess.id,
        device: parsed.device,
        browser: parsed.browser,
        os: parsed.os,
        ipAddress: sess.ipAddress || "Unknown IP",
        location: resolveIpLocation(sess.ipAddress),
        isCurrent,
        lastUsedAt: sess.lastUsedAt.toISOString(),
        createdAt: sess.createdAt.toISOString(),
      };
    });
  }

  /**
   * Revokes a specific session belonging to a user.
   */
  async revokeSessionForUser(userId: string, sessionId: string): Promise<void> {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));

    sessionValidationCache.set(sessionId, { status: "revoked", userId, cachedAt: Date.now() });
    for (const [key, entry] of sessionValidationCache.entries()) {
      if (entry.sessionId === sessionId) {
        sessionValidationCache.set(key, { status: "revoked", userId, cachedAt: Date.now() });
      }
    }
  }

  /**
   * Revokes all sessions for a user except the current session.
   */
  async revokeOtherSessions(
    userId: string,
    options?: { currentRefreshToken?: string; currentSessionId?: string } | string,
  ): Promise<void> {
    const currentRefreshToken =
      typeof options === "string" ? options : options?.currentRefreshToken;
    const currentSessionId =
      typeof options === "object" ? options?.currentSessionId : undefined;

    const currentHash = currentRefreshToken ? hashRefreshToken(currentRefreshToken.trim()) : null;

    if (currentHash || currentSessionId) {
      const allActive = await db
        .select({ id: sessions.id, refreshTokenHash: sessions.refreshTokenHash })
        .from(sessions)
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

      for (const s of allActive) {
        const isCurrent = currentHash
          ? s.refreshTokenHash === currentHash
          : s.id === currentSessionId;

        if (!isCurrent) {
          await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, s.id));
          sessionValidationCache.set(s.refreshTokenHash, {
            status: "revoked",
            userId,
            sessionId: s.id,
            cachedAt: Date.now(),
          });
          sessionValidationCache.set(s.id, {
            status: "revoked",
            userId,
            sessionId: s.id,
            cachedAt: Date.now(),
          });
        }
      }
      evictSessionCacheForUser(userId, currentHash);
    } else {
      await this.revokeAllSessions(userId);
    }
  }

  /**
   * Creates a new server-side session in PostgreSQL, generating a fresh access token
   * and long-lived refresh token.
   */
  async createSession(
    userId: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<{ accessToken: string; refreshToken: string; session: SessionRecord }> {
    const rawRefreshToken = crypto.randomBytes(32).toString("hex");
    const refreshTokenHash = hashRefreshToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

    // Revoke any prior session for the same user on the identical device and IP to prevent duplicates
    if (meta?.userAgent && meta?.ipAddress) {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(sessions.userId, userId),
            eq(sessions.userAgent, meta.userAgent),
            eq(sessions.ipAddress, meta.ipAddress),
            isNull(sessions.revokedAt),
          ),
        );
    }

    const [session] = await db
      .insert(sessions)
      .values({
        userId,
        refreshTokenHash,
        userAgent: meta?.userAgent || null,
        ipAddress: meta?.ipAddress || null,
        expiresAt,
        lastUsedAt: new Date(),
      })
      .returning();

    const accessToken = createAccessToken(userId, session.id);

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      session,
    };
  }

  /**
   * Refreshes an active session with rotation and reuse detection.
   */
  async rotateSession(
    rawRefreshToken: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<{ accessToken: string; refreshToken: string; user: UserRecord }> {
    if (!rawRefreshToken || typeof rawRefreshToken !== "string") {
      throw new UnauthorizedAppError("Refresh token missing.");
    }

    const tokenHash = hashRefreshToken(rawRefreshToken.trim());

    // 1. Find session by hash
    const [existingSession] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, tokenHash))
      .limit(1);

    if (!existingSession) {
      throw new UnauthorizedAppError("Invalid refresh session.");
    }

    // 2. Reuse Detection: If session was already revoked, token theft may have occurred!
    if (existingSession.revokedAt !== null) {
      // Revoke all sessions for this user to protect their account
      await this.revokeAllSessions(existingSession.userId);
      throw new UnauthorizedAppError(
        "Security alert: Token reuse detected. All sessions revoked. Please log in again.",
      );
    }

    // 3. Expiration check
    if (new Date() > existingSession.expiresAt) {
      await this.revokeSession(existingSession.id);
      throw new UnauthorizedAppError("Session has expired. Please log in again.");
    }

    // 4. Fetch user
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, existingSession.userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user || user.status === UserStatus.Deactivated || user.status === UserStatus.Suspended) {
      await this.revokeSession(existingSession.id);
      throw new UnauthorizedAppError("User account not found or deactivated.");
    }

    // 5. Rotate: Issue new raw refresh token and update session
    const newRawRefreshToken = crypto.randomBytes(32).toString("hex");
    const newHash = hashRefreshToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

    await db
      .update(sessions)
      .set({
        refreshTokenHash: newHash,
        lastUsedAt: new Date(),
        expiresAt: newExpiresAt,
        userAgent: meta?.userAgent ?? existingSession.userAgent,
        ipAddress: meta?.ipAddress ?? existingSession.ipAddress,
      })
      .where(eq(sessions.id, existingSession.id));

    const newAccessToken = createAccessToken(user.id, existingSession.id);

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      user,
    };
  }

  /**
   * Revokes a specific session by its ID.
   */
  async revokeSession(sessionId: string): Promise<void> {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, sessionId));

    sessionValidationCache.set(sessionId, { status: "revoked", cachedAt: Date.now() });
  }

  /**
   * Revokes a session given the raw refresh token.
   */
  async revokeSessionByToken(rawRefreshToken: string): Promise<void> {
    if (!rawRefreshToken) return;
    const tokenHash = hashRefreshToken(rawRefreshToken.trim());
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.refreshTokenHash, tokenHash));

    sessionValidationCache.set(tokenHash, { status: "revoked", cachedAt: Date.now() });
  }

  /**
   * Revokes all active sessions for a user (e.g. "Logout of all devices").
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

    evictSessionCacheForUser(userId);
  }

  /**
   * Attaches HttpOnly, SameSite, Secure auth cookies to the response.
   */
  setCookies(res: Response, refreshToken: string, userId?: string, sessionId?: string): void {
    const isProd = process.env.NODE_ENV === "production";

    // Set secure rotating refresh cookie
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: REFRESH_TOKEN_EXPIRY_MS,
    });

    // Also set legacy cookie for seamless middleware compatibility during transition
    if (userId) {
      const legacyPayload = Buffer.from(
        JSON.stringify({ userId, sessionId, exp: Date.now() + REFRESH_TOKEN_EXPIRY_MS }),
      ).toString("base64url");
      const hmac = crypto
        .createHmac("sha256", SESSION_SECRET)
        .update(legacyPayload)
        .digest("base64url");
      res.cookie(LEGACY_SESSION_COOKIE_NAME, `${legacyPayload}.${hmac}`, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
        maxAge: REFRESH_TOKEN_EXPIRY_MS,
      });
    }
  }

  /**
   * Clears all auth cookies on logout.
   */
  clearCookies(res: Response): void {
    const isProd = process.env.NODE_ENV === "production";
    const cookieOpts = {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax" as const,
      path: "/",
    };

    res.clearCookie(REFRESH_COOKIE_NAME, cookieOpts);
    res.clearCookie(LEGACY_SESSION_COOKIE_NAME, cookieOpts);
  }
}

export const sessionService = new SessionService();
