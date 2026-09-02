import { and, eq, isNull, sql } from "drizzle-orm";

import type { CreditPlanKey } from "@/lib/credits";
import { db } from "@/lib/db/client";
import {
  files,
  fileVersions,
  storageAccounts,
  storageAccountMutations,
  type StorageAccountMutationRecord,
  type StorageAccountRecord,
} from "@/lib/db/schema";
import {
  InvalidStorageAmountError,
  StorageAccountNotFoundError,
  StorageIdempotencyConflictError,
  StorageLimitExceededError,
} from "@/lib/storage/errors";
import type {
  StorageLedgerMetadata,
  StorageMutationOperation,
  StorageScopeType,
} from "@/lib/storage/types";
import { normalizeNullableUuid } from "@/lib/utils";

const POSTGRES_UNIQUE_VIOLATION_CODE = "23505";

export type CreateStorageAccountInput = {
  planKey: CreditPlanKey;
  scopeId: string;
  scopeType: StorageScopeType;
  storageLimitBytes: number;
  usedStorageBytes: number;
};

export type StorageAccountCreationResult = {
  account: StorageAccountRecord;
  created: boolean;
};

export type StorageAccountMutationInput = {
  actorUserId: string;
  bytes: number;
  fileId?: string | null;
  idempotencyKey: string;
  metadata?: StorageLedgerMetadata | null;
  operation: StorageMutationOperation;
  projectId?: string | null;
  scopeId: string;
  scopeType: StorageScopeType;
  versionId?: string | null;
};

export type StorageAccountMutationResult = {
  account: StorageAccountRecord;
  idempotentReplay: boolean;
  mutation: StorageAccountMutationRecord;
};

export interface StorageRepository {
  calculateBootstrappedUsageBytes(
    scope: Pick<CreateStorageAccountInput, "scopeId" | "scopeType">,
  ): Promise<number>;
  grantStorageAddOn(input: {
    actorUserId: string;
    bytesDelta: number;
    expiresAt: Date;
    idempotencyKey: string;
    scopeId: string;
    scopeType: StorageScopeType;
  }): Promise<StorageAccountMutationResult>;
  commitStorageAtomic(
    input: StorageAccountMutationInput,
  ): Promise<StorageAccountMutationResult>;
  getAccountByScope(
    scope: Pick<CreateStorageAccountInput, "scopeId" | "scopeType">,
  ): Promise<StorageAccountRecord | null>;
  getOrCreateAccount(
    input: CreateStorageAccountInput,
  ): Promise<StorageAccountCreationResult>;
  releaseStorageAtomic(
    input: StorageAccountMutationInput,
  ): Promise<StorageAccountMutationResult>;
  syncAccountLimits(input: {
    accountId: string;
    planKey: CreditPlanKey;
    storageLimitBytes: number;
  }): Promise<StorageAccountRecord>;
}

/**
 * Detects duplicate-key conflicts so idempotent storage mutations can replay.
 */
function isUniqueViolationError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION_CODE
  );
}

/**
 * Guards all mutation entry points against zero-byte or fractional updates.
 */
function assertPositiveStorageAmount(bytes: number) {
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new InvalidStorageAmountError();
  }
}

/**
 * Mirrors the DB-side storage availability calculation for friendly errors.
 */
function getAvailableStorageBytes(account: Pick<
  StorageAccountRecord,
  "reservedStorageBytes" | "storageLimitBytes" | "usedStorageBytes"
>) {
  return Math.max(
    0,
    account.storageLimitBytes -
      account.usedStorageBytes -
      account.reservedStorageBytes,
  );
}

/**
 * Drizzle-backed persistence for scope-aware storage accounts and mutations.
 */
export class DrizzleStorageRepository implements StorageRepository {
  /**
   * Bootstraps current billed storage usage for the temporary single-scope app.
   *
   * Until project ownership and workspace membership exist, every active file
   * version belongs to the single personal storage scope.
   */
  async calculateBootstrappedUsageBytes(
    scope: Pick<CreateStorageAccountInput, "scopeId" | "scopeType">,
  ): Promise<number> {
    void scope;

    const [versionUsage] = await db
      .select({
        total: sql<number>`coalesce(sum(${fileVersions.sizeBytes}), 0)`,
      })
      .from(fileVersions)
      .innerJoin(files, eq(fileVersions.fileId, files.id))
      .where(and(isNull(fileVersions.deletedAt), isNull(files.deletedAt)));

    const [legacyUsage] = await db
      .select({
        total: sql<number>`coalesce(sum(${files.sizeBytes}), 0)`,
      })
      .from(files)
      .where(
        and(
          isNull(files.deletedAt),
          sql`not exists (
            select 1
            from ${fileVersions}
            where ${fileVersions.fileId} = ${files.id}
          )`,
        ),
      );

    return Number(versionUsage?.total ?? 0) + Number(legacyUsage?.total ?? 0);
  }

