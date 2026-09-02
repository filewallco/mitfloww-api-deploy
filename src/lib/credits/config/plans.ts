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

/**
 * These plan values define the current subscription limits and included
 * monthly credits. They are user-facing business settings and can be changed
 * later without touching calculator or route code.
 */
export const CREDIT_PLANS = {
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
