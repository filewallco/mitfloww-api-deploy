import type {
  CreditFeatureKey,
  CreditLedgerSource,
  CreditLedgerType,
  CreditPlanKey,
  CreditReservationStatus,
  ZeroCreditActionKey,
} from "@/lib/credits";
import type { CreditBillingScope } from "@/lib/credits/credit-billing-scope";

export type CreditUsageSummaryDTO = {
  availableCredits: number;
  monthlyCredits: number;
  planDisplayName: string;
  planKey: CreditPlanKey;
  purchasedCreditsAvailable: number;
  scopeId: string;
  scopeType: CreditBillingScope["scopeType"];
  progressLabel: string;
  totalUsableCredits: number;
  grantedCreditsThisPeriod: number;
  periodEnd: string | null;
  periodStart: string | null;
  remainingPercent: number;
  totalCreditsForPeriod: number;
  usedCredits: number;
  usedCreditsThisPeriod: number;
  usedPercent: number;
};

export type CreditBalanceDTO = CreditUsageSummaryDTO;

export type CreditHistoryEntryDTO = {
  actionLabelKey: string;
  actorUserId: string | null;
  balanceAfter: number;
  balanceBefore: number | null;
  createdAt: string;
  credits: number;
  descriptionKey: string | null;
  featureKey: CreditFeatureKey | ZeroCreditActionKey | null;
  id: string;
  scopeId: string;
  scopeType: CreditBillingScope["scopeType"];
  source: CreditLedgerSource;
  sourceLabelKey: string;
  type: CreditLedgerType;
};

export type CreditHistoryResultDTO = {
  entries: CreditHistoryEntryDTO[];
};

export type CreditQuoteDTO = {
  availableCredits: number;
  hasEnoughCredits: boolean;
  internationalMultiplierApplied: boolean;
  multiplier: number;
  planKey: CreditPlanKey;
  requiredCredits: number;
  scopeId: string;
  scopeType: CreditBillingScope["scopeType"];
  translationKey: string;
  translationParams: Record<string, number | string>;
};

export type CreditReservationDTO = {
  credits: number;
  expiresAt: string;
  featureKey: CreditFeatureKey;
  id: string;
  status: CreditReservationStatus;
};