  /**
   * Loads the persisted storage account for a personal or workspace scope.
   */
  async getAccountByScope(
    scope: Pick<CreateStorageAccountInput, "scopeId" | "scopeType">,
  ): Promise<StorageAccountRecord | null> {
    const [record] = await db
      .select()
      .from(storageAccounts)
      .where(
        and(
          eq(storageAccounts.scopeType, scope.scopeType),
          eq(storageAccounts.scopeId, scope.scopeId),
        ),
      )
      .limit(1);

    return record ?? null;
  }

  /**
   * Creates one storage account per billing scope and safely reuses races.
   */
  async getOrCreateAccount(
    input: CreateStorageAccountInput,
  ): Promise<StorageAccountCreationResult> {
    const existing = await this.getAccountByScope(input);

    if (existing) {
      return {
        account: existing,
        created: false,
      };
    }

    try {
      const [account] = await db
        .insert(storageAccounts)
        .values({
          planKey: input.planKey,
          reservedStorageBytes: 0,
          scopeId: input.scopeId,
          scopeType: input.scopeType,
          storageLimitBytes: input.storageLimitBytes,
          usedStorageBytes: input.usedStorageBytes,
        })
        .returning();

      if (!account) {
        throw new Error("Failed to create storage account.");
      }

      return {
        account,
        created: true,
      };
    } catch (error) {
      if (!isUniqueViolationError(error)) {
        throw error;
      }

      const replay = await this.getAccountByScope(input);

      if (!replay) {
        throw error;
      }

      return {
        account: replay,
        created: false,
      };
    }
  }

  /**
   * Keeps the storage account aligned with the credit plan's storage quota.
   */
  async syncAccountLimits(input: {
    accountId: string;
    planKey: CreditPlanKey;
    storageLimitBytes: number;
  }): Promise<StorageAccountRecord> {
    const [account] = await db
      .update(storageAccounts)
      .set({
        planKey: input.planKey,
        storageLimitBytes: input.storageLimitBytes,
        updatedAt: new Date(),
      })
      .where(eq(storageAccounts.id, input.accountId))
      .returning();

    if (!account) {
      throw new Error(`Failed to sync storage account limits for ${input.accountId}`);
    }

    return account;
  }

