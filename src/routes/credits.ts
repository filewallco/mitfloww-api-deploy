import { Router } from "express";
import { creditService } from "@/lib/services/credit-service";
import { creditHistoryQueryParamsSchema, creditQuoteSchema } from "@/lib/validation/credits";
import type { CreditFeatureCostParams } from "@/lib/credits";
import {
  CREDIT_PACK_KEYS,
  FEATURE_CREDIT_COSTS,
  STORAGE_ADD_ON_KEYS,
  getCreditPack,
} from "@/lib/credits";
import { z } from "zod";
import { sendSuccess, parseWithSchema, asyncHandler } from "@/lib/api/route";

export const creditsRouter = Router();

creditsRouter.get("/balance", asyncHandler(async (_req, res) => {
  const data = await creditService.getCreditBalance();
  return sendSuccess(res, data);
}));

creditsRouter.get("/catalog", asyncHandler(async (_req, res) => {
  return sendSuccess(res, {
    packs: CREDIT_PACK_KEYS.map((key) => getCreditPack(key)),
    storageAddOns: STORAGE_ADD_ON_KEYS.map((key) => ({
      credits: FEATURE_CREDIT_COSTS.storage[key].credits,
      key,
      storageGb: FEATURE_CREDIT_COSTS.storage[key].storageGb,
      validityDays: FEATURE_CREDIT_COSTS.storage[key].validityDays,
    })),
  });
}));

creditsRouter.post("/packs/:packKey/purchase", asyncHandler(async (req, res) => {
  const packKey = String(req.params.packKey || "");
  if (!CREDIT_PACK_KEYS.includes(packKey as (typeof CREDIT_PACK_KEYS)[number])) {
    return res.status(400).json({ error: "Invalid credit pack." });
  }

  const input = z.object({
    idempotencyKey: z.string().trim().min(8).max(128),
  }).parse(req.body);
  const pack = getCreditPack(packKey as (typeof CREDIT_PACK_KEYS)[number]);
  const { scope } = await creditService.getOrCreateCreditAccountForScope();
  const result = await creditService.grantCredits({
    credits: pack.credits,
    idempotencyKey: `credit-pack:${scope.scopeType}:${scope.scopeId}:${input.idempotencyKey}`,
    metadata: {
      featureReason: "credit_pack_purchase",
      packKey,
      priceInrMinorUnits: pack.priceInrMinorUnits,
    },
    scope,
    source: "purchased_pack",
    type: "purchase",
  });

  return sendSuccess(res, {
    balance: result.account.availableCredits,
    pack,
  });
}));

creditsRouter.get("/history", asyncHandler(async (req, res) => {
  const query = parseWithSchema(
    creditHistoryQueryParamsSchema,
    req.query,
  );
  const result = await creditService.getCreditHistory(undefined, query);

  return sendSuccess(
    res,
    {
      entries: result.items,
    },
    {
      meta: {
        count: result.items.length,
        pagination: result.pagination,
      },
    },
  );
}));

creditsRouter.post("/quote", asyncHandler(async (req, res) => {
  const input = parseWithSchema(creditQuoteSchema, req.body);
  const featureParams = {
    currency: input.projectCurrency,
    durationMinutes: input.durationMinutes,
    extraLargeUploadGb: input.extraLargeUploadGb,
    featureKey: input.featureKey,
    mediaType: input.mediaType,
    months: input.months,
    pageCount: input.pageCount,
    planKey: input.planKey,
    priorityProcessing: input.priorityProcessing,
    resolutionClass: input.resolutionClass,
    revisionAddOnKey: input.revisionAddOnKey,
    sizeBytes: input.sizeBytes,
    storageAddOnKey: input.storageAddOnKey,
    templateKey: input.templateKey,
    isSoftWatermark: input.isSoftWatermark,
  } as CreditFeatureCostParams;

  const data = await creditService.quoteFeatureCreditUsage({
    featureParams,
  });

  return sendSuccess(res, data);
}));
