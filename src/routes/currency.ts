import { Router } from "express";
import { asyncHandler } from "@/lib/api/route";
import { currencyRateService } from "@/lib/services/currency-service";

export const currencyRouter = Router();

// GET /api/currency/rates - Cached exchange rates
currencyRouter.get(
  "/rates",
  asyncHandler(async (_req, res) => {
    const data = await currencyRateService.getRates();
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.json(data);
  })
);
