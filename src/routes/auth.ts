import { Router } from "express";
import { z } from "zod";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { createSessionToken } from "@/lib/auth/session";
import { userService } from "@/lib/services/user-service";
import { asyncHandler } from "@/lib/api/route";

export const authRouter = Router();

const signupSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(50),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
});

const loginSchema = z.object({
  usernameOrEmail: z.string().trim().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

const resetPasswordSchema = z.object({
  usernameOrEmail: z.string().trim().min(1, "Username or email is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

authRouter.post("/signup", asyncHandler(async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
    return res.status(400).json({ error: errorMsg, details: parsed.error.issues });
  }

  const user = await userService.signup(parsed.data);
  const sessionToken = createSessionToken(user.id);

  res.cookie("mitfloww_session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600 * 1000,
  });

  return res.status(201).json({ user });
}));

authRouter.post("/login", asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
    return res.status(400).json({ error: errorMsg, details: parsed.error.issues });
  }

  const user = await userService.login(parsed.data);
  const sessionToken = createSessionToken(user.id);

  res.cookie("mitfloww_session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600 * 1000,
  });

  return res.json({ user });
}));

authRouter.post("/reset-password", asyncHandler(async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
    return res.status(400).json({ error: errorMsg, details: parsed.error.issues });
  }

  const user = await userService.resetPassword(parsed.data);
  const sessionToken = createSessionToken(user.id);

  res.cookie("mitfloww_session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600 * 1000,
  });

  return res.json({ user, message: "Password updated successfully" });
}));

authRouter.post("/logout", asyncHandler(async (_req, res) => {
  res.clearCookie("mitfloww_session", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return res.json({ success: true });
}));

authRouter.get("/me", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  return res.json({ user: actor });
}));
