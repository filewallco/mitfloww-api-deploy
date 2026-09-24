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

export const CreditLedgerType = {
  Grant: CREDIT_LEDGER_TYPES[0],
  Purchase: CREDIT_LEDGER_TYPES[1],
  Deduction: CREDIT_LEDGER_TYPES[2],
  Refund: CREDIT_LEDGER_TYPES[3],
  Adjustment: CREDIT_LEDGER_TYPES[4],
  Expiry: CREDIT_LEDGER_TYPES[5],
  Reservation: CREDIT_LEDGER_TYPES[6],
  ReservationRelease: CREDIT_LEDGER_TYPES[7],
  ReservationCapture: CREDIT_LEDGER_TYPES[8],
} as const satisfies Record<string, CreditLedgerType>;

export const CREDIT_LEDGER_TYPE_DB_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
export type CreditLedgerTypeDbValue = (typeof CREDIT_LEDGER_TYPE_DB_VALUES)[number];
export const CreditLedgerTypeDb = {
  Grant: 0,
  Purchase: 1,
  Deduction: 2,
  Refund: 3,
  Adjustment: 4,
  Expiry: 5,
  Reservation: 6,
  ReservationRelease: 7,
  ReservationCapture: 8,
} as const;

export function toCreditLedgerTypeDbValue(type: unknown): CreditLedgerTypeDbValue {
  if (type === CreditLedgerType.Grant || type === 0 || type === "grant") return CreditLedgerTypeDb.Grant;
  if (type === CreditLedgerType.Purchase || type === 1 || type === "purchase") return CreditLedgerTypeDb.Purchase;
  if (type === CreditLedgerType.Deduction || type === 2 || type === "deduction") return CreditLedgerTypeDb.Deduction;
  if (type === CreditLedgerType.Refund || type === 3 || type === "refund") return CreditLedgerTypeDb.Refund;
  if (type === CreditLedgerType.Adjustment || type === 4 || type === "adjustment") return CreditLedgerTypeDb.Adjustment;
  if (type === CreditLedgerType.Expiry || type === 5 || type === "expiry") return CreditLedgerTypeDb.Expiry;
  if (type === CreditLedgerType.Reservation || type === 6 || type === "reservation") return CreditLedgerTypeDb.Reservation;
  if (type === CreditLedgerType.ReservationRelease || type === 7 || type === "reservation_release") return CreditLedgerTypeDb.ReservationRelease;
  if (type === CreditLedgerType.ReservationCapture || type === 8 || type === "reservation_capture") return CreditLedgerTypeDb.ReservationCapture;
  return CreditLedgerTypeDb.Grant;
}

export function fromCreditLedgerTypeDbValue(value: unknown): CreditLedgerType {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case CreditLedgerTypeDb.Grant:
      return CreditLedgerType.Grant;
    case CreditLedgerTypeDb.Purchase:
      return CreditLedgerType.Purchase;
    case CreditLedgerTypeDb.Deduction:
      return CreditLedgerType.Deduction;
    case CreditLedgerTypeDb.Refund:
      return CreditLedgerType.Refund;
    case CreditLedgerTypeDb.Adjustment:
      return CreditLedgerType.Adjustment;
    case CreditLedgerTypeDb.Expiry:
      return CreditLedgerType.Expiry;
    case CreditLedgerTypeDb.Reservation:
      return CreditLedgerType.Reservation;
    case CreditLedgerTypeDb.ReservationRelease:
      return CreditLedgerType.ReservationRelease;
    case CreditLedgerTypeDb.ReservationCapture:
      return CreditLedgerType.ReservationCapture;
    default:
      return CreditLedgerType.Grant;
  }
}

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

export const CreditLedgerSource = {
  MonthlyPlan: CREDIT_LEDGER_SOURCES[0],
  PurchasedPack: CREDIT_LEDGER_SOURCES[1],
  Promotional: CREDIT_LEDGER_SOURCES[2],
  FeatureUsage: CREDIT_LEDGER_SOURCES[3],
  AdminAdjustment: CREDIT_LEDGER_SOURCES[4],
  Refund: CREDIT_LEDGER_SOURCES[5],
  System: CREDIT_LEDGER_SOURCES[6],
} as const satisfies Record<string, CreditLedgerSource>;

export const CREDIT_LEDGER_SOURCE_DB_VALUES = [0, 1, 2, 3, 4, 5, 6] as const;
export type CreditLedgerSourceDbValue = (typeof CREDIT_LEDGER_SOURCE_DB_VALUES)[number];
export const CreditLedgerSourceDb = {
  MonthlyPlan: 0,
  PurchasedPack: 1,
  Promotional: 2,
  FeatureUsage: 3,
  AdminAdjustment: 4,
  Refund: 5,
  System: 6,
} as const;

