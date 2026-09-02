import {
  calculateFeatureCreditCost,
  CREDIT_EXPIRY_POLICIES,
  CREDIT_PLANS,
  getCreditFeatureQuoteMessage,
  getCreditMultiplierForCurrency,
  getCreditRegionForCurrency,
  getCreditUsageProgress,
  getPlanMonthlyCredits,
  InsufficientCreditsError,
  type CreditDeductionParams,
  type CreditFeatureCostParams,
  type CreditGrantParams,
  type CreditHistoryPaginationParams,
  type CreditLedgerSource,
  type CreditLedgerType,
  type CreditReservationParams,
  type CreditPlanKey,
  type CreditQuoteMessage,
} from "@/lib/credits";
import {
  resolveCreditBillingScope,
  type CreditBillingScope,
} from "@/lib/credits/credit-billing-scope";
import type {
  CreditBalanceDTO,
  CreditHistoryEntryDTO,
  CreditQuoteDTO,
  CreditUsageSummaryDTO,
} from "@/lib/dto/credits";
import type { CreditAccountRecord } from "@/lib/db/schema";
import {
  buildPaginationMeta,
  buildPaginationParams,
  type PaginatedResult,
} from "@/lib/query/pagination";
import {
  DrizzleCreditRepository,
  type CreditMutationResult,
  type CreditReservationMutationResult,
  type CreditRepository,
} from "@/lib/repositories/credit-repository";
import { resolveActiveActor } from "../auth/active-actor";


function addDays(baseDate: Date, days: number) {
  return new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
}

function resolvePlanDisplayName(planKey: CreditPlanKey) {
  return CREDIT_PLANS[planKey].displayName;
}

function buildInitialGrantIdempotencyKey(
  scope: Pick<CreditBillingScope, "scopeId" | "scopeType">,
  planKey: CreditPlanKey,
) {
  return `monthly_plan_initial:${scope.scopeType}:${scope.scopeId}:${planKey}`;
}

function getSourceLabelKey(source: CreditLedgerSource) {
  switch (source) {
    case "monthly_plan":
      return "creditsHistorySourceMonthlyPlan";
    case "purchased_pack":
      return "creditsHistorySourcePurchasedPack";
    case "promotional":
      return "creditsHistorySourcePromotional";
    case "feature_usage":
      return "creditsHistorySourceFeatureUsage";
    case "admin_adjustment":
      return "creditsHistorySourceAdminAdjustment";
    case "refund":
      return "creditsHistorySourceRefund";
    case "system":
    default:
      return "creditsHistorySourceSystem";
  }
}

function getDefaultGrantDescriptionKey(source: CreditLedgerSource) {
  switch (source) {
    case "monthly_plan":
      return "creditsHistoryActionMonthlyPlan";
    case "purchased_pack":
      return "creditsHistoryActionPurchasedPack";
    case "promotional":
      return "creditsHistoryActionPromotionalGrant";
    case "admin_adjustment":
      return "creditsHistoryActionAdminAdjustment";
    case "refund":
      return "creditsHistoryActionRefund";
    case "system":
    default:
      return "creditsHistoryActionSystemGrant";
  }
}

function getFeatureActionLabelKey(featureKey: CreditFeatureCostParams["featureKey"]) {
  switch (featureKey) {
    case "storage_add_on":
      return "creditsHistoryActionStorage";
    case "revision_add_on":
      return "creditsHistoryActionRevision";
    case "final_draft_mismatch_reupload":
      return "creditsHistoryActionFinalDraftMismatchReupload";
    case "watermark":
      return "creditsHistoryActionWatermark";
    case "large_upload_overage":
      return "creditsHistoryActionLargeUpload";
    case "temporary_large_file_access":
      return "creditsHistoryActionTemporaryLargeFileAccess";
    case "generate_zip_package":
      return "creditsHistoryActionZipPackage";
    case "archive_extension":
      return "creditsHistoryActionArchiveExtension";
    case "video_preview_transcode":
      return "creditsHistoryActionVideoPreview";
    case "deep_scan_large_upload":
      return "creditsHistoryActionDeepScan";
    case "template_unlock":
      return "creditsHistoryActionTemplate";
    case "testimonial_customize":
      return "creditsHistoryActionTestimonialCustomize";
    case "testimonial_download":
      return "creditsHistoryActionTestimonialDownload";
    default:
      return "creditsHistoryActionFeatureUsage";
  }
}

