import {
  CREDIT_PLANS,
  FEATURE_CREDIT_COSTS,
  type CreditPlanKey,
  type StorageAddOnKey,
} from "@/lib/credits";
import type { StorageBalanceDTO } from "@/lib/dto/storage";
import {
  DrizzleStorageRepository,
  type StorageRepository,
} from "@/lib/repositories/storage-repository";
import { creditService } from "@/lib/services/credit-service";
import { StorageLimitExceededError } from "@/lib/storage/errors";
import {
  resolveStorageBillingScope,
  type StorageBillingScope,
} from "@/lib/storage/storage-billing-scope";
import type { StorageLedgerMetadata } from "@/lib/storage/types";

const BYTES_PER_GB = 1024 * 1024 * 1024;

/**
 * Normalizes a storage account snapshot into the client-facing balance DTO.
 */
function toStorageBalanceDTO(input: {
  actorUserId: string;
  planKey: CreditPlanKey;
  reservedStorageBytes: number;
  scopeId: string;
  scopeType: StorageBillingScope["scopeType"];
  storageLimitBytes: number;
  usedStorageBytes: number;
  extraStorageBytes?: number;
  extraStorageExpiresAt?: string | null;
}): StorageBalanceDTO {
  return {
    actorUserId: input.actorUserId,
    availableStorageBytes: Math.max(
      0,
      input.storageLimitBytes -
        input.usedStorageBytes -
        input.reservedStorageBytes,
    ),
    planKey: input.planKey,
    reservedStorageBytes: input.reservedStorageBytes,
    scopeId: input.scopeId,
    scopeType: input.scopeType,
    storageLimitBytes: input.storageLimitBytes,
    usedStorageBytes: input.usedStorageBytes,
    extraStorageBytes: input.extraStorageBytes ?? 0,
    extraStorageExpiresAt: input.extraStorageExpiresAt ?? null,
  };
}

/**
 * Coordinates storage billing limits against the active personal/workspace scope.
 */
export class StorageService {
  constructor(private readonly repository: StorageRepository) {}

  /**
   * Returns the current storage account for the resolved billing scope.
   *
   * The current app maps storage to the actor's personal scope. The account is
   * created once per scope and bootstraps existing billed uploads so future
   * Studio workspaces can reuse the same service.
   */
  async getOrCreateStorageAccount(scope?: StorageBillingScope) {
    const resolvedScope = scope ?? (await resolveStorageBillingScope());
    const { account: creditAccount } =
      await creditService.getOrCreateCreditAccountForScope(resolvedScope);
    const storageLimitBytes = CREDIT_PLANS[creditAccount.planKey].storageLimitBytes;
    const existing = await this.repository.getAccountByScope(resolvedScope);

    if (existing) {
      // Recalculate the plan quota plus active, non-expired add-ons on every
      // balance read. This keeps the billing UI correct even before the cron
      // expiration job has run, and prevents a plan change from dropping a
      // still-active add-on.
      const synced = await this.repository.syncAccountLimits({
        accountId: existing.id,
        planKey: creditAccount.planKey,
        storageLimitBytes,
      });
      return {
        account: synced.account,
        extraStorageBytes: synced.extraStorageBytes,
        extraStorageExpiresAt: synced.extraStorageExpiresAt,
        created: false,
        scope: resolvedScope,
      };
    }

    const usedStorageBytes =
      await this.repository.calculateBootstrappedUsageBytes(resolvedScope);
    const created = await this.repository.getOrCreateAccount({
      planKey: creditAccount.planKey,
      scopeId: resolvedScope.scopeId,
      scopeType: resolvedScope.scopeType,
      storageLimitBytes,
      usedStorageBytes,
    });

    return {
      ...created,
      scope: resolvedScope,
    };
  }

  /**
   * Returns the current billed storage summary for the active scope.
   */
  async getStorageBalance(scope?: StorageBillingScope): Promise<StorageBalanceDTO> {
    const res = await this.getOrCreateStorageAccount(scope);
    const { account, scope: resolvedScope } = res;

    return toStorageBalanceDTO({
      actorUserId: resolvedScope.actorUserId,
      planKey: account.planKey,
      reservedStorageBytes: account.reservedStorageBytes,
      scopeId: account.scopeId,
      scopeType: account.scopeType,
      storageLimitBytes: account.storageLimitBytes,
      usedStorageBytes: account.usedStorageBytes,
      extraStorageBytes: (res as any).extraStorageBytes ?? 0,
      extraStorageExpiresAt: (res as any).extraStorageExpiresAt ?? null,
    });
  }