export function toCreditLedgerSourceDbValue(source: unknown): CreditLedgerSourceDbValue {
  if (source === CreditLedgerSource.MonthlyPlan || source === 0 || source === "monthly_plan") return CreditLedgerSourceDb.MonthlyPlan;
  if (source === CreditLedgerSource.PurchasedPack || source === 1 || source === "purchased_pack") return CreditLedgerSourceDb.PurchasedPack;
  if (source === CreditLedgerSource.Promotional || source === 2 || source === "promotional") return CreditLedgerSourceDb.Promotional;
  if (source === CreditLedgerSource.FeatureUsage || source === 3 || source === "feature_usage") return CreditLedgerSourceDb.FeatureUsage;
  if (source === CreditLedgerSource.AdminAdjustment || source === 4 || source === "admin_adjustment") return CreditLedgerSourceDb.AdminAdjustment;
  if (source === CreditLedgerSource.Refund || source === 5 || source === "refund") return CreditLedgerSourceDb.Refund;
  if (source === CreditLedgerSource.System || source === 6 || source === "system") return CreditLedgerSourceDb.System;
  return CreditLedgerSourceDb.MonthlyPlan;
}

export function fromCreditLedgerSourceDbValue(value: unknown): CreditLedgerSource {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case CreditLedgerSourceDb.MonthlyPlan:
      return CreditLedgerSource.MonthlyPlan;
    case CreditLedgerSourceDb.PurchasedPack:
      return CreditLedgerSource.PurchasedPack;
    case CreditLedgerSourceDb.Promotional:
      return CreditLedgerSource.Promotional;
    case CreditLedgerSourceDb.FeatureUsage:
      return CreditLedgerSource.FeatureUsage;
    case CreditLedgerSourceDb.AdminAdjustment:
      return CreditLedgerSource.AdminAdjustment;
    case CreditLedgerSourceDb.Refund:
      return CreditLedgerSource.Refund;
    case CreditLedgerSourceDb.System:
      return CreditLedgerSource.System;
    default:
      return CreditLedgerSource.MonthlyPlan;
  }
}

export const CREDIT_RESERVATION_STATUSES = [
  "active",
  "captured",
  "released",
  "expired",
] as const;

export type CreditReservationStatus =
  (typeof CREDIT_RESERVATION_STATUSES)[number];

export const CreditReservationStatus = {
  Active: CREDIT_RESERVATION_STATUSES[0],
  Captured: CREDIT_RESERVATION_STATUSES[1],
  Released: CREDIT_RESERVATION_STATUSES[2],
  Expired: CREDIT_RESERVATION_STATUSES[3],
} as const satisfies Record<string, CreditReservationStatus>;

export const CREDIT_RESERVATION_STATUS_DB_VALUES = [0, 1, 2, 3] as const;
export type CreditReservationStatusDbValue = (typeof CREDIT_RESERVATION_STATUS_DB_VALUES)[number];
export const CreditReservationStatusDb = {
  Active: 0,
  Captured: 1,
  Released: 2,
  Expired: 3,
} as const;

export function toCreditReservationStatusDbValue(status: unknown): CreditReservationStatusDbValue {
  if (status === CreditReservationStatus.Active || status === 0 || status === "active") return CreditReservationStatusDb.Active;
  if (status === CreditReservationStatus.Captured || status === 1 || status === "captured") return CreditReservationStatusDb.Captured;
  if (status === CreditReservationStatus.Released || status === 2 || status === "released") return CreditReservationStatusDb.Released;
  if (status === CreditReservationStatus.Expired || status === 3 || status === "expired") return CreditReservationStatusDb.Expired;
  return CreditReservationStatusDb.Active;
}

export function fromCreditReservationStatusDbValue(value: unknown): CreditReservationStatus {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case CreditReservationStatusDb.Active:
      return CreditReservationStatus.Active;
    case CreditReservationStatusDb.Captured:
      return CreditReservationStatus.Captured;
    case CreditReservationStatusDb.Released:
      return CreditReservationStatus.Released;
    case CreditReservationStatusDb.Expired:
      return CreditReservationStatus.Expired;
    default:
      return CreditReservationStatus.Active;
  }
}

export const CREDIT_SCOPE_TYPES = ["personal", "workspace"] as const;
export type CreditScopeType = (typeof CREDIT_SCOPE_TYPES)[number];

export const CreditScopeType = {
  Personal: CREDIT_SCOPE_TYPES[0],
  Workspace: CREDIT_SCOPE_TYPES[1],
} as const satisfies Record<string, CreditScopeType>;

export const CREDIT_SCOPE_TYPE_DB_VALUES = [0, 1] as const;
export type CreditScopeTypeDbValue = (typeof CREDIT_SCOPE_TYPE_DB_VALUES)[number];
export const CreditScopeTypeDb = {
  Personal: 0,
  Workspace: 1,
} as const;

export function toCreditScopeTypeDbValue(scope: unknown): CreditScopeTypeDbValue {
  if (scope === CreditScopeType.Personal || scope === 0 || scope === "personal") return CreditScopeTypeDb.Personal;
  if (scope === CreditScopeType.Workspace || scope === 1 || scope === "workspace") return CreditScopeTypeDb.Workspace;
  return CreditScopeTypeDb.Personal;
}

export function fromCreditScopeTypeDbValue(value: unknown): CreditScopeType {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case CreditScopeTypeDb.Personal:
      return CreditScopeType.Personal;
    case CreditScopeTypeDb.Workspace:
      return CreditScopeType.Workspace;
    default:
      return CreditScopeType.Personal;
  }
}

/**
 * The repo is still running without a real auth/user model, so credits use a
 * temporary single-owner fallback until account ownership exists.
 */
export const DEFAULT_CREDIT_OWNER_ID = "default-owner";
