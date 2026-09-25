import crypto from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
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

    return {
      success: true,
      message: "Verification code sent to your email address.",
    };
  }

  /**
   * Validate Signup OTP without consuming it
   */
  async checkSignupOtp(input: { email: string; otp: string }): Promise<{ isValid: boolean }> {
    const normalizedEmail = input.email.toLowerCase().trim();
    const verifyResult = await otpService.verifyOtp(
      normalizedEmail,
      "SIGNUP_VERIFICATION",
      input.otp,
      { consume: false },
    );

    if (!verifyResult.isValid) {
      if (verifyResult.error === "EXPIRED") {
        throw new AppError("The verification code has expired. Please request a new one.", 400, "otp_expired");
      }
      if (verifyResult.error === "MAX_ATTEMPTS_EXCEEDED") {
        throw new AppError("Too many incorrect attempts. Please request a new code.", 429, "max_attempts_exceeded");
      }
      throw new AppError("Invalid verification code. Please check and try again.", 400, "invalid_otp");
    }

    return { isValid: true };
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
      if (input.password.length < 8) {
        throw new AppError("Password must be at least 8 characters long.", 400, "password_too_short");
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
   * Password Reset Step 1: Request Reset OTP.
   */
  async requestPasswordResetOtp(email: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new AppError("Please enter a valid email address.", 400, "invalid_email");
    }

    const genericResponse = {
      success: true,
      message: "If an account exists with this email, a reset code has been sent.",
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

    const { otp } = await otpService.createChallenge(normalizedEmail, "PASSWORD_RESET");
    await emailService.sendPasswordResetOtpEmail(normalizedEmail, otp);

    return genericResponse;
  }

  /**
   * Password Reset Step 2: Verify OTP and update password.
   */
  async verifyPasswordReset(input: {
    email: string;
    otp: string;
    newPassword: string;
    meta?: { userAgent?: string; ipAddress?: string };
  }): Promise<AuthResult> {
    const normalizedEmail = input.email.toLowerCase().trim();

    if (!input.newPassword || input.newPassword.length < 8) {
      throw new AppError("Password must be at least 8 characters long.", 400, "password_too_short");
    }

    const verifyResult = await otpService.verifyOtp(normalizedEmail, "PASSWORD_RESET", input.otp);
    if (!verifyResult.isValid) {
      if (verifyResult.error === "EXPIRED") {
        throw new AppError("The reset code has expired. Please request a new one.", 400, "otp_expired");
      }
      if (verifyResult.error === "MAX_ATTEMPTS_EXCEEDED") {
        throw new AppError("Too many incorrect attempts. Please request a new code.", 429, "max_attempts_exceeded");
      }
      throw new AppError("Invalid reset code. Please check and try again.", 400, "invalid_otp");
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      throw new AppError("User account not found.", 404, "user_not_found");
    }

    const newHash = await hashPassword(input.newPassword);

    // Update password
    const [updatedUser] = await db
      .update(users)
      .set({
        passwordHash: newHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    // Revoke all existing sessions for security
    await sessionService.revokeAllSessions(user.id);

    // Issue fresh session
    const { accessToken, refreshToken } = await sessionService.createSession(user.id, input.meta);

    // Send security alert email
    await emailService.sendSecurityAlertEmail(
      updatedUser.email!,
      "Password Changed",
      "Your MitFloww account password was successfully updated. All other active sessions have been signed out.",
    );

    return {
      accessToken,
      refreshToken,
      user: updatedUser,
    };
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