  async purchaseStorageAddOn(input: {
    currency: string;
    idempotencyKey: string;
    storageAddOnKey: StorageAddOnKey;
    scope?: StorageBillingScope;
  }) {
    const resolvedScope = input.scope ?? (await resolveStorageBillingScope());
    const addOn = FEATURE_CREDIT_COSTS.storage[input.storageAddOnKey];
    const { quote, deduction } =
      await creditService.calculateAndDeductFeatureCredits({
        featureParams: {
          currency: input.currency,
          featureKey: "storage_add_on",
          storageAddOnKey: input.storageAddOnKey,
        },
        idempotencyKey: `storage-addon:${resolvedScope.scopeType}:${resolvedScope.scopeId}:${input.idempotencyKey}`,
        metadata: {
          featureReason: "storage_add_on_purchase",
          storageAddOnKey: input.storageAddOnKey,
          storageGb: addOn.storageGb,
        },
        scope: resolvedScope,
      });

    const expiresAt = new Date(
      Date.now() + addOn.validityDays * 24 * 60 * 60 * 1000,
    );

    try {
      await this.getOrCreateStorageAccount(resolvedScope);
      await this.repository.grantStorageAddOn({
        actorUserId: resolvedScope.actorUserId,
        bytesDelta: addOn.storageGb * BYTES_PER_GB,
        expiresAt,
        idempotencyKey: `storage-addon:${resolvedScope.scopeType}:${resolvedScope.scopeId}:${input.idempotencyKey}`,
        scopeId: resolvedScope.scopeId,
        scopeType: resolvedScope.scopeType,
      });
    } catch (error) {
      if (deduction) {
        await creditService.refundCredits({
          credits: quote.requiredCredits,
          idempotencyKey: `refund:storage-addon:${resolvedScope.scopeType}:${resolvedScope.scopeId}:${input.idempotencyKey}`,
          metadata: {
            featureReason: "storage_add_on_purchase_failed",
            storageAddOnKey: input.storageAddOnKey,
          },
          scope: resolvedScope,
        });
      }
      throw error;
    }

    return {
      creditsUsed: quote.requiredCredits,
      expiresAt: expiresAt.toISOString(),
      storageAddOnKey: input.storageAddOnKey,
      storageGb: addOn.storageGb,
      balance: await this.getStorageBalance(resolvedScope),
    };
  }

  /**
   * Checks whether a billed upload can fit inside the current storage scope.
   *
   * This does not mutate storage usage. It is a UX/security pre-check for
   * upload session creation before the final commit path performs the atomic
   * usage increment.
   */
  async assertCanAllocateStorage(input: {
    requiredBytes: number;
    scope?: StorageBillingScope;
  }) {
    const balance = await this.getStorageBalance(input.scope);

    if (balance.availableStorageBytes < input.requiredBytes) {
      throw new StorageLimitExceededError({
        availableBytes: balance.availableStorageBytes,
        requiredBytes: input.requiredBytes,
      });
    }

    return balance;
  }

  /**
   * Commits billed storage usage once a user upload is accepted permanently.
   *
   * This mutates the DB-backed storage account exactly once per idempotency key
   * and is scoped to the active personal/workspace storage owner.
   */
  async commitStorageUsage(input: {
    bytes: number;
    fileId?: string | null;
    idempotencyKey: string;
    metadata?: StorageLedgerMetadata | null;
    projectId?: string | null;
    scope?: StorageBillingScope;
    skipEnsureAccount?: boolean;
    versionId?: string | null;
  }) {
    const resolvedScope = input.scope ?? (await resolveStorageBillingScope());

    if (!input.skipEnsureAccount) {
      await this.getOrCreateStorageAccount(resolvedScope);
    }

    return this.repository.commitStorageAtomic({
      actorUserId: resolvedScope.actorUserId,
      bytes: input.bytes,
      fileId: input.fileId,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
      operation: "commit",
      projectId: input.projectId,
      scopeId: resolvedScope.scopeId,
      scopeType: resolvedScope.scopeType,
      versionId: input.versionId,
    });
  }

  /**
   * Releases billed storage usage after a stored upload is deleted.
   *
   * The release is idempotent, never drops usage below zero, and is tied to
   * the active storage scope so future workspace-owned storage can reuse it.
   */
  async releaseStorageUsage(input: {
    bytes: number;
    fileId?: string | null;
    idempotencyKey: string;
    metadata?: StorageLedgerMetadata | null;
    projectId?: string | null;
    scope?: StorageBillingScope;
    versionId?: string | null;
  }) {
    const resolvedScope = input.scope ?? (await resolveStorageBillingScope());

    await this.getOrCreateStorageAccount(resolvedScope);

    return this.repository.releaseStorageAtomic({
      actorUserId: resolvedScope.actorUserId,
      bytes: input.bytes,
      fileId: input.fileId,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
      operation: "release",
      projectId: input.projectId,
      scopeId: resolvedScope.scopeId,
      scopeType: resolvedScope.scopeType,
      versionId: input.versionId,
    });
  }
}

export const storageService = new StorageService(new DrizzleStorageRepository());
