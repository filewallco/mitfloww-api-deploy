import { createScopedLogger } from "@/lib/logger";
import crypto from "node:crypto";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  authIdentities,
  companies,
  projects,
  testimonials,
  users,
  UserStatus,
  type UserRecord,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors/app-error";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getPasswordValidationError } from "@/lib/auth/password";
import { otpService } from "@/lib/auth/otp";
import { sessionService } from "@/lib/auth/session";
import { verifyGoogleIdToken } from "@/lib/auth/google";
import { emailService } from "@/lib/email/email-service";

export type AuthResult = {
  accessToken?: string;
  refreshToken?: string;
  user?: UserRecord;
  isNewUser?: boolean;
  requiresReactivation?: boolean;
  status?: "deactivated" | "scheduled_for_deletion";
  deactivatedAt?: string;
  email?: string;
  name?: string;
};

const scopedLogger = createScopedLogger("auth-service");
const PASSWORD_RESET_TOKEN_EXPIRY_MS = 30 * 60 * 1000;
const PASSWORD_RESET_SECRET =
  process.env.PASSWORD_RESET_SECRET ||
  process.env.SESSION_SECRET ||
  "mitfloww_password_reset_secret_2026";

type PasswordResetTokenPayload = {
  userId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

function createPasswordResetToken(userId: string): string {
  const issuedAt = Date.now();
  const payload: PasswordResetTokenPayload = {
    userId,
    issuedAt,
    expiresAt: issuedAt + PASSWORD_RESET_TOKEN_EXPIRY_MS,
    nonce: crypto.randomBytes(16).toString("hex"),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", PASSWORD_RESET_SECRET)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyPasswordResetToken(token: string): PasswordResetTokenPayload | null {
  const tokenParts = token.split(".");
  if (tokenParts.length !== 2) return null;
  const [encodedPayload, signature] = tokenParts;

  const expectedSignature = crypto
    .createHmac("sha256", PASSWORD_RESET_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as PasswordResetTokenPayload;

    if (
      !payload.userId ||
      !Number.isFinite(payload.issuedAt) ||
      !Number.isFinite(payload.expiresAt) ||
      !payload.nonce ||
      payload.issuedAt > Date.now() ||
      Date.now() > payload.expiresAt
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export class AuthService {
  /**
   * Step 1 of Signup: Request email verification OTP.
   */
  async requestSignupOtp(email: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new AppError("Please enter a valid email address.", 400, "invalid_email");
    }

    // Check if user already exists and has an active password
    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
      .limit(1);

    if (existing && existing.passwordHash) {
      throw new AppError(
        "An account with this email already exists. Please log in instead.",
        400,
        "account_exists",
      );
    }

    const { otp } = await otpService.createChallenge(normalizedEmail, "SIGNUP_VERIFICATION");
    await emailService.sendSignupOtpEmail(normalizedEmail, otp);
    scopedLogger.info("Signup OTP requested", { emailDomain: normalizedEmail.split("@")[1] });

    return {
      success: true,
      message: "Verification code sent to your email address.",
    };
  }

  /**
   * Validate Signup OTP. If user already exists, consume OTP and authenticate immediately.
   */
  async checkSignupOtp(input: {
    email: string;
    otp: string;
    meta?: { userAgent?: string; ipAddress?: string };
  }): Promise<{
    isValid: boolean;
    isExistingUser?: boolean;
    accessToken?: string;
    refreshToken?: string;
    user?: UserRecord;
    requiresReactivation?: boolean;
    status?: "deactivated" | "scheduled_for_deletion";
    deactivatedAt?: string;
    email?: string;
    name?: string;
  }> {
    const normalizedEmail = input.email.toLowerCase().trim();
    const verifyResult = await otpService.verifyOtp(
      normalizedEmail,
      "SIGNUP_VERIFICATION",
      input.otp,
      { consume: false },
    );

    if (!verifyResult.isValid) {
      scopedLogger.warn("Signup OTP verification failed", { reason: verifyResult.error || "invalid_code" });
      if (verifyResult.error === "EXPIRED") {
        throw new AppError("The verification code has expired. Please request a new one.", 400, "otp_expired");
      }
      if (verifyResult.error === "MAX_ATTEMPTS_EXCEEDED") {
        throw new AppError("Too many incorrect attempts. Please request a new code.", 429, "max_attempts_exceeded");
      }
      throw new AppError("Invalid verification code. Please check and try again.", 400, "invalid_otp");
    }

    // Check if user already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingUser) {
      // Consume the OTP code now
      await otpService.verifyOtp(normalizedEmail, "SIGNUP_VERIFICATION", input.otp, { consume: true });

      // Check account status & 30-day recovery window
      if (existingUser.deletedAt) {
        const daysElapsed = (Date.now() - existingUser.deletedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysElapsed > 30) {
          throw new AppError(
            "This account was permanently deleted more than 30 days ago and cannot be recovered.",
            403,
            "account_permanently_deleted",
          );
        }
        return {
          isValid: true,
          requiresReactivation: true,
          status: "scheduled_for_deletion",
          deactivatedAt: existingUser.deletedAt.toISOString(),
          email: existingUser.email || undefined,
          name: existingUser.displayName || existingUser.firstName || "Creator",
        };
      }

      if (existingUser.status === UserStatus.Deactivated) {
        return {
          isValid: true,
          requiresReactivation: true,
          status: "deactivated",
          deactivatedAt: (existingUser.updatedAt || existingUser.createdAt).toISOString(),
          email: existingUser.email || undefined,
          name: existingUser.displayName || existingUser.firstName || "Creator",
        };
      }

      if (existingUser.status === UserStatus.Suspended) {
        throw new AppError("Account has been suspended by administration.", 403, "account_suspended");
      }

      // Update last login
      await db
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, existingUser.id));

      const { accessToken, refreshToken } = await sessionService.createSession(existingUser.id, input.meta);

      return {
        isValid: true,
        isExistingUser: true,
        accessToken,
        refreshToken,
        user: existingUser,
      };
    }

    return { isValid: true, isExistingUser: false };
  }

  /**
   * Step 2 of Signup: Verify OTP and set password, returning authenticated session.
   */
  async verifySignup(input: {
    email: string;
    otp: string;
    password?: string;
    meta?: { userAgent?: string; ipAddress?: string };
  }): Promise<AuthResult> {
    const normalizedEmail = input.email.toLowerCase().trim();

    // Verify OTP
    const verifyResult = await otpService.verifyOtp(
      normalizedEmail,
      "SIGNUP_VERIFICATION",
      input.otp,
    );

    if (!verifyResult.isValid) {
      scopedLogger.warn("Login OTP verification failed", { reason: verifyResult.error || "invalid_code" });
      if (verifyResult.error === "EXPIRED") {
        throw new AppError("The verification code has expired. Please request a new one.", 400, "otp_expired");
      }
      if (verifyResult.error === "MAX_ATTEMPTS_EXCEEDED") {
        throw new AppError("Too many incorrect attempts. Please request a new code.", 429, "max_attempts_exceeded");
      }
      throw new AppError("Invalid verification code. Please check and try again.", 400, "invalid_otp");
    }

    // Hash password if provided
    let passwordHash: string | null = null;
    if (input.password) {
      const passwordError = getPasswordValidationError(input.password);
      if (passwordError) {
        throw new AppError(passwordError, 400, "invalid_password");
      }
      passwordHash = await hashPassword(input.password);
    }

    // Check if user already exists
    let [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
      .limit(1);

    let isNewUser = false;

    if (!user) {
      const id = crypto.randomUUID();
      const username = normalizedEmail.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "") || `user_${Date.now()}`;

      const [newUser] = await db
        .insert(users)
        .values({
          id,
          email: normalizedEmail,
          username,
          passwordHash,
          emailVerified: true,
          status: "active",
          planKey: "free",
          onboardingStep: 0,
          lastLoginAt: new Date(),
        })
        .returning();

      user = newUser;
      isNewUser = true;

      // Create default company profile
      await db.insert(companies).values({
        userId: user.id,
        name: "My Studio",
        tagline: "Creative Operations",
        industry: "Design & Creative",
        yearFounded: new Date().getFullYear().toString(),
        companySize: "1 Member",
      });

      // Send welcome email asynchronously
      await emailService.sendWelcomeEmail(user.email!, user.displayName || user.firstName || "");
    } else {
      // Existing user updating their email verification / password
      const updates: Partial<typeof users.$inferInsert> = {
        emailVerified: true,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      };
      if (passwordHash) {
        updates.passwordHash = passwordHash;
      }
      const [updated] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, user.id))
        .returning();
      user = updated;
    }

    const { accessToken, refreshToken } = await sessionService.createSession(user.id, input.meta);

    return {
      accessToken,
      refreshToken,
      user,
      isNewUser,
    };
  }

  /**
   * Password Login.
   */
  async loginWithPassword(input: {
    usernameOrEmail: string;
    password: string;
    meta?: { userAgent?: string; ipAddress?: string };
  }): Promise<AuthResult> {
    const lookup = input.usernameOrEmail.toLowerCase().trim();
    if (!lookup || !input.password) {
      throw new AppError("Username/email and password are required.", 400, "missing_credentials");
    }

    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.email, lookup), eq(users.username, lookup)))
      .limit(1);

    if (!user || !user.passwordHash) {
      throw new AppError("Invalid email or password.", 401, "invalid_credentials");
    }

    const { isValid, needsRehash } = await verifyPassword(input.password, user.passwordHash);
    if (!isValid) {
      throw new AppError("Invalid email or password.", 401, "invalid_credentials");
    }

    // Check account status & 30-day recovery window
    if (user.deletedAt) {
      const daysElapsed = (Date.now() - user.deletedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysElapsed > 30) {
        throw new AppError(
          "This account was permanently deleted more than 30 days ago and cannot be recovered.",
          403,
          "account_permanently_deleted",
        );
      }
      return {
        requiresReactivation: true,
        status: "scheduled_for_deletion",
        deactivatedAt: user.deletedAt.toISOString(),
        email: user.email || undefined,
        name: user.displayName || user.firstName || "Creator",
      };
    }

    if (user.status === UserStatus.Deactivated) {
      return {
        requiresReactivation: true,
        status: "deactivated",
        deactivatedAt: (user.updatedAt || user.createdAt).toISOString(),
        email: user.email || undefined,
        name: user.displayName || user.firstName || "Creator",
      };
    }

    if (user.status === UserStatus.Suspended) {
      throw new AppError("Account has been suspended by administration.", 403, "account_suspended");
    }

    // Seamlessly rehash legacy passwords to Argon2id
    if (needsRehash) {
      const newHash = await hashPassword(input.password);
      await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id));
    }

    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    const { accessToken, refreshToken } = await sessionService.createSession(user.id, input.meta);

    scopedLogger.info("Password login successful", { userId: user.id });
    return {
      accessToken,
      refreshToken,
      user,
    };
  }

  /**
   * Passwordless Login Step 1: Request Login OTP.
   */
  async requestLoginOtp(email: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new AppError("Please enter a valid email address.", 400, "invalid_email");
    }

    // Generic response to prevent account enumeration
    const genericResponse = {
      success: true,
      message: "If an account exists, a 6-digit code has been sent to your email.",
    };

    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!existingUser) {
      // User doesn't exist, do not send email
      return genericResponse;
    }

    const { otp } = await otpService.createChallenge(normalizedEmail, "LOGIN");
    await emailService.sendLoginOtpEmail(normalizedEmail, otp);
    scopedLogger.info("Login OTP requested", { emailDomain: normalizedEmail.split("@")[1] });

    return genericResponse;
  }

  /**
   * Passwordless Login Step 2: Verify Login OTP and sign in.
   */
  async verifyLoginOtp(input: {
    email: string;
    otp: string;
    meta?: { userAgent?: string; ipAddress?: string };
  }): Promise<AuthResult> {
    const normalizedEmail = input.email.toLowerCase().trim();

    const verifyResult = await otpService.verifyOtp(normalizedEmail, "LOGIN", input.otp);
    if (!verifyResult.isValid) {
      if (verifyResult.error === "EXPIRED") {
        throw new AppError("The login code has expired. Please request a new one.", 400, "otp_expired");
      }
      if (verifyResult.error === "MAX_ATTEMPTS_EXCEEDED") {
        throw new AppError("Too many incorrect attempts. Please request a new code.", 429, "max_attempts_exceeded");
      }
      throw new AppError("Invalid login code. Please check and try again.", 400, "invalid_otp");
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user) {
      throw new AppError("Account not found. Please sign up first.", 404, "user_not_found");
    }

    // Check account status & 30-day recovery window
    if (user.deletedAt) {
      const daysElapsed = (Date.now() - user.deletedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysElapsed > 30) {
        throw new AppError(
          "This account was permanently deleted more than 30 days ago and cannot be recovered.",
          403,
          "account_permanently_deleted",
        );
      }
      return {
        requiresReactivation: true,
        status: "scheduled_for_deletion",
        deactivatedAt: user.deletedAt.toISOString(),
        email: user.email || undefined,
        name: user.displayName || user.firstName || "Creator",
      };
    }

    if (user.status === UserStatus.Deactivated) {
      return {
        requiresReactivation: true,
        status: "deactivated",
        deactivatedAt: (user.updatedAt || user.createdAt).toISOString(),
        email: user.email || undefined,
        name: user.displayName || user.firstName || "Creator",
      };
    }

    if (user.status === UserStatus.Suspended) {
      throw new AppError("Account has been suspended by administration.", 403, "account_suspended");
    }

    await db
      .update(users)
      .set({ emailVerified: true, lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    const { accessToken, refreshToken } = await sessionService.createSession(user.id, input.meta);

    return {
      accessToken,
      refreshToken,
      user,
    };
  }

  /**
   * Google OAuth / OIDC Server-Side Verification.
   */
  async authenticateWithGoogle(input: {
    idToken: string;
    meta?: { userAgent?: string; ipAddress?: string };
  }): Promise<AuthResult> {
    const googleProfile = await verifyGoogleIdToken(input.idToken);

    // 1. Look up existing Google identity
    const [existingIdentity] = await db
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, "google"),
          eq(authIdentities.providerUserId, googleProfile.sub),
        ),
      )
      .limit(1);

    let user: UserRecord | undefined;
    let isNewUser = false;

    if (existingIdentity) {
      // Found via linked identity
      const [u] = await db
        .select()
        .from(users)
        .where(eq(users.id, existingIdentity.userId))
        .limit(1);
      user = u;
    }

    if (!user) {
      // Check if user exists by verified email
      const [existingByEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, googleProfile.email))
        .limit(1);

      if (existingByEmail) {
        user = existingByEmail;
        // Link Google identity to existing user
        await db.insert(authIdentities).values({
          userId: user.id,
          provider: "google",
          providerUserId: googleProfile.sub,
          email: googleProfile.email,
          emailVerified: googleProfile.emailVerified,
        });
      } else {
        // Create new user without requiring a password!
        const id = crypto.randomUUID();
        const username =
          googleProfile.email.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "") || `user_${Date.now()}`;
        const displayName = googleProfile.name || googleProfile.givenName || username;

        const [newUser] = await db
          .insert(users)
          .values({
            id,
            email: googleProfile.email,
            username,
            displayName,
            firstName: googleProfile.givenName || "",
            lastName: googleProfile.familyName || "",
            avatarUrl: googleProfile.picture || null,
            emailVerified: googleProfile.emailVerified,
            status: "active",
            planKey: "free",
            onboardingStep: 0,
            lastLoginAt: new Date(),
          })
          .returning();

        user = newUser;
        isNewUser = true;

        // Link identity
        await db.insert(authIdentities).values({
          userId: user.id,
          provider: "google",
          providerUserId: googleProfile.sub,
          email: googleProfile.email,
          emailVerified: googleProfile.emailVerified,
        });

        // Default company
        await db.insert(companies).values({
          userId: user.id,
          name: `${displayName}'s Company`,
          tagline: "Designing Ideas, Delivering Impact",
          industry: "Design & Creative",
          yearFounded: new Date().getFullYear().toString(),
          companySize: "1 Member",
        });

        await emailService.sendWelcomeEmail(user.email!, user.displayName || "");
      }
    }

    // Check account status & 30-day recovery window
    if (user.deletedAt) {
      const daysElapsed = (Date.now() - user.deletedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysElapsed > 30) {
        throw new AppError(
          "This account was permanently deleted more than 30 days ago and cannot be recovered.",
          403,
          "account_permanently_deleted",
        );
      }
      return {
        requiresReactivation: true,
        status: "scheduled_for_deletion",
        deactivatedAt: user.deletedAt.toISOString(),
        email: user.email || undefined,
        name: user.displayName || user.firstName || "Creator",
      };
    }

    if (user.status === UserStatus.Deactivated) {
      return {
        requiresReactivation: true,
        status: "deactivated",
        deactivatedAt: (user.updatedAt || user.createdAt).toISOString(),
        email: user.email || undefined,
        name: user.displayName || user.firstName || "Creator",
      };
    }

    if (user.status === UserStatus.Suspended) {
      throw new AppError("Account has been suspended by administration.", 403, "account_suspended");
    }

    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    const { accessToken, refreshToken } = await sessionService.createSession(user.id, input.meta);

    return {
      accessToken,
      refreshToken,
      user,
      isNewUser,
    };
  }

  /**
   * Password Reset Step 1: Email a signed, expiring reset link.
   */
  async requestPasswordResetLink(email: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new AppError("Please enter a valid email address.", 400, "invalid_email");
    }

    const genericResponse = {
      success: true,
      message: "If an account exists with this email, a password reset link has been sent.",
    };

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      // Do not disclose account absence
      return genericResponse;
    }

    const resetToken = createPasswordResetToken(user.id);
    const appUrl = (process.env.APP_URL || "https://mitfloww.com").replace(/\/+$/, "");
    const resetUrl = `${appUrl}/login?mode=reset-password&token=${encodeURIComponent(resetToken)}`;
    await emailService.sendPasswordResetEmail({
      email: normalizedEmail,
      name: user.displayName || user.firstName || undefined,
      resetUrl,
    });

    return genericResponse;
  }

  /**
   * Password Reset Step 2: Verify the link token and update the password.
   */
  async verifyPasswordReset(input: {
    token: string;
    newPassword: string;
  }): Promise<UserRecord> {
    const passwordError = getPasswordValidationError(input.newPassword);
    if (passwordError) {
      throw new AppError(passwordError, 400, "invalid_password");
    }

    const tokenPayload = verifyPasswordResetToken(input.token);
    if (!tokenPayload) {
      throw new AppError("This password reset link is invalid or expired. Please request a new one.", 400, "invalid_reset_token");
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, tokenPayload.userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      throw new AppError("User account not found.", 404, "user_not_found");
    }

    // Any account update, including a previous password reset, invalidates older links.
    if (user.updatedAt.getTime() > tokenPayload.issuedAt) {
      throw new AppError("This password reset link is invalid or expired. Please request a new one.", 400, "invalid_reset_token");
    }

    const newHash = await hashPassword(input.newPassword);

    // Update password
    const updatedAt = new Date();
    const [updatedUser] = await db
      .update(users)
      .set({
        passwordHash: newHash,
        updatedAt,
      })
      // The compare-and-set condition prevents two old reset links from
      // succeeding concurrently after the first password change.
      .where(and(eq(users.id, user.id), lte(users.updatedAt, new Date(tokenPayload.issuedAt))))
      .returning();

    if (!updatedUser) {
      throw new AppError("This password reset link is invalid or expired. Please request a new one.", 400, "invalid_reset_token");
    }

    // Revoke all existing sessions for security. The user must sign in again with the new password.
    await sessionService.revokeAllSessions(user.id);

    // Send security alert email
    await emailService.sendSecurityAlertEmail(
      updatedUser.email || "",
      "Password Changed",
      "Your MitFloww account password was successfully updated. All other active sessions have been signed out.",
    );

    return updatedUser;
  }

  /**
   * Completes or advances an onboarding step.
   */
  async updateOnboardingStep(userId: string, step: number): Promise<UserRecord> {
    const [updated] = await db
      .update(users)
      .set({ onboardingStep: step, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    if (!updated) {
      throw new AppError("User not found.", 404, "user_not_found");
    }
    return updated;
  }

  /**
   * Reactivate an account that is deactivated or scheduled for deletion within 30 days.
   */
  async reactivateAccount(
    email: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthResult> {
    const normalizedEmail = email.toLowerCase().trim();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user) {
      throw new AppError("Account not found.", 404, "user_not_found");
    }

    if (user.deletedAt) {
      const daysElapsed = (Date.now() - user.deletedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysElapsed > 30) {
        throw new AppError(
          "This account was permanently deleted more than 30 days ago and cannot be recovered.",
          403,
          "account_permanently_deleted",
        );
      }
    }

    // Restore user
    const [reactivated] = await db
      .update(users)
      .set({
        status: "active",
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    // Restore company
    await db
      .update(companies)
      .set({
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(companies.userId, user.id));

    // Restore projects
    await db
      .update(projects)
      .set({
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(projects.userId, user.id));

    // Restore testimonials
    await db
      .update(testimonials)
      .set({
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(testimonials.userId, user.id));

    const { accessToken, refreshToken } = await sessionService.createSession(reactivated.id, meta);

    if (reactivated.email) {
      await emailService.sendAccountReactivatedEmail({
        email: reactivated.email,
        name: reactivated.displayName || reactivated.firstName || "Creator",
      });
    }

    return {
      accessToken,
      refreshToken,
      user: reactivated,
    };
  }
}

export const authService = new AuthService();