// TODO(credits): Wire future callers into the central service once these
// product flows exist in the repo:
// - `template_unlock`: template-management actions before access is granted
// - `generate_zip_package`: archive/package download flow before bundle creation
// - `archive_extension`: archive-retention controls before extending storage
// The pricing rules already live in the calculator so those routes should call
// `calculateAndDeductFeatureCredits` instead of duplicating business logic.

function buildUsageSummary(
  account: CreditAccountRecord,
  scope: CreditBillingScope,
  currentMonthUsage:number,
  purchasedCreditsAvailable:number,
): CreditUsageSummaryDTO {
  const planKey = account.planKey;
  const progress = getCreditUsageProgress({
    availableCredits: account.availableCredits,
    monthlyCredits:
      account.currentMonthlyCredits > 0
        ? account.currentMonthlyCredits
        : getPlanMonthlyCredits(planKey),
    usedCredits: currentMonthUsage,
  });

  return {
    ...progress,
    grantedCreditsThisPeriod:
      account.currentMonthlyCredits > 0
        ? account.currentMonthlyCredits
        : getPlanMonthlyCredits(planKey),
    periodEnd: null,
    periodStart: null,
    planDisplayName: resolvePlanDisplayName(planKey),
    planKey,
    purchasedCreditsAvailable,
    scopeId: scope.scopeId,
    scopeType: scope.scopeType,
    totalUsableCredits: account.availableCredits,
    usedCreditsThisPeriod: account.currentUsedCredits,
  };
}

function toHistoryEntryDTO(entry: {
  actorUserId: string | null;
  balanceAfter: number;
  balanceBefore: number | null;
  createdAt: Date;
  credits: number;
  descriptionKey: string | null;
  featureKey: string | null;
  id: string;
  scopeId: string;
  scopeType: CreditBillingScope["scopeType"] | string;
  source: CreditLedgerSource;
  type: CreditLedgerType;
}): CreditHistoryEntryDTO {
  return {
    actionLabelKey: entry.descriptionKey ?? "creditsHistoryActionFeatureUsage",
    actorUserId: entry.actorUserId,
    balanceAfter: entry.balanceAfter,
    balanceBefore: entry.balanceBefore,
    createdAt: entry.createdAt.toISOString(),
    credits: entry.credits,
    descriptionKey: entry.descriptionKey,
    featureKey: entry.featureKey as CreditHistoryEntryDTO["featureKey"],
    id: entry.id,
    scopeId: entry.scopeId,
    scopeType: entry.scopeType as CreditBillingScope["scopeType"],
    source: entry.source,
    sourceLabelKey: getSourceLabelKey(entry.source),
    type: entry.type,
  };
}

type ScopedGrantRequest = Omit<
  CreditGrantParams,
  "actorUserId" | "descriptionKey" | "planKey" | "scopeId" | "scopeType"
> & {
  descriptionKey?: string | null;
  planKey?: CreditPlanKey;
  scope?: CreditBillingScope;

  expiresAt?: Date | null;
};

type ScopedDeductionRequest = Omit<
  CreditDeductionParams,
  "actorUserId" | "descriptionKey" | "planKey" | "scopeId" | "scopeType"
> & {
  descriptionKey?: string | null;
  planKey?: CreditPlanKey;
  scope?: CreditBillingScope;
};

type ScopedReservationRequest = Omit<
  CreditReservationParams,
  "actorUserId" | "descriptionKey" | "planKey" | "scopeId" | "scopeType"
> & {
  descriptionKey?: string | null;
  planKey?: CreditPlanKey;
  scope?: CreditBillingScope;
};

function toQuoteDTO(input: {
  availableCredits: number;
  planKey: CreditPlanKey;
  projectCurrency: string;
  quoteMessage: CreditQuoteMessage;
  scope: CreditBillingScope;
}): CreditQuoteDTO {
  const multiplier = getCreditMultiplierForCurrency(input.projectCurrency);
  const requiredCredits = input.quoteMessage.requiredCredits;

  return {
    availableCredits: input.availableCredits,
    hasEnoughCredits: input.availableCredits >= requiredCredits,
    internationalMultiplierApplied:
      requiredCredits > 0 &&
      getCreditRegionForCurrency(input.projectCurrency) === "international",
    multiplier,
    planKey: input.planKey,
    requiredCredits,
    scopeId: input.scope.scopeId,
    scopeType: input.scope.scopeType,
    translationKey: input.quoteMessage.translationKey,
    translationParams: input.quoteMessage.translationParams,
  };
}

