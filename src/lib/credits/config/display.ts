/**
 * These display thresholds support the Billing progress UI. They are safe to
 * tweak later without touching any calculation or repository logic.
 */
export const CREDIT_USAGE_PROGRESS_THRESHOLDS = {
  criticalPercent: 90,
  warningPercent: 70,
} as const;
