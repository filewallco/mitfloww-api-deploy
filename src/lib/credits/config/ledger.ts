export const CREDIT_LEDGER_TYPES = [
  "grant",
  "purchase",
  "deduction",
  "refund",
  "adjustment",
  "expiry",
  "reservation",
  "reservation_release",
  "reservation_capture",
] as const;

export type CreditLedgerType = (typeof CREDIT_LEDGER_TYPES)[number];

export const CREDIT_LEDGER_SOURCES = [
  "monthly_plan",
  "purchased_pack",
  "promotional",
  "feature_usage",
  "admin_adjustment",
  "refund",
  "system",
] as const;

export type CreditLedgerSource = (typeof CREDIT_LEDGER_SOURCES)[number];

export const CREDIT_RESERVATION_STATUSES = [
  "active",
  "captured",
  "released",
  "expired",
] as const;

export type CreditReservationStatus =
  (typeof CREDIT_RESERVATION_STATUSES)[number];

/**
 * The repo is still running without a real auth/user model, so credits use a
 * temporary single-owner fallback until account ownership exists.
 */
export const DEFAULT_CREDIT_OWNER_ID = "default-owner";
