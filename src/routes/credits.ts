import { Router } from "express";
import { creditService } from "@/lib/services/credit-service";
import { creditHistoryQueryParamsSchema, creditQuoteSchema } from "@/lib/validation/credits";
import type { CreditFeatureCostParams } from "@/lib/credits";
import { sendSuccess, parseWithSchema, asyncHandler } from "@/lib/api/route";

export const creditsRouter = Router();

creditsRouter.get("/balance", asyncHandler(async (_req, res) => {
  const data = await creditService.getCreditBalance();
  return sendSuccess(res, data);
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
