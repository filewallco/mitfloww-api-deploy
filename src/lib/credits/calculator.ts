import { normalizeProjectCurrency } from "@/lib/constants/currencies";
import {
  CREDIT_CURRENCY_MULTIPLIER_OVERRIDES,
  CREDIT_DEFAULT_INTERNATIONAL_MULTIPLIER,
  DEFAULT_CREDIT_PLAN_KEY,
  CREDIT_PLANS,
  CREDIT_REGIONAL_CURRENCY,
  CREDIT_REGIONAL_MULTIPLIER,
  CREDIT_USAGE_PROGRESS_THRESHOLDS,
  CREDIT_PACKS,
  FEATURE_CREDIT_COSTS,
  getPlanTierForCreditCosts,
  ZERO_CREDIT_ACTION_KEYS,
  type CreditPlanKey,
  type RevisionAddOnKey,
  type StorageAddOnKey,
  type TemplateCreditKey,
} from "./config";
import {
  InsufficientCreditsError,
  InvalidCreditAmountError,
  UnknownCreditFeatureError,
  UnknownCreditPlanError,
} from "./errors";
import type {
  CreditFeatureCostParams,
  CreditPack,
  CreditQuoteMessage,
  CreditRegion,
  CreditUsageProgress,
} from "./types";
import { getTestimonialTemplate } from "@/lib/testimonials/testimonial-templates";

function assertPositiveInteger(value: number, fieldName: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidCreditAmountError(
      `${fieldName} must be a non-negative integer.`,
    );
  }
}

function assertStrictPositiveInteger(value: number, fieldName: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new InvalidCreditAmountError(
      `${fieldName} must be a positive integer.`,
    );
  }
}

function assertKnownPlanKey(planKey: string): asserts planKey is CreditPlanKey {
  if (!(planKey in CREDIT_PLANS)) {
    throw new UnknownCreditPlanError();
  }
}

function getCreditsForPlanTier<T extends Record<string, number>>(
  planKey: CreditPlanKey,
  values: T,
) {
  const tier = getPlanTierForCreditCosts(planKey);
  return values[tier];
}

function calculateStorageAddOnBaseCredits(storageAddOnKey: StorageAddOnKey) {
  return FEATURE_CREDIT_COSTS.storage[storageAddOnKey].credits;
}

function calculateRevisionAddOnBaseCredits(revisionAddOnKey: RevisionAddOnKey) {
  return FEATURE_CREDIT_COSTS.revisions[revisionAddOnKey].credits;
}

function calculateFinalDraftMismatchReuploadBaseCredits() {
  return FEATURE_CREDIT_COSTS.revisions.finalDraftMismatchReupload.credits;
}

function calculateTemplateBaseCredits(templateKey: TemplateCreditKey) {
  return FEATURE_CREDIT_COSTS.templates[templateKey].credits;
}

function getExtraStepCount(totalUnits: number, includedUnits: number, stepSize: number) {
  if (totalUnits <= includedUnits) {
    return 0;
  }

  return Math.ceil((totalUnits - includedUnits) / stepSize);
}

/**
 * Returns the credit pricing region derived from project currency.
 */
export function getCreditRegionForCurrency(currency: string): CreditRegion {
  return normalizeProjectCurrency(currency) === CREDIT_REGIONAL_CURRENCY
    ? "regional"
    : "international";
}

/**
 * Returns the pricing multiplier for a project currency.
 */
export function getCreditMultiplierForCurrency(currency: string): number {
  const normalizedCurrency = normalizeProjectCurrency(currency);

  if (normalizedCurrency === CREDIT_REGIONAL_CURRENCY) {
    return CREDIT_REGIONAL_MULTIPLIER;
  }

  return (
    CREDIT_CURRENCY_MULTIPLIER_OVERRIDES[normalizedCurrency] ??
    CREDIT_DEFAULT_INTERNATIONAL_MULTIPLIER
  );
}

/**
 * Applies the centralized currency multiplier and rounds up so international
 * pricing never undercharges on fractional results.
 */
export function applyCurrencyCreditMultiplier(
  baseCredits: number,
  currency: string,
): number {
  assertPositiveInteger(baseCredits, "baseCredits");

  if (baseCredits === 0) {
    return 0;
  }

  return Math.ceil(baseCredits * getCreditMultiplierForCurrency(currency));
}

/**
 * Returns the included monthly credits for a plan.
 */
export function getPlanMonthlyCredits(planKey: CreditPlanKey): number {
  assertKnownPlanKey(planKey);
  return CREDIT_PLANS[planKey].monthlyCredits;
}

/**
 * Returns centralized plan limits used by feature and billing logic.
 */
