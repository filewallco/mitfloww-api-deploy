const MB = 1024 * 1024;
const GB = 1024 * MB;

export const CREDIT_PLAN_KEYS = [
  "free",
  "standard",
  "pro",
  "studio",
  "business",
] as const;

export type CreditPlanKey = (typeof CREDIT_PLAN_KEYS)[number];

export const DEFAULT_CREDIT_PLAN_KEY: CreditPlanKey = "free";

export const CREDIT_PLAN_KEY_DB_VALUES = [0, 1, 2, 3, 4] as const;
export type CreditPlanKeyDbValue = (typeof CREDIT_PLAN_KEY_DB_VALUES)[number];

export const CreditPlanKeyDb = {
  Free: 0,
  Standard: 1,
  Pro: 2,
  Studio: 3,
  Business: 4,
} as const satisfies Record<string, CreditPlanKeyDbValue>;

export function toCreditPlanKeyDbValue(key: unknown): CreditPlanKeyDbValue {
  if (key === "free" || key === 0 || key === CreditPlanKeyDb.Free) return CreditPlanKeyDb.Free;
  if (key === "standard" || key === 1 || key === CreditPlanKeyDb.Standard) return CreditPlanKeyDb.Standard;
  if (key === "pro" || key === 2 || key === CreditPlanKeyDb.Pro) return CreditPlanKeyDb.Pro;
  if (key === "studio" || key === 3 || key === CreditPlanKeyDb.Studio) return CreditPlanKeyDb.Studio;
  if (key === "business" || key === 4 || key === CreditPlanKeyDb.Business) return CreditPlanKeyDb.Business;
  return CreditPlanKeyDb.Free;
}

export function fromCreditPlanKeyDbValue(value: unknown): CreditPlanKey {
  if (value === "free" || value === "standard" || value === "pro" || value === "studio" || value === "business") {
    return value;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case CreditPlanKeyDb.Free:
      return "free";
    case CreditPlanKeyDb.Standard:
      return "standard";
    case CreditPlanKeyDb.Pro:
      return "pro";
    case CreditPlanKeyDb.Studio:
      return "studio";
    case CreditPlanKeyDb.Business:
      return "business";
    default:
      return "free";
  }
}


/**
 * These plan values define the current subscription limits and included
 * monthly credits. They are user-facing business settings and can be changed
 * later without touching calculator or route code.
 */
const BASE_CREDIT_PLANS = {
  free: {
    activeProjectsLimit: 5,
    displayName: "Free",
    maxUploadSizeBytes: 500 * MB,
    monthlyCredits: 75,
    monthlyPriceInrMinorUnits: 0,
    platformFeeBasisPoints: 800,
    platformFeeMaxInrMinorUnits: 49_900,
    platformFeeMinInrMinorUnits: 4_000,
    revisionsPerProject: 3,
    storageLimitBytes: 2 * GB,
    workspaceAccess: false,
  },
  standard: {
    activeProjectsLimit: 25,
    displayName: "Standard",
    maxUploadSizeBytes: 2 * GB,
    monthlyCredits: 500,
    monthlyPriceInrMinorUnits: 19_900,
    platformFeeBasisPoints: 400,
    platformFeeMaxInrMinorUnits: 29_900,
    platformFeeMinInrMinorUnits: 2_000,
    revisionsPerProject: 8,
    storageLimitBytes: 10 * GB,
    workspaceAccess: false,
  },
  pro: {
    activeProjectsLimit: 100,
    displayName: "Pro",
    maxUploadSizeBytes: 5 * GB,
    monthlyCredits: 1_500,
    monthlyPriceInrMinorUnits: 49_900,
    platformFeeBasisPoints: 300,
    platformFeeMaxInrMinorUnits: 24_900,
    platformFeeMinInrMinorUnits: 2_000,
    revisionsPerProject: 20,
    storageLimitBytes: 50 * GB,
    workspaceAccess: true,

  },
  studio: {
    activeProjectsLimit: null,
    activeProjectsPolicy: "fair_use_unlimited",
    displayName: "Studio",
    maxUploadSizeBytes: 10 * GB,
    monthlyCredits: 4_000,
    monthlyPriceInrMinorUnits: 99_900,
    platformFeeBasisPoints: 250,
    platformFeeMaxInrMinorUnits: 19_900,
    platformFeeMinInrMinorUnits: 1_500,
    revisionsPerProject: 50,
    storageLimitBytes: 150 * GB,
    workspaceAccess: true,
  },
  business: {
    activeProjectsLimit: null,
    activeProjectsPolicy: "fair_use_unlimited",
    displayName: "Business",
    maxUploadSizeBytes: 20 * GB,
    monthlyCredits: 10_000,
    monthlyPriceInrMinorUnits: 199_900,
    platformFeeBasisPoints: 200,
    platformFeeMaxInrMinorUnits: 14_900,
    platformFeeMinInrMinorUnits: 1_000,
    revisionsPerProject: 100,
    storageLimitBytes: 500 * GB,
    workspaceAccess: true,
  },
} as const satisfies Record<
  CreditPlanKey,
  {
    activeProjectsLimit: number | null;
    activeProjectsPolicy?: "fair_use_unlimited";
    displayName: string;
    maxUploadSizeBytes: number;
    monthlyCredits: number;
    monthlyPriceInrMinorUnits: number;
    platformFeeBasisPoints: number;
    platformFeeMaxInrMinorUnits: number;
    platformFeeMinInrMinorUnits: number;
    revisionsPerProject: number;
    storageLimitBytes: number;
    workspaceAccess: boolean,
  }
>;

export type CreditPlanConfig = (typeof BASE_CREDIT_PLANS)[CreditPlanKey];

export const CREDIT_PLANS: Record<CreditPlanKey, CreditPlanConfig> &
  Record<number, CreditPlanConfig> = new Proxy(
  BASE_CREDIT_PLANS as any,
  {
    get(target, prop) {
      if (typeof prop === "string" || typeof prop === "number") {
        if (prop in target) {
          return target[prop];
        }
        const resolvedKey = fromCreditPlanKeyDbValue(prop);
        return target[resolvedKey] ?? target.free;
      }
      return target[prop];
    },
  },
);
