import { AppError } from "@/lib/errors/app-error";

export type GoogleTokenPayload = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
};

/**
 * Verifies a Google ID token server-side using Google's tokeninfo API.
 * Validates issuer, audience, expiry, and email verification status.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenPayload> {
  if (!idToken || typeof idToken !== "string") {
    throw new AppError("Google ID token is required.", 400, "invalid_google_token");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;

  try {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken.trim())}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as any;
      throw new AppError(
        errorData.error_description || "Invalid Google ID token.",
        401,
        "invalid_google_token",
      );
    }

    const payload = (await response.json()) as {
      sub?: string;
      email?: string;
      email_verified?: string | boolean;
      aud?: string;
      iss?: string;
      name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      exp?: string;
    };

    // 1. Verify Issuer
    const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
    if (!payload.iss || !validIssuers.includes(payload.iss)) {
      throw new AppError("Invalid Google token issuer.", 401, "invalid_google_token");
    }

    // 2. Verify Audience (if GOOGLE_CLIENT_ID is configured)
    if (clientId && payload.aud !== clientId) {
      throw new AppError("Google token audience mismatch.", 401, "invalid_google_token");
    }

    // 3. Verify Expiry
    if (payload.exp) {
      const expTimestamp = parseInt(payload.exp, 10) * 1000;
      if (Date.now() > expTimestamp) {
        throw new AppError("Google token has expired.", 401, "expired_google_token");
      }
    }

    // 4. Verify Identity
    if (!payload.sub || !payload.email) {
      throw new AppError("Incomplete Google profile.", 400, "invalid_google_token");
    }

    const emailVerified =
      payload.email_verified === true || payload.email_verified === "true";

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase().trim(),
      emailVerified,
      name: payload.name,
      givenName: payload.given_name,
      familyName: payload.family_name,
      picture: payload.picture,
    };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      err?.message || "Failed to verify Google identity.",
      401,
      "google_verification_failed",
    );
  }
}