export function getPlanFeatureLimits(planKey: CreditPlanKey) {
  assertKnownPlanKey(planKey);
  return CREDIT_PLANS[planKey];
}

/**
 * Returns centralized pack details for future checkout and admin flows.
 */
export function getCreditPack(packKey: keyof typeof CREDIT_PACKS): CreditPack {
  const pack = CREDIT_PACKS[packKey];

  return {
    credits: pack.credits,
    displayName: pack.displayName,
    key: packKey,
    priceInrMinorUnits: pack.priceInrMinorUnits,
  };
}

/**
 * Calculates storage add-on credits for the requested package.
 */
export function calculateStorageCreditCost(params: {
  currency: string;
  storageAddOnKey: StorageAddOnKey;
}) {
  return applyCurrencyCreditMultiplier(
    calculateStorageAddOnBaseCredits(params.storageAddOnKey),
    params.currency,
  );
}

/**
 * Calculates revision add-on credits for packaged or per-GB revision costs.
 */
export function calculateRevisionCreditCost(params: {
  currency: string;
  extraLargeUploadGb?: number;
  revisionAddOnKey?: RevisionAddOnKey;
}) {
  let baseCredits = 0;

  if (params.revisionAddOnKey) {
    baseCredits += calculateRevisionAddOnBaseCredits(params.revisionAddOnKey);
  }

  if (params.extraLargeUploadGb) {
    assertStrictPositiveInteger(
      params.extraLargeUploadGb,
      "extraLargeUploadGb",
    );

    baseCredits +=
      params.extraLargeUploadGb *
      FEATURE_CREDIT_COSTS.revisions.largeUploadOveragePerGb.creditsPerExtraGb;
  }

  return applyCurrencyCreditMultiplier(baseCredits, params.currency);
}

/**
 * Calculates the centralized credit cost for a final-draft mismatch reupload.
 */
export function calculateFinalDraftMismatchReuploadCreditCost(params: {
  currency: string;
}) {
  return applyCurrencyCreditMultiplier(
    calculateFinalDraftMismatchReuploadBaseCredits(),
    params.currency,
  );
}

/**
 * Calculates watermark credits for image, PDF, or video processing.
 */
export function calculateWatermarkCreditCost(params: {
  currency: string;
  durationMinutes?: number;
  mediaType: "image" | "pdf" | "video";
  pageCount?: number;
  planKey: CreditPlanKey;
  priorityProcessing?: boolean;
  resolutionClass?: "720p" | "1080p" | "4k";
  isSoftWatermark?: boolean;
}) {
  assertKnownPlanKey(params.planKey);

  let baseCredits = 0;

  if (params.mediaType === "image") {
    baseCredits = getCreditsForPlanTier(
      params.planKey,
      FEATURE_CREDIT_COSTS.watermark.image.byPlanTier,
    );
  } else if (params.mediaType === "pdf") {
    const pageCount = Math.max(1, params.pageCount ?? 1);
    const base = getCreditsForPlanTier(
      params.planKey,
      FEATURE_CREDIT_COSTS.watermark.pdf.baseCreditsByPlanTier,
    );
    const extraPageSteps = getExtraStepCount(
      pageCount,
      FEATURE_CREDIT_COSTS.watermark.pdf.includedPageCount,
      FEATURE_CREDIT_COSTS.watermark.pdf.extraPageStepSize,
    );
    const extraPerStep = getCreditsForPlanTier(
      params.planKey,
      FEATURE_CREDIT_COSTS.watermark.pdf.extraPageStepCreditsByPlanTier,
    );

    baseCredits = base + extraPageSteps * extraPerStep;
  } else {
    const durationMinutes = Math.max(1, params.durationMinutes ?? 1);

    if (params.resolutionClass === "720p") {
      const step = FEATURE_CREDIT_COSTS.watermark.video.steps.resolution720p;
      const extraSteps = getExtraStepCount(
        durationMinutes,
        step.includedDurationMinutes,
        step.extraDurationStepMinutes,
      );

      baseCredits =
        getCreditsForPlanTier(params.planKey, step.baseCreditsByPlanTier) +
        extraSteps *
          getCreditsForPlanTier(
            params.planKey,
            step.extraDurationStepCreditsByPlanTier,
          );
    } else if (params.resolutionClass === "1080p") {
      const step = FEATURE_CREDIT_COSTS.watermark.video.steps.resolution1080p;
      const extraSteps = getExtraStepCount(
        durationMinutes,
        step.includedDurationMinutes,
        step.extraDurationStepMinutes,
      );

      baseCredits =
        getCreditsForPlanTier(params.planKey, step.baseCreditsByPlanTier) +
        extraSteps *
          getCreditsForPlanTier(
            params.planKey,
            step.extraDurationStepCreditsByPlanTier,
          );
    } else if (params.resolutionClass === "4k") {
      const step = FEATURE_CREDIT_COSTS.watermark.video.steps.resolution4k;

      if (durationMinutes <= step.shortDurationMinutes) {
        baseCredits = getCreditsForPlanTier(
          params.planKey,
          step.baseCreditsUpTo5MinutesByPlanTier,
        );
      } else {
        const extraSteps = getExtraStepCount(
          durationMinutes,
          step.includedDurationMinutes,
          step.extraDurationStepMinutes,
        );

        baseCredits =
          getCreditsForPlanTier(
            params.planKey,
            step.baseCreditsUpTo10MinutesByPlanTier,
          ) +
          extraSteps *
            getCreditsForPlanTier(
              params.planKey,
              step.extraDurationStepCreditsByPlanTier,
            );
      }
    } else {
      throw new UnknownCreditFeatureError(
        "Video watermarking requires a supported resolution class.",
      );
    }

    if (params.priorityProcessing) {
      baseCredits += getCreditsForPlanTier(
        params.planKey,
        FEATURE_CREDIT_COSTS.watermark.video.priorityProcessingCreditsByPlanTier,
      );
    }
  }

  if (params.isSoftWatermark) {
    baseCredits = Math.ceil(baseCredits * 0.5);
  }

  return applyCurrencyCreditMultiplier(baseCredits, params.currency);
}

