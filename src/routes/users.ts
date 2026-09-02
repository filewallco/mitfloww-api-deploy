import { Router } from "express";
import { z } from "zod";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { CREDIT_PLAN_KEYS } from "@/lib/credits/config/plans";
import type { CreditPlanKey } from "@/lib/credits";
import { userService } from "@/lib/services/user-service";
import { asyncHandler } from "@/lib/api/route";

export const usersRouter = Router();

const settingsUpdateSchema = z.object({
  clientShareLinkExpiryDays: z.number().int().positive().optional(),
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
  return res.json({ user: updatedUser });
}));

usersRouter.patch("/me/settings", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor();
  const parsed = settingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
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
