import { Router } from "express";
import { getRequestLocale } from "@/middleware/locale";
import { translateOnDemand } from "@/lib/i18n/on-demand-translate";
import { onDemandTranslationBodySchema } from "@/lib/validation/i18n";
import { sendSuccess, parseWithSchema, asyncHandler } from "@/lib/api/route";

export const i18nRouter = Router();

i18nRouter.post("/translate", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const input = parseWithSchema(onDemandTranslationBodySchema, req.body);
  const data = await translateOnDemand({
    targetLocale: input.targetLocale ?? requestLocale,
    text: input.text,
  });

  return sendSuccess(res, data);
}));