  async grantStorageAddOn(input: {
    actorUserId: string;
    bytesDelta: number;
    expiresAt: Date;
    idempotencyKey: string;
    scopeId: string;
    scopeType: StorageScopeType;
  }): Promise<StorageAccountMutationResult> {
    return await db.transaction(async (tx) => {
      const [account] = await tx
        .update(storageAccounts)
        .set({
          storageLimitBytes: sql`${storageAccounts.storageLimitBytes} + ${input.bytesDelta}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(storageAccounts.scopeType, input.scopeType),
            eq(storageAccounts.scopeId, input.scopeId),
          ),
        )
        .returning();

      if (!account) {
        throw new StorageAccountNotFoundError();
      }

      const [mutation] = await tx
        .insert(storageAccountMutations)
        .values({
          accountId: account.id,
          actorUserId: input.actorUserId,
          bytesDelta: input.bytesDelta,
          expiresAt: input.expiresAt,
          idempotencyKey: input.idempotencyKey,
          operation: "adjustment",
          scopeId: input.scopeId,
          scopeType: input.scopeType,
        })
        .returning();

      if (!mutation) {
        throw new Error("Failed to create storage add-on mutation.");
      }

      return {
        account,
        idempotentReplay: false,
        mutation,
      };
    });
  }

  /**
   * Atomically increments storage usage and records an idempotent ledger row.
   */
  async commitStorageAtomic(
    input: StorageAccountMutationInput,
  ): Promise<StorageAccountMutationResult> {
    assertPositiveStorageAmount(input.bytes);

    const replay = await this.findMutationByIdempotencyKey(input.idempotencyKey);

    if (replay) {
      return {
        account: await this.getRequiredAccountById(replay.accountId),
        idempotentReplay: true,
        mutation: replay,
      };
    }

    try {
      return await db.transaction(async (tx) => {
        const [account] = await tx
          .update(storageAccounts)
          .set({
            updatedAt: new Date(),
            usedStorageBytes:
              sql`${storageAccounts.usedStorageBytes} + ${input.bytes}`,
          })
          .where(
            and(
              eq(storageAccounts.scopeType, input.scopeType),
              eq(storageAccounts.scopeId, input.scopeId),
              sql`${storageAccounts.storageLimitBytes} - ${storageAccounts.usedStorageBytes} - ${storageAccounts.reservedStorageBytes} >= ${input.bytes}`,
            ),
          )
          .returning();

        if (!account) {
          const existing = await tx
            .select()
            .from(storageAccounts)
            .where(
              and(
                eq(storageAccounts.scopeType, input.scopeType),
                eq(storageAccounts.scopeId, input.scopeId),
              ),
            )
            .limit(1);

          if (!existing[0]) {
            throw new StorageAccountNotFoundError();
          }

          const availableBytes = getAvailableStorageBytes(existing[0]);

          throw new StorageLimitExceededError({
            availableBytes,
            requiredBytes: input.bytes,
          });
        }

        const [mutation] = await tx
          .insert(storageAccountMutations)
          .values({
            accountId: account.id,
            actorUserId: input.actorUserId,
            bytesDelta: input.bytes,
            fileId: normalizeNullableUuid(input.fileId),
            idempotencyKey: input.idempotencyKey,
            metadata: input.metadata ?? null,
            operation: input.operation,
            projectId: normalizeNullableUuid(input.projectId),
            scopeId: input.scopeId,
            scopeType: input.scopeType,
            versionId: normalizeNullableUuid(input.versionId),
          })
          .returning();

        if (!mutation) {
          throw new Error("Failed to create storage mutation.");
        }

        return {
          account,
          idempotentReplay: false,
          mutation,
        };
      });
    } catch (error) {
      if (!isUniqueViolationError(error)) {
        throw error;
      }

      const dedupeReplay = await this.findMutationByIdempotencyKey(
        input.idempotencyKey,
      );

      if (!dedupeReplay) {
        throw new StorageIdempotencyConflictError();
      }

      return {
        account: await this.getRequiredAccountById(dedupeReplay.accountId),
        idempotentReplay: true,
        mutation: dedupeReplay,
      };
    }
  }

  /**
   * Atomically decrements storage usage and records the paired release ledger row.
   */
  async releaseStorageAtomic(
    input: StorageAccountMutationInput,
  ): Promise<StorageAccountMutationResult> {
    assertPositiveStorageAmount(input.bytes);

    const replay = await this.findMutationByIdempotencyKey(input.idempotencyKey);

    if (replay) {
      return {
        account: await this.getRequiredAccountById(replay.accountId),
        idempotentReplay: true,
        mutation: replay,
      };
    }

    try {
      return await db.transaction(async (tx) => {
        const [account] = await tx
          .update(storageAccounts)
          .set({
            updatedAt: new Date(),
            usedStorageBytes:
              sql`greatest(${storageAccounts.usedStorageBytes} - ${input.bytes}, 0)`,
          })
          .where(
            and(
              eq(storageAccounts.scopeType, input.scopeType),
              eq(storageAccounts.scopeId, input.scopeId),
            ),
          )
          .returning();

        if (!account) {
          throw new StorageAccountNotFoundError();
        }

        const [mutation] = await tx
          .insert(storageAccountMutations)
          .values({
            accountId: account.id,
            actorUserId: input.actorUserId,
            bytesDelta: -input.bytes,
            fileId: normalizeNullableUuid(input.fileId),
            idempotencyKey: input.idempotencyKey,
            metadata: input.metadata ?? null,
            operation: input.operation,
            projectId: normalizeNullableUuid(input.projectId),
            scopeId: input.scopeId,
            scopeType: input.scopeType,
            versionId: normalizeNullableUuid(input.versionId),
          })
          .returning();

        if (!mutation) {
          throw new Error("Failed to create storage mutation.");
        }

        return {
          account,
          idempotentReplay: false,
          mutation,
        };
      });
    } catch (error) {
      if (!isUniqueViolationError(error)) {
        throw error;
      }

      const dedupeReplay = await this.findMutationByIdempotencyKey(
        input.idempotencyKey,
      );

      if (!dedupeReplay) {
        throw new StorageIdempotencyConflictError();
      }

      return {
        account: await this.getRequiredAccountById(dedupeReplay.accountId),
        idempotentReplay: true,
        mutation: dedupeReplay,
      };
    }
  }

  private async findMutationByIdempotencyKey(idempotencyKey: string) {
    const [mutation] = await db
      .select()
      .from(storageAccountMutations)
      .where(eq(storageAccountMutations.idempotencyKey, idempotencyKey))
      .limit(1);

    return mutation ?? null;
  }

  private async getRequiredAccountById(accountId: string) {
    const [account] = await db
      .select()
      .from(storageAccounts)
      .where(eq(storageAccounts.id, accountId))
      .limit(1);

    if (!account) {
      throw new StorageAccountNotFoundError();
    }

    return account;
  }
}
