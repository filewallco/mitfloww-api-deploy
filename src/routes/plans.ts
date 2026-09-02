import { Router } from "express";
import { CREDIT_PLANS, CREDIT_PLAN_KEYS } from "@/lib/credits/config/plans";

export const plansRouter = Router();

plansRouter.get("/", (_req, res) => {
  return res.json({
    plans: CREDIT_PLANS,
    keys: CREDIT_PLAN_KEYS,
  });
});