export class CreditService {
  constructor(private readonly repository: CreditRepository) {}

  /**
   * Returns the current credit account for a billing scope.
   *
   * The current repo still resolves to one personal billing scope, but the
   * service already keys the account by scope so future Studio workspaces can
   * swap in a workspace scope without changing callers.
   */
  async getOrCreateCreditAccountForScope(scope?: CreditBillingScope) {
    const resolvedScope = scope ?? (await resolveCreditBillingScope());
    const now = new Date();
    const planKey = (await resolveActiveActor()).plan;

    const existing = await this.repository.getAccountByScope(resolvedScope);

    if (existing) {
      if (existing.planKey !== planKey) {
        const newMonthlyCredits = getPlanMonthlyCredits(planKey);
        const newAvailableCredits = Math.max(0, newMonthlyCredits - existing.currentUsedCredits);

        const synced = await this.repository.syncAccountLimits({
          accountId: existing.id,
          planKey,
          monthlyCredits: newMonthlyCredits,
          newAvailableCredits,
        });

        return {
          account: synced,
          created: false,
          scope: resolvedScope,
        };
      }

      return {
        account: existing,
        created: false,
        scope: resolvedScope,
      };
    }

    const result = await this.repository.getOrCreateAccount({
      // TODO(credits): Replace this temporary free-plan bootstrap once
      // real auth and subscription billing provide the user's actual plan.
      initialGrantDescriptionKey: "creditsHistoryActionMonthlyPlan",
      initialGrantExpiresAt: addDays(
        now,
        CREDIT_EXPIRY_POLICIES.monthlyPlanCreditsDays,
      ),
      initialGrantIdempotencyKey: buildInitialGrantIdempotencyKey(
        resolvedScope,
        planKey,
      ),
      initialMonthlyCredits:  getPlanMonthlyCredits(planKey),
      planKey: planKey,
      scopeId: resolvedScope.scopeId,
      scopeType: resolvedScope.scopeType
    });

    return {
      ...result,
      scope: resolvedScope,
    };
  }

  /**
   * Returns the Billing balance card payload for the current account.
   */
  async getCreditBalance(scope?: CreditBillingScope): Promise<CreditBalanceDTO> {
    const { account, scope: resolvedScope } =
      await this.getOrCreateCreditAccountForScope(scope);
    const now=new Date();
    const usage = await this.repository.getMonthlyUsage(
      resolvedScope,
      new Date(now.getFullYear(), now.getMonth(), 1),
      new Date(now.getFullYear(), now.getMonth()+1, 1)
    );
    const purchasedCreditsAvailable = await this.repository.getPurchasedCreditsAvailable(resolvedScope, now);

    return buildUsageSummary(account, resolvedScope, usage, purchasedCreditsAvailable);
  }

  /**
   * Returns the current usage summary, which currently matches the balance DTO.
   */
  async getCreditUsageSummary(
    scope?: CreditBillingScope,
  ): Promise<CreditUsageSummaryDTO> {
    return this.getCreditBalance(scope);
  }

  /**
   * Returns paginated ledger history for the current account.
   */
  async getCreditHistory(
    scope: CreditBillingScope | undefined,
    paginationParams: CreditHistoryPaginationParams,
  ): Promise<PaginatedResult<CreditHistoryEntryDTO>> {
    const { scope: resolvedScope } =
      await this.getOrCreateCreditAccountForScope(scope);
    const pagination = buildPaginationParams(paginationParams);
    const now = new Date();
    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    );
    const monthEnd = new Date(
      now.getFullYear(),
      now.getMonth()+1,
      1,
    );
    const result =
    await this.repository.listLedgerEntries(
      resolvedScope,
      {
        ...pagination,
        fromDate: monthStart,
        toDate: monthEnd,
      },
    );

