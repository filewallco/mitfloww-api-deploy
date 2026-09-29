import { Router } from "express";
import { z } from "zod";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { sessionService, REFRESH_COOKIE_NAME } from "@/lib/auth/session";
import { authService } from "@/lib/services/auth-service";
import { asyncHandler } from "@/lib/api/route";

export const authRouter = Router();

function getRequestMeta(req: any) {
  return {
    userAgent: req.headers["user-agent"] || undefined,
    ipAddress: (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().split(",")[0].trim() || undefined,
  };
}

// ----------------------------------------------------
// Validation Schemas
// ----------------------------------------------------
const requestEmailSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
});

const verifySignupSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
  otp: z.string().trim().length(6, "Verification code must be 6 digits"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
});

const loginPasswordSchema = z.object({
  usernameOrEmail: z.string().trim().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

const verifyLoginOtpSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
  otp: z.string().trim().length(6, "Verification code must be 6 digits"),
});

const googleAuthSchema = z.object({
  idToken: z.string().trim().min(1, "Google ID token is required"),
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "Password reset token is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

const updateOnboardingSchema = z.object({
  step: z.number().int().min(0).max(3),
});

// ----------------------------------------------------
// Endpoints
// ----------------------------------------------------

/**
 * Request Signup OTP
 */
authRouter.post(
  "/signup/request-otp",
  asyncHandler(async (req, res) => {
    const parsed = requestEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid email" });
    }

    const result = await authService.requestSignupOtp(parsed.data.email);
    return res.json(result);
  }),
);

/**
 * Verify Signup OTP & Create / Activate Account
 */
authRouter.post(
  "/signup/verify",
  asyncHandler(async (req, res) => {
    const parsed = verifySignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const result = await authService.verifySignup({
      email: parsed.data.email,
      otp: parsed.data.otp,
      password: parsed.data.password,
      meta: getRequestMeta(req),
    });

    sessionService.setCookies(res, result.refreshToken!, result.user!.id);

    return res.status(201).json({
      accessToken: result.accessToken,
      user: result.user,
      isNewUser: result.isNewUser,
    });
  }),
);

/**
 * Validate Signup OTP without consuming it
 */
authRouter.post(
  "/signup/check-otp",
  asyncHandler(async (req, res) => {
    const parsed = verifySignupSchema.pick({ email: true, otp: true }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const result = await authService.checkSignupOtp({
      email: parsed.data.email,
      otp: parsed.data.otp,
      meta: getRequestMeta(req),
    });

    if (result.refreshToken && result.user) {
      sessionService.setCookies(res, result.refreshToken, result.user.id);
    }

    return res.json(result);
  }),
);

/**
 * Password Login
 */
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const result = await authService.loginWithPassword({
      usernameOrEmail: parsed.data.usernameOrEmail,
      password: parsed.data.password,
      meta: getRequestMeta(req),
    });

    if (result.requiresReactivation) {
      return res.json(result);
    }

    sessionService.setCookies(res, result.refreshToken!, result.user!.id);

    return res.json({
      accessToken: result.accessToken,
      user: result.user,
    });
  }),
);

/**
 * Passwordless Login: Request OTP
 */
authRouter.post(
  "/login/request-otp",
  asyncHandler(async (req, res) => {
    const parsed = requestEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid email" });
    }

    const result = await authService.requestLoginOtp(parsed.data.email);
    return res.json(result);
  }),
);

/**
 * Passwordless Login: Verify OTP
 */
authRouter.post(
  "/login/verify-otp",
  asyncHandler(async (req, res) => {
    const parsed = verifyLoginOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const result = await authService.verifyLoginOtp({
      email: parsed.data.email,
      otp: parsed.data.otp,
      meta: getRequestMeta(req),
    });

    if (result.requiresReactivation) {
      return res.json(result);
    }

    sessionService.setCookies(res, result.refreshToken!, result.user!.id);

    return res.json({
      accessToken: result.accessToken,
      user: result.user,
      isNewUser: result.isNewUser,
    });
  }),
);

/**
 * Google OAuth Login / Signup
 */
