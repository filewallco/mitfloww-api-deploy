/**
 * These duration constants are reused by services and future jobs so expiry
 * rules stay consistent when product policy changes.
 */
export const CREDIT_DURATION_DAYS = {
  month: 30,

  purchasedThreeMonths: 90,
  purchasedSixMonths: 180,
  purchasedYear: 365,

  promotional: 90,
  refund: 365,

  week: 7,
} as const;

export const CREDIT_DURATION_MONTHS = {
  year: 12,
} as const;

export const CREDIT_EXPIRY_POLICIES = {
  monthlyPlanCreditsDays: CREDIT_DURATION_DAYS.month,

  purchasedCredits: {
    threeMonths: CREDIT_DURATION_DAYS.purchasedThreeMonths,
    sixMonths: CREDIT_DURATION_DAYS.purchasedSixMonths,
    year: CREDIT_DURATION_DAYS.purchasedYear,
  },

  promotionalCreditsDays:
    CREDIT_DURATION_DAYS.promotional,

  refundCreditsDays:
    CREDIT_DURATION_DAYS.refund,
} as const;