/**
 * Calculates large-file and processing related add-on credits.
 */
export function calculateLargeFileCreditCost(
  params:
    | {
        currency: string;
        featureKey: "archive_extension";
        months?: number;
      }
    | {
        currency: string;
        featureKey: "deep_scan_large_upload";
      }
    | {
        currency: string;
        featureKey: "generate_zip_package";
      }
    | {
        currency: string;
        durationMinutes?: number;
        featureKey: "video_preview_transcode";
      }
    | {
        currency: string;
        featureKey: "temporary_large_file_access";
      }
    | {
        currency: string;
        featureKey: "large_upload_overage";
        planKey?: CreditPlanKey;
        sizeBytes: number;
      },
) {
  let baseCredits = 0;

  switch (params.featureKey) {
    case "archive_extension": {
      const months = Math.max(1, params.months ?? 1);
      baseCredits =
        months *
        FEATURE_CREDIT_COSTS.largeFileProcessing.archiveExtension.creditsPerMonth;
      break;
    }
    case "deep_scan_large_upload":
      baseCredits =
        FEATURE_CREDIT_COSTS.largeFileProcessing.deepScanLargeUpload.credits;
      break;
    case "generate_zip_package":
      baseCredits =
        FEATURE_CREDIT_COSTS.largeFileProcessing.generateZipPackage.credits;
      break;
    case "temporary_large_file_access":
      baseCredits =
        FEATURE_CREDIT_COSTS.largeFileProcessing.temporaryLargeFileAccess.credits;
      break;
    case "video_preview_transcode": {
      const durationMinutes = Math.max(1, params.durationMinutes ?? 1);
      const config =
        FEATURE_CREDIT_COSTS.largeFileProcessing.videoPreviewTranscode;
      const extraSteps = getExtraStepCount(
        durationMinutes,
        config.includedDurationMinutes,
        config.extraDurationStepMinutes,
      );

      baseCredits =
        config.baseCredits + extraSteps * config.extraDurationStepCredits;
      break;
    }
    case "large_upload_overage": {
      const planKey = params.planKey ?? DEFAULT_CREDIT_PLAN_KEY;
      assertKnownPlanKey(planKey);
      const planLimits = getPlanFeatureLimits(planKey);
      const extraBytes = Math.max(0, params.sizeBytes - planLimits.maxUploadSizeBytes);
      const gbStepBytes =
        FEATURE_CREDIT_COSTS.largeFileProcessing.largeUploadOverage.gbStep *
        1024 *
        1024 *
        1024;
      const extraSteps =
        extraBytes === 0 ? 0 : Math.ceil(extraBytes / gbStepBytes);

      baseCredits =
        extraSteps *
        FEATURE_CREDIT_COSTS.largeFileProcessing.largeUploadOverage
          .creditsPerExtraGb;
      break;
    }
    default:
      throw new UnknownCreditFeatureError();
  }

  return applyCurrencyCreditMultiplier(baseCredits, params.currency);
}

/**
 * Calculates template unlock and template slot credits.
 */