    return {
      items: result.entries.map((entry) => toHistoryEntryDTO(entry)),
      pagination: buildPaginationMeta({
        limit: pagination.limit,
        page: pagination.page,
        total: result.total,
      }),
    };
  }

  /**
   * Grants credits to the current account without payment-table coupling.
   */
  async grantCredits(
    params: ScopedGrantRequest,
  ): Promise<CreditMutationResult> {
    const { account, scope } = await this.getOrCreateCreditAccountForScope(
      params.scope,
    );

    return this.repository.grantCreditsAtomic({
      ...params,

      expiresAt:
        params.expiresAt ??
      (
        params.source === "monthly_plan"
          ? addDays(
              new Date(),
              CREDIT_EXPIRY_POLICIES.monthlyPlanCreditsDays,
            )
          : null
      ),
      actorUserId: scope.actorUserId,
      descriptionKey:
        params.descriptionKey ?? getDefaultGrantDescriptionKey(params.source),
      planKey: params.planKey ?? account.planKey,
      scopeId: scope.scopeId,
      scopeType: scope.scopeType,
    });
  }

  /**
   * Deducts credits atomically with idempotency and non-negative balance checks.
   */
  async deductCredits(
    params: ScopedDeductionRequest,
  ): Promise<CreditMutationResult> {
    const { account, scope } = await this.getOrCreateCreditAccountForScope(
      params.scope,
    );

    return this.repository.deductCreditsAtomic({
      ...params,
      actorUserId: scope.actorUserId,
      descriptionKey:
        params.descriptionKey ?? getFeatureActionLabelKey(params.featureKey),
      planKey: params.planKey ?? account.planKey,
      scopeId: scope.scopeId,
      scopeType: scope.scopeType,
    });
  }

  /**
   * Reserves credits for long-running jobs before capture or release.
   */
  async reserveCredits(
    params: ScopedReservationRequest,
  ): Promise<CreditReservationMutationResult> {
    const { account, scope } = await this.getOrCreateCreditAccountForScope(
      params.scope,
    );

    return this.repository.createReservationAtomic({
      ...params,
      actorUserId: scope.actorUserId,
      descriptionKey:
        params.descriptionKey ?? getFeatureActionLabelKey(params.featureKey),
      planKey: params.planKey ?? account.planKey,
      scopeId: scope.scopeId,
      scopeType: scope.scopeType,
    });
  }

  /**
   * Captures a prior reservation and converts it into used credits.
   */
  async captureReservedCredits(params: {
    descriptionKey?: string | null;
    reservationId: string;
    scope?: CreditBillingScope;
  }) {
    const { scope } = await this.getOrCreateCreditAccountForScope(params.scope);

    return this.repository.captureReservationAtomic({
      actorUserId: scope.actorUserId,
      descriptionKey:
        params.descriptionKey ?? "creditsHistoryActionReservationCapture",
      reservationId: params.reservationId,
      scopeId: scope.scopeId,
      scopeType: scope.scopeType,
    });
  }

  /**
   * Releases a prior reservation and returns those credits to availability.
   */
  async releaseReservedCredits(params: {
    descriptionKey?: string | null;
    reservationId: string;
    scope?: CreditBillingScope;
  }) {
    const { scope } = await this.getOrCreateCreditAccountForScope(params.scope);

    return this.repository.releaseReservationAtomic({
      actorUserId: scope.actorUserId,
      descriptionKey:
        params.descriptionKey ?? "creditsHistoryActionReservationRelease",
      reservationId: params.reservationId,
      scopeId: scope.scopeId,
      scopeType: scope.scopeType,
    });
  }

  /**
   * Calculates a feature cost and deducts it immediately when required.
   */
  async calculateAndDeductFeatureCredits(params: {
    featureParams: CreditFeatureCostParams;
    fileId?: string | null;
    idempotencyKey: string;
    metadata?: CreditDeductionParams["metadata"];
    projectId?: string | null;
    scope?: CreditBillingScope;
    versionId?: string | null;
  }) {
    const quote = await this.quoteFeatureCreditUsage({
      featureParams: params.featureParams,
      scope: params.scope,
    });

    if (quote.requiredCredits === 0) {
      return {
        deduction: null,
        quote,
      };
    }

    if (!quote.hasEnoughCredits) {
      throw new InsufficientCreditsError({
        available: quote.availableCredits,
        required: quote.requiredCredits,
      });
    }

    const deduction = await this.deductCredits({
      credits: quote.requiredCredits,
      featureKey: params.featureParams.featureKey,
      fileId: params.fileId,
      idempotencyKey: params.idempotencyKey,
      metadata: params.metadata,
      projectId: params.projectId,
      scope: params.scope,
      versionId: params.versionId,
    });

    return {
      deduction,
      quote,
    };
  }

  /**
   * Calculates a feature cost and reserves it for later capture or release.
   */
  async calculateAndReserveFeatureCredits(params: {
    featureParams: CreditFeatureCostParams;
    fileId?: string | null;
    idempotencyKey: string;
    metadata?: CreditReservationParams["metadata"];
    projectId?: string | null;
    reservationExpiresAt?: Date;
    scope?: CreditBillingScope;
    versionId?: string | null;
  }) {
    const quote = await this.quoteFeatureCreditUsage({
      featureParams: params.featureParams,
      scope: params.scope,
    });

    if (quote.requiredCredits === 0) {
      return {
        quote,
        reservation: null,
      };
    }

    if (!quote.hasEnoughCredits) {
      throw new InsufficientCreditsError({
        available: quote.availableCredits,
        required: quote.requiredCredits,
      });
    }

    const reservation = await this.reserveCredits({
      credits: quote.requiredCredits,
      descriptionKey: getFeatureActionLabelKey(params.featureParams.featureKey),
      expiresAt:
        params.reservationExpiresAt ??
        addDays(new Date(), CREDIT_EXPIRY_POLICIES.monthlyPlanCreditsDays),
      featureKey: params.featureParams.featureKey as CreditReservationParams["featureKey"],
      fileId: params.fileId,
      idempotencyKey: params.idempotencyKey,
      metadata: params.metadata,
      projectId: params.projectId,
      scope: params.scope,
      versionId: params.versionId,
    });

    return {
      quote,
      reservation,
    };
  }

  /**
   * Refunds credits through the same ledger pipeline used for grants.
   */
  async refundCredits(params: {
    credits: number;
    fileId?: string | null;
    idempotencyKey: string;
    metadata?: CreditGrantParams["metadata"];
    projectId?: string | null;
    scope?: CreditBillingScope;
    versionId?: string | null;
  }) {
    return this.grantCredits({
      credits: params.credits,
      descriptionKey: "creditsHistoryActionRefund",
      fileId: params.fileId,
      idempotencyKey: params.idempotencyKey,
      metadata: params.metadata,
      projectId: params.projectId,
      scope: params.scope,
      source: "refund",
      type: "refund",
      versionId: params.versionId,
    });
  }

  /**
   * Returns a structured quote payload for any centralized credit feature.
   */
  async quoteFeatureCreditUsage(params: {
    featureParams: CreditFeatureCostParams;
    scope?: CreditBillingScope;
  }): Promise<CreditQuoteDTO> {
    const { account, scope } = await this.getOrCreateCreditAccountForScope(
      params.scope,
    );
    const resolvedPlanKey =
      "planKey" in params.featureParams && params.featureParams.planKey
        ? params.featureParams.planKey
        : account.planKey;
    const featureParams = {
      ...params.featureParams,
      ...(params.featureParams.featureKey === "watermark" ||
      params.featureParams.featureKey === "large_upload_overage"
        ? { planKey: resolvedPlanKey }
        : {}),
    } as CreditFeatureCostParams;
    const requiredCredits = calculateFeatureCreditCost(featureParams);
    const quoteMessage = getCreditFeatureQuoteMessage(featureParams);

    return toQuoteDTO({
      availableCredits: account.availableCredits,
      planKey: resolvedPlanKey,
      projectCurrency: featureParams.currency,
      quoteMessage: {
        ...quoteMessage,
        requiredCredits,
      },
      scope,
    });
  }

  async refundCreditsForVersion(versionId: string, refundReason = "processing_failed") {
    const entries = await this.repository.getLedgerEntriesByVersionId(versionId);
    const deductions = entries.filter((e) => e.type === "deduction");

    if (deductions.length === 0) {
      return;
    }

    await Promise.all(
      deductions.map(async (deduction) => {
        const refundKey = `refund:${deduction.idempotencyKey}`;
        const alreadyRefunded = entries.some((e) => e.idempotencyKey === refundKey);

        if (alreadyRefunded) {
          return;
        }

        await this.refundCredits({
          credits: Math.abs(deduction.credits),
          fileId: deduction.fileId,
          idempotencyKey: refundKey,
          metadata: {
            ...(deduction.metadata ?? {}),
            refundReason,
          },
          projectId: deduction.projectId,
          versionId: deduction.versionId,
        });
      }),
    );
  }
}

export const creditService = new CreditService(new DrizzleCreditRepository());
