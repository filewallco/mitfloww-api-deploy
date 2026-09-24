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
  status: unknown,
): ProjectPaymentStatusDbValue {
  if (status === ProjectPaymentStatus.Pending || status === 0 || status === "pending") {
    return ProjectPaymentStatusDb.Pending;
  }
  if (status === ProjectPaymentStatus.Paid || status === 1 || status === "paid") {
    return ProjectPaymentStatusDb.Paid;
  }
  return ProjectPaymentStatusDb.Pending;
}

export function fromProjectPaymentStatusDbValue(
  value: unknown,
): ProjectPaymentStatus {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case ProjectPaymentStatusDb.Pending:
      return ProjectPaymentStatus.Pending;
    case ProjectPaymentStatusDb.Paid:
      return ProjectPaymentStatus.Paid;
    default:
      return ProjectPaymentStatus.Pending;
  }
}

export const PROJECT_STATUS_DB_VALUES = [0, 1] as const;
export type ProjectStatusDbValue = (typeof PROJECT_STATUS_DB_VALUES)[number];
export const ProjectStatusDb = {
  Active: 0,
  Completed: 1,
} as const;

export function toProjectStatusDbValue(
  status: unknown,
): ProjectStatusDbValue {
  if (status === ProjectStatusDb.Active || status === ProjectStatus.Active || status === "active" || status === 0) {
    return ProjectStatusDb.Active;
  }
  if (status === ProjectStatusDb.Completed || status === ProjectStatus.Completed || status === "completed" || status === 1) {
    return ProjectStatusDb.Completed;
  }
  return ProjectStatusDb.Active;
}

export function fromProjectStatusDbValue(value: unknown): ProjectStatus {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case ProjectStatusDb.Active:
      return ProjectStatus.Active;
    case ProjectStatusDb.Completed:
      return ProjectStatus.Completed;
    default:
      return ProjectStatus.Active;
  }
}

export const PROJECT_SHARE_STATUS_DB_VALUES = [0, 1, 2, 3, 4] as const;
export type ProjectShareStatusDbValue = (typeof PROJECT_SHARE_STATUS_DB_VALUES)[number];
export const ProjectShareStatusDb = {
  Active: 0,
  Expired: 1,
  Locked: 2,
  Revoked: 3,
  PasswordRequired: 4,
} as const;

export function toProjectShareStatusDbValue(
  status: unknown,
): ProjectShareStatusDbValue | null {
  if (status == null) return null;
  if (status === ProjectShareStatusDb.Active || status === ProjectShareStatus.Active || status === "active" || status === 0) {
    return ProjectShareStatusDb.Active;
  }
  if (status === ProjectShareStatusDb.Expired || status === ProjectShareStatus.Expired || status === "expired" || status === 1) {
    return ProjectShareStatusDb.Expired;
  }
  if (status === ProjectShareStatusDb.Locked || status === ProjectShareStatus.Locked || status === "locked" || status === 2) {
    return ProjectShareStatusDb.Locked;
  }
  if (status === ProjectShareStatusDb.Revoked || status === ProjectShareStatus.Revoked || status === "revoked" || status === 3) {
    return ProjectShareStatusDb.Revoked;
  }
  if (status === ProjectShareStatusDb.PasswordRequired || status === ProjectShareStatus.PasswordRequired || status === "password_required" || status === 4) {
    return ProjectShareStatusDb.PasswordRequired;
  }
  return null;
}

export function fromProjectShareStatusDbValue(value: unknown): ProjectShareStatus | null {
  if (value == null) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case ProjectShareStatusDb.Active:
      return ProjectShareStatus.Active;
    case ProjectShareStatusDb.Expired:
      return ProjectShareStatus.Expired;
    case ProjectShareStatusDb.Locked:
      return ProjectShareStatus.Locked;
    case ProjectShareStatusDb.Revoked:
      return ProjectShareStatus.Revoked;
    case ProjectShareStatusDb.PasswordRequired:
      return ProjectShareStatus.PasswordRequired;
    default:
      return null;
  }
}

export const PROJECT_PAYMENT_SNAPSHOT_TYPES = [
  "advance",
  "final",
  "full",
  "remaining",
] as const;
export type ProjectPaymentSnapshotType =
  (typeof PROJECT_PAYMENT_SNAPSHOT_TYPES)[number];
export const ProjectPaymentSnapshotType = {
  Advance: PROJECT_PAYMENT_SNAPSHOT_TYPES[0],
  Final: PROJECT_PAYMENT_SNAPSHOT_TYPES[1],
  Full: PROJECT_PAYMENT_SNAPSHOT_TYPES[2],
  Remaining: PROJECT_PAYMENT_SNAPSHOT_TYPES[3],
} as const satisfies Record<string, ProjectPaymentSnapshotType>;

export const PROJECT_PAYMENT_SNAPSHOT_TYPE_DB_VALUES = [0, 1, 2, 3] as const;
export type ProjectPaymentSnapshotTypeDbValue =
  (typeof PROJECT_PAYMENT_SNAPSHOT_TYPE_DB_VALUES)[number];