export function calculateTemplateCreditCost(params: {
  currency: string;
  templateKey: TemplateCreditKey;
}) {
  return applyCurrencyCreditMultiplier(
    calculateTemplateBaseCredits(params.templateKey),
    params.currency,
  );
}

/**
 * Public gateway that routes every feature quote through the centralized
 * calculator so business values stay in one place.
 */
export function calculateFeatureCreditCost(params: CreditFeatureCostParams) {
  if (ZERO_CREDIT_ACTION_KEYS.includes(params.featureKey as never)) {
    return 0;
  }

  switch (params.featureKey) {
    case "storage_add_on":
      return calculateStorageCreditCost({
        currency: params.currency,
        storageAddOnKey: params.storageAddOnKey,
      });
    case "revision_add_on":
      return calculateRevisionCreditCost({
        currency: params.currency,
        extraLargeUploadGb: params.extraLargeUploadGb,
        revisionAddOnKey: params.revisionAddOnKey,
      });
    case "final_draft_mismatch_reupload":
      return calculateFinalDraftMismatchReuploadCreditCost({
        currency: params.currency,
      });
    case "watermark":
      return calculateWatermarkCreditCost({
        currency: params.currency,
        durationMinutes: params.durationMinutes,
        mediaType: params.mediaType,
        pageCount: params.pageCount,
        planKey: params.planKey ?? DEFAULT_CREDIT_PLAN_KEY,
        priorityProcessing: params.priorityProcessing,
        resolutionClass: params.resolutionClass,
      });
    case "large_upload_overage":
    case "temporary_large_file_access":
    case "generate_zip_package":
    case "archive_extension":
    case "video_preview_transcode":
    case "deep_scan_large_upload":
      return calculateLargeFileCreditCost(params);
    case "template_unlock":
      return calculateTemplateCreditCost({
        currency: params.currency,
        templateKey: params.templateKey,
      });
    case "testimonial_customize":
    case "testimonial_download": {
      const template = getTestimonialTemplate(params.templateId);
      return template?.creditCost ?? 0;
    }
    default:
      throw new UnknownCreditFeatureError();
  }
}

/**
 * Throws when an account balance cannot cover the requested credits.
 */
export function assertSufficientCredits(
  availableCredits: number,
  requiredCredits: number,
) {
  assertPositiveInteger(availableCredits, "availableCredits");
  assertPositiveInteger(requiredCredits, "requiredCredits");

  if (availableCredits < requiredCredits) {
    throw new InsufficientCreditsError();
  }
}

/**
 * Formats a user-facing credit amount without exposing internal currency value.
 */
export function formatCreditAmountForDisplay(credits: number) {
  assertPositiveInteger(credits, "credits");
  return `${credits} credits`;
}

/**
 * Builds progress values for the Billing credits usage UI.
 */
export function getCreditUsageProgress(params: {
  availableCredits: number;
  monthlyCredits: number;
  usedCredits: number;
}): CreditUsageProgress {
  assertPositiveInteger(params.availableCredits, "availableCredits");
  assertPositiveInteger(params.monthlyCredits, "monthlyCredits");
  assertPositiveInteger(params.usedCredits, "usedCredits");

  const totalCreditsForPeriod = Math.max(
    params.monthlyCredits,
    params.availableCredits + params.usedCredits,
  );
  const usedPercent =
    totalCreditsForPeriod === 0
      ? 0
      : Math.min(
          100,
          Math.round((params.usedCredits / totalCreditsForPeriod) * 100),
        );
  const remainingPercent = Math.max(0, 100 - usedPercent);
  const progressLabel = `${params.usedCredits}/${totalCreditsForPeriod}`;

  void CREDIT_USAGE_PROGRESS_THRESHOLDS;

  return {
    availableCredits: params.availableCredits,
    monthlyCredits: params.monthlyCredits,
    progressLabel,
    remainingPercent,
    totalCreditsForPeriod,
    usedCredits: params.usedCredits,
    usedPercent,
  };
}

/**
 * Returns translation-ready quote messaging for the requested feature cost.
 */
export function getCreditFeatureQuoteMessage(params: CreditFeatureCostParams): CreditQuoteMessage {
  const requiredCredits = calculateFeatureCreditCost(params);
  const multiplier = getCreditMultiplierForCurrency(params.currency);
  const isInternationalQuote =
    requiredCredits > 0 && multiplier > CREDIT_REGIONAL_MULTIPLIER;

  return {
    requiredCredits,
    translationKey: isInternationalQuote
      ? "creditsQuoteInternationalWillUse"
      : "creditsQuoteWillUse",
    translationParams: {
      count: requiredCredits,
    },
  };
}
