import type {
  CreditFeatureKey,
  CreditMediaType,
  CreditVideoResolutionClass,
  RevisionAddOnKey,
  StorageAddOnKey,
  TemplateCreditKey,
  ZeroCreditActionKey,
} from "./config/features";
import type {
  CreditLedgerSource,
  CreditLedgerType,
  CreditReservationStatus,
} from "./config/ledger";
import type { CreditPackKey } from "./config/packs";
import type { CreditPlanKey } from "./config/plans";
import type { CreditBillingScope } from "./credit-billing-scope";

export type CreditRegion = "regional" | "international";

export type CreditFeatureCostParams =
  | {
      currency: string;
      featureKey: ZeroCreditActionKey;
      planKey?: CreditPlanKey;
    }
  | {
      currency: string;
      featureKey: "storage_add_on";
      planKey?: CreditPlanKey;
      storageAddOnKey: StorageAddOnKey;
    }
  | {
      currency: string;
      extraLargeUploadGb?: number;
      featureKey: "revision_add_on";
      planKey?: CreditPlanKey;
      revisionAddOnKey?: RevisionAddOnKey;
    }
  | {
      currency: string;
      featureKey: "final_draft_mismatch_reupload";
      planKey?: CreditPlanKey;
    }
  | {
      currency: string;
      durationMinutes?: number;
      featureKey: "watermark";
      mediaType: CreditMediaType;
      pageCount?: number;
      planKey?: CreditPlanKey;
      priorityProcessing?: boolean;
      resolutionClass?: CreditVideoResolutionClass;
      isSoftWatermark?: boolean;
    }
  | {
      currency: string;
      featureKey: "large_upload_overage";
      planKey?: CreditPlanKey;
      sizeBytes: number;
    }
  | {
      currency: string;
      featureKey: "temporary_large_file_access";
      planKey?: CreditPlanKey;
    }
  | {
      currency: string;
      featureKey: "generate_zip_package";
      planKey?: CreditPlanKey;
    }
  | {
      currency: string;
      featureKey: "archive_extension";
      months?: number;
      planKey?: CreditPlanKey;
    }
  | {
      currency: string;
      durationMinutes?: number;
      featureKey: "video_preview_transcode";
      planKey?: CreditPlanKey;
    }
  | {
      currency: string;
      featureKey: "deep_scan_large_upload";
      planKey?: CreditPlanKey;
    }
  | {
      currency: string;
      featureKey: "template_unlock";
      planKey?: CreditPlanKey;
      templateKey: TemplateCreditKey;
    }
  | {
      currency: string;
      featureKey: "testimonial_customize";
      planKey?: CreditPlanKey;
      templateId: string;
    }
  | {
      currency: string;
      featureKey: "testimonial_download";
      planKey?: CreditPlanKey;
      templateId: string;
    };

export type CreditQuoteMessage = {
  requiredCredits: number;
  translationKey: string;
  translationParams: Record<string, number | string>;
};

export type CreditUsageProgress = {
  availableCredits: number;
  monthlyCredits: number;
  progressLabel: string;
  remainingPercent: number;
  totalCreditsForPeriod: number;
  usedCredits: number;
  usedPercent: number;
};

export type CreditLedgerMetadata = Record<
  string,
  boolean | number | string | null
>;

type CreditScopeRef = Pick<
  CreditBillingScope,
  "actorUserId" | "scopeId" | "scopeType"
>;

export type CreditGrantParams = {
  actorUserId: string;
  credits: number;
  descriptionKey?: string | null;
  expiresAt?: Date | null;
  featureKey?: CreditFeatureKey | ZeroCreditActionKey | null;
  fileId?: string | null;
  idempotencyKey?: string | null;
  metadata?: CreditLedgerMetadata | null;
  planKey?: CreditPlanKey;
  projectId?: string | null;
  reason?: string | null;
  scopeId: string;
  scopeType: CreditBillingScope["scopeType"];
  source: CreditLedgerSource;
  type?: Extract<
    CreditLedgerType,
    "adjustment" | "grant" | "purchase" | "refund"
  >;
  versionId?: string | null;
} & CreditScopeRef;

export type CreditDeductionParams = {
  actorUserId: string;
  credits: number;
  descriptionKey?: string | null;
  expiresAt?: Date | null;
  featureKey: CreditFeatureKey | ZeroCreditActionKey;
  fileId?: string | null;
  idempotencyKey: string;
  metadata?: CreditLedgerMetadata | null;
  planKey?: CreditPlanKey;
  projectId?: string | null;
  scopeId: string;
  scopeType: CreditBillingScope["scopeType"];
  source?: CreditLedgerSource;
  versionId?: string | null;
} & CreditScopeRef;

export type CreditReservationParams = {
  actorUserId: string;
  credits: number;
  descriptionKey?: string | null;
  expiresAt: Date;
  featureKey: CreditFeatureKey;
  fileId?: string | null;
  idempotencyKey: string;
  metadata?: CreditLedgerMetadata | null;
  planKey?: CreditPlanKey;
  projectId?: string | null;
  scopeId: string;
  scopeType: CreditBillingScope["scopeType"];
  versionId?: string | null;
} & CreditScopeRef;

export type CreditHistoryPaginationParams = {
  limit: number;
  page: number;
  fromDate: Date;
  toDate: Date;
};

export type CreditPack = {
  credits: number;
  displayName: string;
  key: CreditPackKey;
  priceInrMinorUnits: number;
};

export type CreditReservationSnapshot = {
  accountId: string;
  actorUserId: string;
  createdAt: Date;
  credits: number;
  expiresAt: Date;
  featureKey: CreditFeatureKey;
  fileId: string | null;
  id: string;
  idempotencyKey: string;
  metadata: CreditLedgerMetadata | null;
  projectId: string | null;
  scopeId: string;
  scopeType: CreditBillingScope["scopeType"];
  status: CreditReservationStatus;
  updatedAt: Date;
  versionId: string | null;
};
