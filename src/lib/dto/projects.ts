import type { TranslatedTextDTO } from "@/lib/dto/translated-text";

export const PROJECT_STATUSES = ["active", "completed"] as const;
export const PROJECT_PAYMENT_STATUSES = ["pending", "paid"] as const;
export const PROJECT_SHARE_STATUSES = [
  "active",
  "expired",
  "locked",
  "revoked",
  "password_required",
] as const;
export const PROJECT_SHARE_MUTATION_ACTIONS = [
  "copy",
  "send",
  "regenerate",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ProjectPaymentStatus =
  (typeof PROJECT_PAYMENT_STATUSES)[number];
export type ProjectShareStatus = (typeof PROJECT_SHARE_STATUSES)[number];
export type ProjectShareMutationAction =
  (typeof PROJECT_SHARE_MUTATION_ACTIONS)[number];

export const ProjectStatus = {
  Active: "active",
  Completed: "completed",
} as const satisfies Record<string, ProjectStatus>;

export const ProjectPaymentStatus = {
  Pending: PROJECT_PAYMENT_STATUSES[0],
  Paid: PROJECT_PAYMENT_STATUSES[1],
} as const satisfies Record<string, ProjectPaymentStatus>;

export const ProjectShareStatus = {
  Active: PROJECT_SHARE_STATUSES[0],
  Expired: PROJECT_SHARE_STATUSES[1],
  Locked: PROJECT_SHARE_STATUSES[2],
  Revoked: PROJECT_SHARE_STATUSES[3],
  PasswordRequired: PROJECT_SHARE_STATUSES[4],
} as const satisfies Record<string, ProjectShareStatus>;

export const ProjectShareMutationAction = {
  Copy: PROJECT_SHARE_MUTATION_ACTIONS[0],
  Send: PROJECT_SHARE_MUTATION_ACTIONS[1],
  Regenerate: PROJECT_SHARE_MUTATION_ACTIONS[2],
} as const satisfies Record<string, ProjectShareMutationAction>;

export const PROJECT_PAYMENT_STATUS_DB_VALUES = [0, 1] as const;
export type ProjectPaymentStatusDbValue =
  (typeof PROJECT_PAYMENT_STATUS_DB_VALUES)[number];
export const ProjectPaymentStatusDb = {
  Pending: PROJECT_PAYMENT_STATUS_DB_VALUES[0],
  Paid: PROJECT_PAYMENT_STATUS_DB_VALUES[1],
} as const;

export function toProjectPaymentStatusDbValue(
  status: ProjectPaymentStatus,
): ProjectPaymentStatusDbValue {
  switch (status) {
    case ProjectPaymentStatus.Pending:
      return ProjectPaymentStatusDb.Pending;
    case ProjectPaymentStatus.Paid:
      return ProjectPaymentStatusDb.Paid;
  }
}

export function fromProjectPaymentStatusDbValue(
  value: unknown,
): ProjectPaymentStatus {
  if (value == null) {
    throw new Error(`Unknown project payment status db value: ${String(value)}`);
  }

  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    throw new Error(`Unknown project payment status db value: ${String(value)}`);
  }

  switch (numeric) {
    case ProjectPaymentStatusDb.Pending:
      return ProjectPaymentStatus.Pending;
    case ProjectPaymentStatusDb.Paid:
      return ProjectPaymentStatus.Paid;
    default:
      throw new Error(`Unknown project payment status db value: ${String(value)}`);
  }
}

export type ProjectShareAccessDTO = {
  emailAdded: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  passwordEnabled: boolean;
  projectId: string;
  shareClientEmail: string | null;
  shareExpiresAt: string;
  sharePassword?: string | null;
  shareStatus: ProjectShareStatus;
  shareToken: string;
  shareUrl: string;
};

export type ProjectShareDraftDTO = {
  projectId: string;
  shareExpiresAt: string;
  shareToken: string;
  shareUrl: string;
};

export type ProjectShareComposerDTO = {
  project: ProjectDTO;
  shareDraft: ProjectShareDraftDTO;
};

export type ProjectShareClientProjectDTO = {
  id: string;
  title: string;
  titleText: TranslatedTextDTO;
  advancePaymentEnabled: boolean;
  advancePaymentStatus: ProjectPaymentStatus;
  paymentStatus: ProjectPaymentStatus;
};

export type ProjectShareClientStateDTO = {
  accessGranted: boolean;
  emailRequired: boolean;
  expiresAt: string;
  lockedUntil: string | null;
  maxAttempts: number;
  passwordRequired: boolean;
  project: ProjectShareClientProjectDTO | null;
  remainingAttempts: number;
  shareStatus: ProjectShareStatus;
};

export type ProjectEditLocksDTO = {
  advancePaymentLocked: boolean;
  amountLocked: boolean;
  hasApprovedRevision: boolean;
  hasDeliverables: boolean;
  revisionSettingsLocked: boolean;
};

export type ProjectDTO = {
  advancePaymentEnabled: boolean;
  advanceAmountCents: number;
  advancePaymentStatus: ProjectPaymentStatus;
  amountCents: number;
  clientEmail: string | null;
  clientName: string;
  clientNameText: TranslatedTextDTO;
  createdAt: string;
  currency: string;
  extraRevisionCostCents: number;
  id: string;
  publicId: string;
  paymentStatus: ProjectPaymentStatus;
  revisionLimit: number;
  shareClientEmail: string | null;
  shareAccess: ProjectShareAccessDTO | null;
  status: ProjectStatus;
  title: string;
  titleText: TranslatedTextDTO;
  updatedAt: string;
  watermarkEnabled: boolean;
  paymentCompletedAt?: string | null;
};

export type ProjectClientReviewDTO = {
  createdAt: string;
  id: string;
  projectId: string;
  rating: number;
  reviewText: string;
  sourceLocale: string;
  submittedAt: string;
  updatedAt: string;
};

export type DeletedProjectDTO = {
  deletedAt: string;
  id: string;
};
