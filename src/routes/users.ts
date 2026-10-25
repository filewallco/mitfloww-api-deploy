import { Router } from "express";
import { z } from "zod";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { CREDIT_PLAN_KEYS } from "@/lib/credits/config/plans";
import type { CreditPlanKey } from "@/lib/credits";
import { userService } from "@/lib/services/user-service";
import { creditService } from "@/lib/services/credit-service";
import { storageService } from "@/lib/services/storage-service";
import { asyncHandler } from "@/lib/api/route";
import { CONFIGURABLE_NAV_KEYS } from "@/lib/db/schema";

export const usersRouter = Router();

const settingsUpdateSchema = z.object({
  clientShareLinkExpiryDays: z.number().int().positive().optional(),
  navigationPreferences: z.record(z.string(), z.boolean()).optional(),
});

const notificationPreferencesSchema = z.object({
  email: z.object({
    clientReply: z.boolean(),
    clientComment: z.boolean(),
    clientApproveFile: z.boolean(),
    fileProcessingCompleted: z.boolean().default(true),
    securityAlerts: z.boolean(),
    promotional: z.boolean(),
  }),
  inApp: z.object({
    clientReply: z.boolean(),
    clientComment: z.boolean(),
    clientApproveFile: z.boolean(),
    fileProcessingCompleted: z.boolean().default(true),
    securityAlerts: z.boolean(),
    promotional: z.boolean(),
  }),
});

usersRouter.get("/me", asyncHandler(async (_req, res) => {
  const actor = await resolveActiveActor();
  return res.json({ user: actor });
}));

usersRouter.put("/me/plan", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor();
  const { planKey } = req.body || {};

  if (!planKey || !CREDIT_PLAN_KEYS.includes(planKey as CreditPlanKey)) {
    return res.status(400).json({ error: "Invalid planKey" });
  }

  const updatedUser = await userService.updateUserPlan(actor.id, planKey as CreditPlanKey);

  try {
    await creditService.getOrCreateCreditAccountForScope({
      actorUserId: actor.id,
      scopeId: actor.id,
      scopeType: "personal",
    });
    await storageService.getOrCreateStorageAccount({
      actorUserId: actor.id,
      scopeId: actor.id,
      scopeType: "personal",
    });
  } catch (err) {
    // Non-fatal if accounts don't exist yet, they will sync on next read
  }

  return res.json({ user: updatedUser });
}));

usersRouter.get("/me/notifications", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const preferences = await userService.getNotificationPreferences(actor.id);
  return res.json({ preferences });
}));

usersRouter.patch("/me/notifications", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const parsed = notificationPreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid notification preferences", details: parsed.error.issues });
  }

  const preferences = await userService.updateNotificationPreferences(actor.id, parsed.data);
  return res.json({ preferences, status: "success" });
}));

usersRouter.patch("/me/settings", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor();
  const parsed = settingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  if (parsed.data.navigationPreferences !== undefined) {
    const allowedKeys = [...CONFIGURABLE_NAV_KEYS, "dashboardNav"];
    const invalidKeys = Object.keys(parsed.data.navigationPreferences).filter(
      (k) => !allowedKeys.includes(k as any)
    );
    if (invalidKeys.length > 0) {
      return res.status(400).json({ error: `Invalid navigation item key(s): ${invalidKeys.join(", ")}` });
    }
    const projectsSelected = parsed.data.navigationPreferences.projectsNav !== false;
    const assetsSelected = parsed.data.navigationPreferences.assetsNav !== false;
    if (!projectsSelected && !assetsSelected) {
      return res.status(400).json({ error: "Select at least one of these: Projects or Assets" });
    }
  }

  if (parsed.data.clientShareLinkExpiryDays !== undefined) {
    const days = parsed.data.clientShareLinkExpiryDays;
    const isFree = actor.plan === "free";
    const isStandardOrPro = actor.plan === "standard" || actor.plan === "pro";
    
    if (isFree && days > 1) {
      return res.status(403).json({ error: "Upgrade plan to increase expiry" });
    }
    if (isStandardOrPro && days > 7) {
      return res.status(403).json({ error: "Upgrade plan to increase expiry further" });
    }
    if (days > 30) {
      return res.status(400).json({ error: "Maximum expiry is 30 days" });
    }
  }

  const updatedUser = await userService.updateUserSettings(actor.id, parsed.data);
  return res.json({ user: updatedUser });
}));
