import { CREDIT_PLANS } from "@/lib/credits";
import type { CreditPlanKey } from "@/lib/credits";
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
      if (
        existing.planKey !== creditAccount.planKey ||
        existing.storageLimitBytes !== storageLimitBytes
      ) {
        const synced = await this.repository.syncAccountLimits({
          accountId: existing.id,
          planKey: creditAccount.planKey,
          storageLimitBytes,
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
    const { account, scope: resolvedScope } =
      await this.getOrCreateStorageAccount(scope);

    return toStorageBalanceDTO({
      actorUserId: resolvedScope.actorUserId,
      planKey: account.planKey,
      reservedStorageBytes: account.reservedStorageBytes,
      scopeId: account.scopeId,
      scopeType: account.scopeType,
      storageLimitBytes: account.storageLimitBytes,
      usedStorageBytes: account.usedStorageBytes,
    });
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
    versionId?: string | null;
  }) {
    const resolvedScope = input.scope ?? (await resolveStorageBillingScope());

    await this.getOrCreateStorageAccount(resolvedScope);

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