export const ProjectPaymentSnapshotTypeDb = {
  Advance: 0,
  Final: 1,
  Full: 2,
  Remaining: 3,
} as const;

export function toProjectPaymentSnapshotTypeDbValue(
  type: unknown,
): ProjectPaymentSnapshotTypeDbValue {
  if (type === ProjectPaymentSnapshotType.Advance || type === 0 || type === "advance") {
    return ProjectPaymentSnapshotTypeDb.Advance;
  }
  if (type === ProjectPaymentSnapshotType.Final || type === 1 || type === "final") {
    return ProjectPaymentSnapshotTypeDb.Final;
  }
  if (type === ProjectPaymentSnapshotType.Full || type === 2 || type === "full") {
    return ProjectPaymentSnapshotTypeDb.Full;
  }
  if (type === ProjectPaymentSnapshotType.Remaining || type === 3 || type === "remaining") {
    return ProjectPaymentSnapshotTypeDb.Remaining;
  }
  return ProjectPaymentSnapshotTypeDb.Final;
}

export function fromProjectPaymentSnapshotTypeDbValue(
  value: unknown,
): ProjectPaymentSnapshotType {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case ProjectPaymentSnapshotTypeDb.Advance:
      return ProjectPaymentSnapshotType.Advance;
    case ProjectPaymentSnapshotTypeDb.Final:
      return ProjectPaymentSnapshotType.Final;
    case ProjectPaymentSnapshotTypeDb.Full:
      return ProjectPaymentSnapshotType.Full;
    case ProjectPaymentSnapshotTypeDb.Remaining:
      return ProjectPaymentSnapshotType.Remaining;
    default:
      return ProjectPaymentSnapshotType.Final;
  }
}

export const PROJECT_PAYMENT_SNAPSHOT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "refunded",
] as const;
export type ProjectPaymentSnapshotStatus =
  (typeof PROJECT_PAYMENT_SNAPSHOT_STATUSES)[number];
export const ProjectPaymentSnapshotStatus = {
  Pending: PROJECT_PAYMENT_SNAPSHOT_STATUSES[0],
  Paid: PROJECT_PAYMENT_SNAPSHOT_STATUSES[1],
  Failed: PROJECT_PAYMENT_SNAPSHOT_STATUSES[2],
  Refunded: PROJECT_PAYMENT_SNAPSHOT_STATUSES[3],
} as const satisfies Record<string, ProjectPaymentSnapshotStatus>;

export const PROJECT_PAYMENT_SNAPSHOT_STATUS_DB_VALUES = [0, 1, 2, 3] as const;
export type ProjectPaymentSnapshotStatusDbValue =
  (typeof PROJECT_PAYMENT_SNAPSHOT_STATUS_DB_VALUES)[number];
export const ProjectPaymentSnapshotStatusDb = {
  Pending: 0,
  Paid: 1,
  Failed: 2,
  Refunded: 3,
} as const;

export function toProjectPaymentSnapshotStatusDbValue(
  status: unknown,
): ProjectPaymentSnapshotStatusDbValue {
  if (status === ProjectPaymentSnapshotStatus.Pending || status === 0 || status === "pending") {
    return ProjectPaymentSnapshotStatusDb.Pending;
  }
  if (status === ProjectPaymentSnapshotStatus.Paid || status === 1 || status === "paid") {
    return ProjectPaymentSnapshotStatusDb.Paid;
  }
  if (status === ProjectPaymentSnapshotStatus.Failed || status === 2 || status === "failed") {
    return ProjectPaymentSnapshotStatusDb.Failed;
  }
  if (status === ProjectPaymentSnapshotStatus.Refunded || status === 3 || status === "refunded") {
    return ProjectPaymentSnapshotStatusDb.Refunded;
  }
  return ProjectPaymentSnapshotStatusDb.Pending;
}

export function fromProjectPaymentSnapshotStatusDbValue(
  value: unknown,
): ProjectPaymentSnapshotStatus {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case ProjectPaymentSnapshotStatusDb.Pending:
      return ProjectPaymentSnapshotStatus.Pending;
    case ProjectPaymentSnapshotStatusDb.Paid:
      return ProjectPaymentSnapshotStatus.Paid;
    case ProjectPaymentSnapshotStatusDb.Failed:
      return ProjectPaymentSnapshotStatus.Failed;
    case ProjectPaymentSnapshotStatusDb.Refunded:
      return ProjectPaymentSnapshotStatus.Refunded;
    default:
      return ProjectPaymentSnapshotStatus.Pending;
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
  clientEmail?: string | null;
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
  clientEmail?: string | null;
};

export type ProjectEditLocksDTO = {
  advancePaymentLocked: boolean;
  amountLocked: boolean;
  hasApprovedRevision: boolean;
  hasDeliverables: boolean;
  revisionSettingsLocked: boolean;
  hasActiveProcessing?: boolean;
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
  fileCount?: number;
  totalSizeBytes?: number;
  isPendingPayment?: boolean;
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