authRouter.post(
  "/google",
  asyncHandler(async (req, res) => {
    const parsed = googleAuthSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid token" });
    }

    const result = await authService.authenticateWithGoogle({
      idToken: parsed.data.idToken,
      meta: getRequestMeta(req),
    });

    if (result.requiresReactivation) {
      return res.json(result);
    }

    sessionService.setCookies(res, result.refreshToken!, result.user!.id);

    return res.json({
      accessToken: result.accessToken,
      user: result.user,
      isNewUser: result.isNewUser,
    });
  }),
);

/**
 * Reactivate Deactivated / Pending Deletion Account
 */
authRouter.post(
  "/reactivate",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ email: z.string().trim().email() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    const result = await authService.reactivateAccount(parsed.data.email, getRequestMeta(req));
    sessionService.setCookies(res, result.refreshToken!, result.user!.id);

    return res.json({
      accessToken: result.accessToken,
      user: result.user,
      message: "Account reactivated successfully.",
    });
  }),
);

/**
 * Public Google OAuth Client ID for frontend initialization
 */
authRouter.get(
  "/google/client-id",
  asyncHandler(async (_req, res) => {
    return res.json({
      clientId: process.env.GOOGLE_CLIENT_ID || null,
    });
  }),
);

/**
 * Password Reset: Email reset link
 */
authRouter.post(
  "/forgot-password/request-link",
  asyncHandler(async (req, res) => {
    const parsed = requestEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid email" });
    }

    const result = await authService.requestPasswordResetLink(parsed.data.email);
    return res.json(result);
  }),
);

/**
 * Password Reset: Verify link token & Set New Password
 */
authRouter.post(
  "/forgot-password/reset",
  asyncHandler(async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const result = await authService.verifyPasswordReset({
      token: parsed.data.token,
      newPassword: parsed.data.newPassword,
    });

    return res.json({
      user: result,
      message: "Password updated successfully.",
    });
  }),
);

/**
 * Rotate Refresh Token & Issue Fresh Access Token
 */
authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      return res.status(401).json({ error: "No refresh token provided." });
    }

    const result = await sessionService.rotateSession(refreshToken, getRequestMeta(req));
    sessionService.setCookies(res, result.refreshToken, result.user.id);

    return res.json({
      accessToken: result.accessToken,
      user: result.user,
    });
  }),
);

/**
 * Logout Current Session
 */
authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (refreshToken) {
      await sessionService.revokeSessionByToken(refreshToken);
    }
    sessionService.clearCookies(res);
    return res.json({ success: true });
  }),
);

/**
 * Logout All Devices / Sessions
 */
authRouter.post(
  "/logout-all",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    await sessionService.revokeAllSessions(actor.id);
    sessionService.clearCookies(res);
    return res.json({ success: true });
  }),
);

/**
 * Get Current Active Actor
 */
authRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    return res.json({ user: actor });
  }),
);

/**
 * Update Onboarding Step
 */
authRouter.post(
  "/onboarding-step",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const parsed = updateOnboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid step number." });
    }

    const updated = await authService.updateOnboardingStep(actor.id, parsed.data.step);
    return res.json({ user: updated });
  }),
);


/**
 * Get Active Sessions
 */
authRouter.get(
  "/sessions",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    const sessions = await sessionService.getUserSessions(actor.id, refreshToken);
    return res.json({ sessions, status: "success" });
  }),
);

/**
 * Revoke Specific Session (Logout Manually)
 */
authRouter.post(
  "/sessions/:id/revoke",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    await sessionService.revokeSessionForUser(actor.id, String(req.params.id));
    return res.json({ success: true, message: "Session revoked successfully." });
  }),
);

/**
 * Revoke All Other Sessions (Logout from Other Apps)
 */
authRouter.post(
  "/sessions/revoke-others",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    await sessionService.revokeOtherSessions(actor.id, refreshToken);
    return res.json({ success: true, message: "All other sessions revoked successfully." });
  }),
);

/**
 * Change Account Password
 */
const changePasswordBodySchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

authRouter.post(
  "/change-password",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const parsed = changePasswordBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    }
    await authService.changePassword(actor.id, parsed.data.currentPassword, parsed.data.newPassword);
    return res.json({ success: true, message: "Password updated successfully." });
  }),
);
