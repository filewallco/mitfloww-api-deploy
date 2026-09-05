import { Router } from "express";
import { z } from "zod";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { createSessionToken } from "@/lib/auth/session";
import { userService } from "@/lib/services/user-service";
import { asyncHandler } from "@/lib/api/route";

export const authRouter = Router();

const signupSchema = z.object({
  email: z.string().trim().email(),
  username: z.string().trim().min(3).max(50),
  password: z.string().min(6),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
});

const loginSchema = z.object({
  usernameOrEmail: z.string().trim().min(1),
  password: z.string().min(1),
});

authRouter.post("/signup", asyncHandler(async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid signup data", details: parsed.error.issues });
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
    return res.status(400).json({ error: "Invalid login data", details: parsed.error.issues });
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

authRouter.post("/logout", asyncHandler(async (_req, res) => {
  res.clearCookie("mitfloww_session", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res.json({ success: true });
}));

authRouter.get("/me", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  return res.json({ user: actor });
}));
