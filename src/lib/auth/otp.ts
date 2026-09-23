import crypto from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { otpChallenges, type OtpPurpose } from "@/lib/db/schema";
import { AppError } from "@/lib/errors/app-error";

const OTP_SECRET = process.env.OTP_SECRET || process.env.SESSION_SECRET || "mitfloww_otp_signing_salt_2026";
const OTP_EXPIRY_MINUTES = 5;
const OTP_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

export type CreateOtpChallengeResult = {
  challengeId: string;
  otp: string; // Plaintext OTP returned ONLY to be dispatched via email, never to clients
  expiresAt: Date;
};

export type VerifyOtpResult = {
  isValid: boolean;
  error?: "EXPIRED" | "MAX_ATTEMPTS_EXCEEDED" | "INVALID" | "NOT_FOUND" | "ALREADY_CONSUMED";
};

export class OtpService {
  /**
   * Hashes an OTP with HMAC/SHA-256 using the server salt.
   */
  private hashOtp(otp: string): string {
    return crypto.createHmac("sha256", OTP_SECRET).update(otp).digest("hex");
  }

  /**
   * Generates a cryptographically secure 6-digit numeric OTP.
   */
  private generateSecure6DigitOtp(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  /**
   * Creates an OTP challenge for an email and purpose.
   * Enforces a 60-second cooldown between consecutive challenges for the same email.
   */
  async createChallenge(
    email: string,
    purpose: OtpPurpose,
  ): Promise<CreateOtpChallengeResult> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check cooldown: has an active challenge been created in the last 60 seconds?
    const [recent] = await db
      .select()
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.email, normalizedEmail),
          eq(otpChallenges.purpose, purpose),
          isNull(otpChallenges.consumedAt),
        ),
      )
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);

    if (recent) {
      const elapsedSeconds = (Date.now() - recent.createdAt.getTime()) / 1000;
      if (elapsedSeconds < OTP_COOLDOWN_SECONDS) {
        const remaining = Math.ceil(OTP_COOLDOWN_SECONDS - elapsedSeconds);
        throw new AppError(
          `Please wait ${remaining} seconds before requesting a new code.`,
          429,
          "rate_limited",
        );
      }
    }

    const otp = this.generateSecure6DigitOtp();
    const otpHashed = this.hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    const [created] = await db
      .insert(otpChallenges)
      .values({
        email: normalizedEmail,
        purpose,
        otpHashed,
        attemptsCount: 0,
        maxAttempts: MAX_ATTEMPTS,
        expiresAt,
      })
      .returning();

    return {
      challengeId: created.id,
      otp,
      expiresAt,
    };
  }

  /**
   * Verifies an OTP for a given email and purpose.
   * Increments attempts, invalidates if max attempts exceeded, and marks consumed on success.
   */
  async verifyOtp(
    email: string,
    purpose: OtpPurpose,
    candidateOtp: string,
  ): Promise<VerifyOtpResult> {
    const normalizedEmail = email.toLowerCase().trim();
    const cleanOtp = candidateOtp.trim();

    if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      return { isValid: false, error: "INVALID" };
    }

    // Find the latest unconsumed challenge for this email and purpose
    const [challenge] = await db
      .select()
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.email, normalizedEmail),
          eq(otpChallenges.purpose, purpose),
          isNull(otpChallenges.consumedAt),
        ),
      )
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);

    if (!challenge) {
      return { isValid: false, error: "NOT_FOUND" };
    }

    // Check expiration
    if (new Date() > challenge.expiresAt) {
      return { isValid: false, error: "EXPIRED" };
    }

    // Check max attempts
    if (challenge.attemptsCount >= challenge.maxAttempts) {
      return { isValid: false, error: "MAX_ATTEMPTS_EXCEEDED" };
    }

    // Compare hashes
    const candidateHash = this.hashOtp(cleanOtp);
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(candidateHash, "hex"),
      Buffer.from(challenge.otpHashed, "hex"),
    );

    if (!isMatch) {
      // Increment attempt count
      await db
        .update(otpChallenges)
        .set({ attemptsCount: challenge.attemptsCount + 1 })
        .where(eq(otpChallenges.id, challenge.id));

      if (challenge.attemptsCount + 1 >= challenge.maxAttempts) {
        return { isValid: false, error: "MAX_ATTEMPTS_EXCEEDED" };
      }

      return { isValid: false, error: "INVALID" };
    }

    // Mark consumed immediately
    await db
      .update(otpChallenges)
      .set({ consumedAt: new Date() })
      .where(eq(otpChallenges.id, challenge.id));

    return { isValid: true };
  }
}

export const otpService = new OtpService();
