import type { CreditPlanKey } from "./plans";

export const CREDIT_FEATURE_KEYS = [
  "storage_add_on",
  "revision_add_on",
  "final_draft_mismatch_reupload",
  "watermark",
  "large_upload_overage",
  "temporary_large_file_access",
  "generate_zip_package",
  "archive_extension",
  "video_preview_transcode",
  "deep_scan_large_upload",
  "template_unlock",
  "testimonial_customize",
  "testimonial_download",
] as const;

export type CreditFeatureKey = (typeof CREDIT_FEATURE_KEYS)[number];

export const ZERO_CREDIT_ACTION_KEYS = [
  "create_project",
  "upload_within_plan_limit",
  "lock_file_behind_payment",
  "share_client_payment_link",
  "client_payment_page",
  "client_download_after_payment",
  "basic_invoice_generation",
  "basic_email_notification",
  "freelancer_payout_request",
  "basic_client_approval_workflow",
] as const;

export type ZeroCreditActionKey = (typeof ZERO_CREDIT_ACTION_KEYS)[number];

export const STORAGE_ADD_ON_KEYS = [
  "extra1Gb30Days",
  "extra5Gb30Days",
  "extra20Gb30Days",
  "extra100Gb30Days",
] as const;

export type StorageAddOnKey = (typeof STORAGE_ADD_ON_KEYS)[number];

export const REVISION_ADD_ON_KEYS = [
  "extra1Revision",
  "extra5Revisions",
  "extra20Revisions",
] as const;

export type RevisionAddOnKey = (typeof REVISION_ADD_ON_KEYS)[number];

export const TEMPLATE_CREDIT_KEYS = [
  "testimonialPack",
  "emailPack",
  "invoicePack",
  "customTestimonialSlot",
  "customEmailSlot",
  "customInvoiceSlot",
] as const;

export type TemplateCreditKey = (typeof TEMPLATE_CREDIT_KEYS)[number];

export const CREDIT_MEDIA_TYPES = ["image", "pdf", "video"] as const;
export type CreditMediaType = (typeof CREDIT_MEDIA_TYPES)[number];

export const CREDIT_VIDEO_RESOLUTION_CLASSES = [
  "720p",
  "1080p",
  "4k",
] as const;

export type CreditVideoResolutionClass =
  (typeof CREDIT_VIDEO_RESOLUTION_CLASSES)[number];

const PLAN_TIER_BY_PLAN_KEY: Readonly<Record<CreditPlanKey, "freeStandard" | "pro" | "studio">> =
  {
    free: "freeStandard",
    pro: "pro",
    standard: "freeStandard",
    studio: "studio",
    business: "studio",
  };

/**
 * These feature costs are the single source of truth for all credit-consuming
 * add-ons. Routes, services, and UI helpers must import this config or go
 * through the calculator instead of hardcoding numbers elsewhere.
 */
export const FEATURE_CREDIT_COSTS = {
  largeFileProcessing: {
    archiveExtension: {
      creditsPerMonth: 20,
      monthStep: 1,
    },
    deepScanLargeUpload: {
      credits: 5,
    },
    generateZipPackage: {
      credits: 8,
    },
    largeUploadOverage: {
      creditsPerExtraGb: 10,
      gbStep: 1,
    },
    temporaryLargeFileAccess: {
      credits: 25,
      storageGb: 5,
      validityDays: 7,
    },
    videoPreviewTranscode: {
      baseCredits: 30,
      extraDurationStepCredits: 20,
      extraDurationStepMinutes: 10,
      includedDurationMinutes: 10,
    },
  },
  revisions: {
    extra1Revision: {
      credits: 5,
      revisionCount: 1,
    },
    extra20Revisions: {
      credits: 70,
      revisionCount: 20,
    },
    extra5Revisions: {
      credits: 20,
      revisionCount: 5,
    },
    largeUploadOveragePerGb: {
      creditsPerExtraGb: 8,
      gbStep: 1,
    },
    finalDraftMismatchReupload: {
      credits: 5,
    },
  },
  storage: {
    extra100Gb30Days: {
      credits: 450,
      storageGb: 100,
      validityDays: 30,
    },
    extra1Gb30Days: {
      credits: 8,
      storageGb: 1,
      validityDays: 30,
    },
    extra20Gb30Days: {
      credits: 120,
      storageGb: 20,
      validityDays: 30,
    },
    extra5Gb30Days: {
      credits: 35,
      storageGb: 5,
      validityDays: 30,
    },
  },
  templates: {
    customEmailSlot: {
      credits: 50,
      lifetime: true,
    },
    customInvoiceSlot: {
      credits: 50,
      lifetime: true,
    },
    customTestimonialSlot: {
      credits: 30,
      lifetime: true,
    },
    emailPack: {
      credits: 60,
      lifetime: true,
    },
    invoicePack: {
      credits: 60,
      lifetime: true,
    },
    testimonialPack: {
      credits: 40,
      lifetime: true,
    },
  },
  watermark: {
    image: {
      byPlanTier: {
        freeStandard: 2,
        pro: 1,
        studio: 1,
      },
    },
    pdf: {
      baseCreditsByPlanTier: {
        freeStandard: 4,
        pro: 3,
        studio: 2,
      },
      extraPageStepCreditsByPlanTier: {
        freeStandard: 2,
        pro: 1,
        studio: 1,
      },
      extraPageStepSize: 50,
      includedPageCount: 50,
    },
    video: {
      priorityProcessingCreditsByPlanTier: {
        freeStandard: 50,
        pro: 40,
        studio: 30,
      },
      steps: {
        resolution1080p: {
          baseCreditsByPlanTier: {
            freeStandard: 45,
            pro: 36,
            studio: 30,
          },
          extraDurationStepCreditsByPlanTier: {
            freeStandard: 25,
            pro: 20,
            studio: 15,
          },
          extraDurationStepMinutes: 10,
          includedDurationMinutes: 10,
        },
        resolution4k: {
          baseCreditsUpTo10MinutesByPlanTier: {
            freeStandard: 70,
            pro: 60,
            studio: 50,
          },
          baseCreditsUpTo5MinutesByPlanTier: {
            freeStandard: 40,
            pro: 35,
            studio: 30,
          },
          extraDurationStepCreditsByPlanTier: {
            freeStandard: 50,
            pro: 40,
            studio: 30,
          },
          extraDurationStepMinutes: 10,
          includedDurationMinutes: 10,
          shortDurationMinutes: 5,
        },
        resolution720p: {
          baseCreditsByPlanTier: {
            freeStandard: 20,
            pro: 16,
            studio: 12,
          },
          extraDurationStepCreditsByPlanTier: {
            freeStandard: 25,
            pro: 20,
            studio: 15,
          },
          extraDurationStepMinutes: 10,
          includedDurationMinutes: 5,
        },
      },
    },
  },
} as const;

export function getPlanTierForCreditCosts(planKey: CreditPlanKey) {
  return PLAN_TIER_BY_PLAN_KEY[planKey];
}
