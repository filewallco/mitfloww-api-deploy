import { and, asc, count, desc, eq, gte, gt, lt, sql } from "drizzle-orm";

import {
  CreditAccountNotFoundError,
  CreditIdempotencyConflictError,
  CreditReservationInvalidStateError,
  CreditReservationNotFoundError,
  InsufficientCreditsError,
} from "@/lib/credits";
import {
  CREDIT_LEDGER_SOURCES,
  CREDIT_LEDGER_TYPES,
  CREDIT_RESERVATION_STATUSES,
  type CreditLedgerMetadata,
  type CreditLedgerSource,
  type CreditLedgerType,
  type CreditPlanKey,
  type CreditReservationParams,
  type CreditReservationSnapshot,
  type CreditReservationStatus,
  type CreditDeductionParams,
  type CreditGrantParams,
  type CreditHistoryPaginationParams,
} from "@/lib/credits";
import type { CreditBillingScope } from "@/lib/credits/credit-billing-scope";
import { db } from "@/lib/db/client";
import {
  creditAccounts,
  creditLedgerEntries,
  creditReservations,
  type CreditAccountRecord,
  type CreditLedgerEntryRecord,
  type CreditReservationRecord,
} from "@/lib/db/schema";
import { normalizeNullableUuid } from "@/lib/utils";

const POSTGRES_UNIQUE_VIOLATION_CODE = "23505";

export type CreateCreditAccountInput = {
  initialGrantDescriptionKey?: string | null;
  initialGrantExpiresAt?: Date | null;
  initialGrantIdempotencyKey?: string | null;
  initialMonthlyCredits: number;
  planKey: CreditPlanKey;
  scopeId: string;
  scopeType: CreditBillingScope["scopeType"];
};

export type CreateCreditLedgerEntryInput = {
  accountId: string;
  actorUserId: string;
  balanceAfter: number;
  balanceBefore: number | null;
  credits: number;
  descriptionKey?: string | null;
  expiresAt?: Date | null;
  featureKey?: string | null;
  fileId?: string | null;
  idempotencyKey?: string | null;
  metadata?: CreditLedgerMetadata | null;
  scopeId: string;
  scopeType: CreditBillingScope["scopeType"];
  projectId?: string | null;
  source: CreditLedgerSource;
  type: CreditLedgerType;
  versionId?: string | null;
};

export type CreditAccountCreationResult = {
  account: CreditAccountRecord;
  created: boolean;
  initialLedgerEntry: CreditLedgerEntryRecord | null;
};

export type CreditHistoryListResult = {
  entries: CreditLedgerEntryRecord[];
  total: number;
};

export type CreditMutationResult = {
  account: CreditAccountRecord;
  idempotentReplay: boolean;
  ledgerEntry: CreditLedgerEntryRecord;
};

export type CreditReservationMutationResult = {
  account: CreditAccountRecord;
  idempotentReplay: boolean;
  ledgerEntry: CreditLedgerEntryRecord;
  reservation: CreditReservationRecord;
};

export interface CreditRepository {
  getAccountByScope(
    scope: Pick<CreditBillingScope, "scopeId" | "scopeType">,
  ): Promise<CreditAccountRecord | null>;
  createAccount(input: CreateCreditAccountInput): Promise<CreditAccountCreationResult>;
  getOrCreateAccount(
    input: CreateCreditAccountInput,
  ): Promise<CreditAccountCreationResult>;
  getBalance(
    scope: Pick<CreditBillingScope, "scopeId" | "scopeType">,
  ): Promise<CreditAccountRecord | null>;
  getUsageSummary(
    scope: Pick<CreditBillingScope, "scopeId" | "scopeType">,
  ): Promise<CreditAccountRecord | null>;
  listLedgerEntries(
    scope: Pick<CreditBillingScope, "scopeId" | "scopeType">,
    pagination: CreditHistoryPaginationParams & { offset: number },
  ): Promise<CreditHistoryListResult>;
  createLedgerEntry(
    input: CreateCreditLedgerEntryInput,
  ): Promise<CreditLedgerEntryRecord>;
  grantCreditsAtomic(input: CreditGrantParams): Promise<CreditMutationResult>;
  deductCreditsAtomic(input: CreditDeductionParams): Promise<CreditMutationResult>;
  createReservationAtomic(
    input: CreditReservationParams,
  ): Promise<CreditReservationMutationResult>;
  captureReservationAtomic(input: {
    actorUserId: string;
    descriptionKey?: string | null;
    metadata?: CreditLedgerMetadata | null;
    reservationId: string;
    scopeId: string;
    scopeType: CreditBillingScope["scopeType"];
  }): Promise<CreditReservationMutationResult>;
  releaseReservationAtomic(input: {
    actorUserId: string;
    descriptionKey?: string | null;
    metadata?: CreditLedgerMetadata | null;
    reservationId: string;
    scopeId: string;
    scopeType: CreditBillingScope["scopeType"];
  }): Promise<CreditReservationMutationResult>;
  getLedgerEntriesByVersionId(versionId: string): Promise<CreditLedgerEntryRecord[]>;
  getMonthlyUsage(
    scope: Pick<
    CreditBillingScope,
    "scopeId"|"scopeType"
    >,
    fromDate:Date,
    toDate:Date,
  ):Promise<number>;
  getPurchasedCreditsAvailable(
    scope: Pick<CreditBillingScope, "scopeId" | "scopeType">,
    now: Date,
  ): Promise<number>;
  syncAccountLimits(input: {
    accountId: string;
    planKey: CreditPlanKey;
    monthlyCredits: number;
    newAvailableCredits: number;
  }): Promise<CreditAccountRecord>;
}

function isUniqueViolationError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION_CODE
  );
}

function toReservationSnapshot(
  reservation: CreditReservationRecord,
): CreditReservationSnapshot {
  return {
    accountId: reservation.accountId,
    actorUserId: reservation.actorUserId,
    createdAt: reservation.createdAt,
    credits: reservation.credits,
    expiresAt: reservation.expiresAt,
    featureKey: reservation.featureKey as CreditReservationSnapshot["featureKey"],
    fileId: reservation.fileId,
    id: reservation.id,
    idempotencyKey: reservation.idempotencyKey,
    metadata: reservation.metadata ?? null,
    projectId: reservation.projectId,
    scopeId: reservation.scopeId,
    scopeType: reservation.scopeType as CreditReservationSnapshot["scopeType"],
    status: reservation.status,
    updatedAt: reservation.updatedAt,
    versionId: reservation.versionId,
  };
}

function buildReservationOperationIdempotencyKey(
  reservation: Pick<CreditReservationRecord, "idempotencyKey">,
  operation: "capture" | "release",
) {
  return `${reservation.idempotencyKey}:${operation}`;
}

export class DrizzleCreditRepository implements CreditRepository {
  async getAccountByScope(
    scope: Pick<CreditBillingScope, "scopeId" | "scopeType">,
  ): Promise<CreditAccountRecord | null> {
    const [record] = await db
      .select()
      .from(creditAccounts)
      .where(
        and(
          eq(creditAccounts.scopeType, scope.scopeType),
          eq(creditAccounts.scopeId, scope.scopeId),
        ),
      )
      .limit(1);

    return record ?? null;
  }

  async createAccount(
    input: CreateCreditAccountInput,
  ): Promise<CreditAccountCreationResult> {
    return db.transaction(async (tx) => {
      const [account] = await tx
        .insert(creditAccounts)
        .values({
          availableCredits: input.initialMonthlyCredits,
          currentMonthlyCredits: input.initialMonthlyCredits,
          currentUsedCredits: 0,
          lifetimeExpiredCredits: 0,
          lifetimeGrantedCredits: input.initialMonthlyCredits,
          lifetimePurchasedCredits: 0,
          lifetimeUsedCredits: 0,
          ownerId: input.scopeId,
          planKey: input.planKey,
          scopeId: input.scopeId,
          scopeType: input.scopeType,
        })
        .returning();

      if (!account) {
        throw new Error("Failed to create credit account.");
      }

      let initialLedgerEntry: CreditLedgerEntryRecord | null = null;

      if (input.initialMonthlyCredits > 0) {
        [initialLedgerEntry] = await tx
          .insert(creditLedgerEntries)
          .values({
            accountId: account.id,
            balanceAfter: input.initialMonthlyCredits,
            balanceBefore: 0,
            credits: input.initialMonthlyCredits,
            descriptionKey:
              input.initialGrantDescriptionKey ?? "creditsHistoryActionMonthlyPlan",
            expiresAt: input.initialGrantExpiresAt ?? null,
            featureKey: null,
            idempotencyKey: input.initialGrantIdempotencyKey ?? null,
            metadata: null,
            actorUserId: input.scopeId,
            ownerId: input.scopeId,
            projectId: null,
            scopeId: input.scopeId,
            scopeType: input.scopeType,
            source: CREDIT_LEDGER_SOURCES[0],
            type: CREDIT_LEDGER_TYPES[0],
          })
          .returning();
      }

      return {
        account,
        created: true,
        initialLedgerEntry,
      };
    });
  }

  async getOrCreateAccount(
    input: CreateCreditAccountInput,
  ): Promise<CreditAccountCreationResult> {
    const existing = await this.getAccountByScope(input);

    if (existing) {
      return {
        account: existing,
        created: false,
        initialLedgerEntry: null,
      };
    }

    try {
      return await this.createAccount(input);
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
        initialLedgerEntry: null,
      };
    }
  }

  async getBalance(
    scope: Pick<CreditBillingScope, "scopeId" | "scopeType">,
  ): Promise<CreditAccountRecord | null> {
    return this.getAccountByScope(scope);
  }

  async getUsageSummary(
    scope: Pick<CreditBillingScope, "scopeId" | "scopeType">,
  ): Promise<CreditAccountRecord | null> {
    return this.getAccountByScope(scope);
  }

  async syncAccountLimits(input: {
    accountId: string;
    planKey: CreditPlanKey;
    monthlyCredits: number;
    newAvailableCredits: number;
  }): Promise<CreditAccountRecord> {
    const [account] = await db
      .update(creditAccounts)
      .set({
        planKey: input.planKey,
        currentMonthlyCredits: input.monthlyCredits,
        availableCredits: input.newAvailableCredits,
        updatedAt: new Date(),
      })
      .where(eq(creditAccounts.id, input.accountId))
      .returning();

    if (!account) {
      throw new Error(`Failed to sync credit account limits for ${input.accountId}`);
    }

    return account;
  }

  async listLedgerEntries(
    scope: Pick<CreditBillingScope, "scopeId" | "scopeType">,
    pagination: CreditHistoryPaginationParams & { offset: number },
  ): Promise<CreditHistoryListResult> {
    const recordsPromise = db
      .select()
      .from(creditLedgerEntries)
      .where(
        and(
          eq(
            creditLedgerEntries.scopeType,
            scope.scopeType,
          ),

          eq(
            creditLedgerEntries.scopeId,
            scope.scopeId,
          ),

          gte(
            creditLedgerEntries.createdAt,
            pagination.fromDate,
          ),

          lt(
            creditLedgerEntries.createdAt,
            pagination.toDate,
          ),
        ),
      )
      .orderBy(desc(creditLedgerEntries.createdAt), desc(creditLedgerEntries.id))
      .limit(pagination.limit)
      .offset(pagination.offset);

    const totalPromise = db
      .select({ count: count() })
      .from(creditLedgerEntries)
      .where(
        and(
          eq(
            creditLedgerEntries.scopeType,
            scope.scopeType,
          ),

          eq(
            creditLedgerEntries.scopeId,
            scope.scopeId,
          ),

          gte(
            creditLedgerEntries.createdAt,
            pagination.fromDate,
          ),

          lt(
            creditLedgerEntries.createdAt,
            pagination.toDate,
          ),
        ),
      );

    const [entries, totalResult] = await Promise.all([
      recordsPromise,
      totalPromise,
    ]);

    return {
      entries,
      total: Number(totalResult[0]?.count ?? 0),
    };
  }

  async createLedgerEntry(
    input: CreateCreditLedgerEntryInput,
  ): Promise<CreditLedgerEntryRecord> {
    const [entry] = await db
      .insert(creditLedgerEntries)
      .values({
        accountId: input.accountId,
        actorUserId: input.actorUserId,
        balanceAfter: input.balanceAfter,
        balanceBefore: input.balanceBefore,
        credits: input.credits,
        descriptionKey: input.descriptionKey ?? null,
        expiresAt: input.expiresAt ?? null,
        featureKey: input.featureKey ?? null,
        fileId: normalizeNullableUuid(input.fileId),
        idempotencyKey: input.idempotencyKey ?? null,
        metadata: input.metadata ?? null,
        ownerId: input.scopeId,
        projectId: normalizeNullableUuid(input.projectId),
        scopeId: input.scopeId,
        scopeType: input.scopeType,
        source: input.source,
        type: input.type,
        versionId: normalizeNullableUuid(input.versionId),
      })
      .returning();

    if (!entry) {
      throw new Error("Failed to create credit ledger entry.");
    }

    return entry;
  }

  async grantCreditsAtomic(input: CreditGrantParams): Promise<CreditMutationResult> {
    if (input.idempotencyKey) {
      const replay = await this.findLedgerEntryByIdempotencyKey(input.idempotencyKey);

      if (replay) {
        const account = await this.getRequiredAccountById(replay.accountId);

        return {
          account,
          idempotentReplay: true,
          ledgerEntry: replay,
        };
      }
    }

    const ledgerType =
      input.type ?? (input.source === "purchased_pack" ? "purchase" : "grant");

    try {
      return await db.transaction(async (tx) => {
        const [account] = await tx
          .update(creditAccounts)
          .set({
            availableCredits: sql`${creditAccounts.availableCredits} + ${input.credits}`,
            updatedAt: new Date(),
            ...(input.source === "purchased_pack"
              ? {
                  availablePurchasedCredits:
                    sql`${creditAccounts.availablePurchasedCredits} + ${input.credits}`,
                  lifetimePurchasedCredits:
                    sql`${creditAccounts.lifetimePurchasedCredits} + ${input.credits}`,
                }
              : {
                  lifetimeGrantedCredits:
                    sql`${creditAccounts.lifetimeGrantedCredits} + ${input.credits}`,
                }),
          })
          .where(
            and(
              eq(creditAccounts.scopeType, input.scopeType),
              eq(creditAccounts.scopeId, input.scopeId),
            ),
          )
          .returning();

        if (!account) {
          throw new CreditAccountNotFoundError();
        }

        const [ledgerEntry] = await tx
          .insert(creditLedgerEntries)
          .values({
            accountId: account.id,
            balanceAfter: account.availableCredits,
            balanceBefore: account.availableCredits - input.credits,
            credits: input.credits,
            remainingCredits: input.source === "purchased_pack" ? input.credits : null,
            descriptionKey: input.descriptionKey ?? null,
            expiresAt: input.expiresAt ?? null,
            featureKey: input.featureKey ?? null,
            fileId: normalizeNullableUuid(input.fileId),
            idempotencyKey: input.idempotencyKey ?? null,
            metadata: input.metadata ?? null,
            actorUserId: input.actorUserId,
            ownerId: input.scopeId,
            projectId: normalizeNullableUuid(input.projectId),
            scopeId: input.scopeId,
            scopeType: input.scopeType,
            source: input.source,
            type: ledgerType,
            versionId: normalizeNullableUuid(input.versionId),
          })
          .returning();

        if (!ledgerEntry) {
          throw new Error("Failed to create grant ledger entry.");
        }

        return {
          account,
          idempotentReplay: false,
          ledgerEntry,
        };
      });
    } catch (error) {
      if (!input.idempotencyKey || !isUniqueViolationError(error)) {
        throw error;
      }

      const replay = await this.findLedgerEntryByIdempotencyKey(input.idempotencyKey);

      if (!replay) {
        throw new CreditIdempotencyConflictError();
      }

      return {
        account: await this.getRequiredAccountById(replay.accountId),
        idempotentReplay: true,
        ledgerEntry: replay,
      };
    }
  }

  async deductCreditsAtomic(
    input: CreditDeductionParams,
  ): Promise<CreditMutationResult> {
    const replay = await this.findLedgerEntryByIdempotencyKey(input.idempotencyKey);

    if (replay) {
      return {
        account: await this.getRequiredAccountById(replay.accountId),
        idempotentReplay: true,
        ledgerEntry: replay,
      };
    }

    try {
      return await db.transaction(async (tx) => {
        const existingAccounts = await tx
          .select()
          .from(creditAccounts)
          .where(
            and(
              eq(creditAccounts.scopeType, input.scopeType),
              eq(creditAccounts.scopeId, input.scopeId),
            ),
          )
          .limit(1)
          .for("update");

        if (!existingAccounts[0]) {
          throw new CreditAccountNotFoundError();
        }

        const existingAccount = existingAccounts[0];

        if (existingAccount.availableCredits < input.credits) {
          throw new InsufficientCreditsError();
        }

        const newAvailable = existingAccount.availableCredits - input.credits;
        const newPurchased = Math.min(existingAccount.availablePurchasedCredits, newAvailable);
        const purchasedSpent = existingAccount.availablePurchasedCredits - newPurchased;

        const [account] = await tx
          .update(creditAccounts)
          .set({
            availableCredits: newAvailable,
            availablePurchasedCredits: newPurchased,
            currentUsedCredits: existingAccount.currentUsedCredits + input.credits,
            lifetimeUsedCredits: existingAccount.lifetimeUsedCredits + input.credits,
            updatedAt: new Date(),
          })
          .where(eq(creditAccounts.id, existingAccount.id))
          .returning();

        if (!account) {
          throw new Error("Failed to update credit account.");
        }

        if (purchasedSpent > 0) {
          const purchasedEntries = await tx
            .select()
            .from(creditLedgerEntries)
            .where(
              and(
                eq(creditLedgerEntries.accountId, existingAccount.id),
                eq(creditLedgerEntries.source, "purchased_pack"),
                eq(creditLedgerEntries.isExpired, false),
                gt(creditLedgerEntries.remainingCredits, 0),
              ),
            )
            .orderBy(asc(creditLedgerEntries.createdAt));

          let remainingToSpend = purchasedSpent;
          for (const entry of purchasedEntries) {
            if (remainingToSpend <= 0) break;
            const spend = Math.min(remainingToSpend, entry.remainingCredits!);
            await tx
              .update(creditLedgerEntries)
              .set({ remainingCredits: entry.remainingCredits! - spend })
              .where(eq(creditLedgerEntries.id, entry.id));
            remainingToSpend -= spend;
          }
        }

        const [ledgerEntry] = await tx
          .insert(creditLedgerEntries)
          .values({
            accountId: account.id,
            actorUserId: input.actorUserId,
            balanceAfter: account.availableCredits,
            balanceBefore: account.availableCredits + input.credits,
            credits: -input.credits,
            descriptionKey: input.descriptionKey ?? null,
            expiresAt: input.expiresAt ?? null,
            featureKey: input.featureKey,
            fileId: normalizeNullableUuid(input.fileId),
            idempotencyKey: input.idempotencyKey,
            metadata: input.metadata ?? null,
            ownerId: input.scopeId,
            projectId: normalizeNullableUuid(input.projectId),
            scopeId: input.scopeId,
            scopeType: input.scopeType,
            source: input.source ?? "feature_usage",
            type: "deduction",
            versionId: normalizeNullableUuid(input.versionId),
          })
          .returning();

        if (!ledgerEntry) {
          throw new Error("Failed to create deduction ledger entry.");
        }

        return {
          account,
          idempotentReplay: false,
          ledgerEntry,
        };
      });
    } catch (error) {
      if (!isUniqueViolationError(error)) {
        throw error;
      }

      const dedupeReplay = await this.findLedgerEntryByIdempotencyKey(
        input.idempotencyKey,
      );

      if (!dedupeReplay) {
        throw new CreditIdempotencyConflictError();
      }

      return {
        account: await this.getRequiredAccountById(dedupeReplay.accountId),
        idempotentReplay: true,
        ledgerEntry: dedupeReplay,
      };
    }
  }

  async createReservationAtomic(
    input: CreditReservationParams,
  ): Promise<CreditReservationMutationResult> {
    const replay = await this.findReservationByIdempotencyKey(input.idempotencyKey);

    if (replay) {
      const account = await this.getRequiredAccountById(replay.accountId);
      const ledgerEntry = await this.getRequiredLedgerEntryByIdempotencyKey(
        input.idempotencyKey,
      );

      return {
        account,
        idempotentReplay: true,
        ledgerEntry,
        reservation: replay,
      };
    }

    try {
      return await db.transaction(async (tx) => {
        const [account] = await tx
          .update(creditAccounts)
          .set({
            availableCredits: sql`${creditAccounts.availableCredits} - ${input.credits}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(creditAccounts.scopeType, input.scopeType),
              eq(creditAccounts.scopeId, input.scopeId),
              sql`${creditAccounts.availableCredits} >= ${input.credits}`,
            ),
          )
          .returning();

        if (!account) {
          const existingAccount = await tx
            .select()
            .from(creditAccounts)
            .where(
              and(
                eq(creditAccounts.scopeType, input.scopeType),
                eq(creditAccounts.scopeId, input.scopeId),
              ),
            )
            .limit(1);

          if (!existingAccount[0]) {
            throw new CreditAccountNotFoundError();
          }

          throw new InsufficientCreditsError();
        }

        const [reservation] = await tx
          .insert(creditReservations)
          .values({
            accountId: account.id,
            actorUserId: input.actorUserId,
            credits: input.credits,
            expiresAt: input.expiresAt,
            featureKey: input.featureKey,
            fileId: normalizeNullableUuid(input.fileId),
            idempotencyKey: input.idempotencyKey,
            metadata: input.metadata ?? null,
            ownerId: input.scopeId,
            projectId: normalizeNullableUuid(input.projectId),
            scopeId: input.scopeId,
            scopeType: input.scopeType,
            status: CREDIT_RESERVATION_STATUSES[0],
            versionId: normalizeNullableUuid(input.versionId),
          })
          .returning();

        if (!reservation) {
          throw new Error("Failed to create credit reservation.");
        }

        const [ledgerEntry] = await tx
          .insert(creditLedgerEntries)
          .values({
            accountId: account.id,
            actorUserId: input.actorUserId,
            balanceAfter: account.availableCredits,
            balanceBefore: account.availableCredits + input.credits,
            credits: -input.credits,
            descriptionKey: input.descriptionKey ?? null,
            expiresAt: input.expiresAt,
            featureKey: input.featureKey,
            fileId: normalizeNullableUuid(input.fileId),
            idempotencyKey: input.idempotencyKey,
            metadata: input.metadata ?? null,
            ownerId: input.scopeId,
            projectId: normalizeNullableUuid(input.projectId),
            scopeId: input.scopeId,
            scopeType: input.scopeType,
            source: "feature_usage",
            type: "reservation",
            versionId: normalizeNullableUuid(input.versionId),
          })
          .returning();

        if (!ledgerEntry) {
          throw new Error("Failed to create reservation ledger entry.");
        }

        return {
          account,
          idempotentReplay: false,
          ledgerEntry,
          reservation,
        };
      });
    } catch (error) {
      if (!isUniqueViolationError(error)) {
        throw error;
      }

      const reservation = await this.findReservationByIdempotencyKey(
        input.idempotencyKey,
      );

      if (!reservation) {
        throw new CreditIdempotencyConflictError();
      }

      return {
        account: await this.getRequiredAccountById(reservation.accountId),
        idempotentReplay: true,
        ledgerEntry: await this.getRequiredLedgerEntryByIdempotencyKey(
          input.idempotencyKey,
        ),
        reservation,
      };
    }
  }

  async captureReservationAtomic(input: {
    actorUserId: string;
    descriptionKey?: string | null;
    metadata?: CreditLedgerMetadata | null;
    reservationId: string;
    scopeId: string;
    scopeType: CreditBillingScope["scopeType"];
  }): Promise<CreditReservationMutationResult> {
    return db.transaction(async (tx) => {
      const [reservation] = await tx
        .select()
        .from(creditReservations)
        .where(
          and(
            eq(creditReservations.id, input.reservationId),
            eq(creditReservations.scopeType, input.scopeType),
            eq(creditReservations.scopeId, input.scopeId),
          ),
        )
        .limit(1);

      if (!reservation) {
        throw new CreditReservationNotFoundError();
      }

      const replayKey = buildReservationOperationIdempotencyKey(
        reservation,
        "capture",
      );
      const existingLedger = await this.findLedgerEntryByIdempotencyKey(replayKey);

      if (reservation.status === "captured" && existingLedger) {
        return {
          account: await this.getRequiredAccountById(reservation.accountId),
          idempotentReplay: true,
          ledgerEntry: existingLedger,
          reservation,
        };
      }

      if (reservation.status !== "active") {
        throw new CreditReservationInvalidStateError();
      }

      const [account] = await tx
        .update(creditAccounts)
        .set({
          currentUsedCredits:
            sql`${creditAccounts.currentUsedCredits} + ${reservation.credits}`,
          lifetimeUsedCredits:
            sql`${creditAccounts.lifetimeUsedCredits} + ${reservation.credits}`,
          updatedAt: new Date(),
        })
        .where(eq(creditAccounts.id, reservation.accountId))
        .returning();

      if (!account) {
        throw new CreditAccountNotFoundError();
      }

      const [updatedReservation] = await tx
        .update(creditReservations)
        .set({
          status: "captured" satisfies CreditReservationStatus,
          updatedAt: new Date(),
        })
        .where(eq(creditReservations.id, reservation.id))
        .returning();

      if (!updatedReservation) {
        throw new Error("Failed to capture reservation.");
      }

      const [ledgerEntry] = await tx
        .insert(creditLedgerEntries)
        .values({
          accountId: account.id,
          actorUserId: input.actorUserId,
          balanceAfter: account.availableCredits,
          balanceBefore: account.availableCredits,
          credits: 0,
          descriptionKey:
            input.descriptionKey ?? "creditsHistoryActionReservationCapture",
          expiresAt: null,
          featureKey: updatedReservation.featureKey,
          fileId: normalizeNullableUuid(updatedReservation.fileId),
          idempotencyKey: replayKey,
          metadata: input.metadata ?? updatedReservation.metadata ?? null,
          ownerId: updatedReservation.scopeId,
          projectId: normalizeNullableUuid(updatedReservation.projectId),
          scopeId: updatedReservation.scopeId,
          scopeType: updatedReservation.scopeType,
          source: "feature_usage",
          type: "reservation_capture",
          versionId: normalizeNullableUuid(updatedReservation.versionId),
        })
        .returning();

      if (!ledgerEntry) {
        throw new Error("Failed to create reservation capture ledger entry.");
      }

      return {
        account,
        idempotentReplay: false,
        ledgerEntry,
        reservation: updatedReservation,
      };
    });
  }

  async releaseReservationAtomic(input: {
    actorUserId: string;
    descriptionKey?: string | null;
    metadata?: CreditLedgerMetadata | null;
    reservationId: string;
    scopeId: string;
    scopeType: CreditBillingScope["scopeType"];
  }): Promise<CreditReservationMutationResult> {
    return db.transaction(async (tx) => {
      const [reservation] = await tx
        .select()
        .from(creditReservations)
        .where(
          and(
            eq(creditReservations.id, input.reservationId),
            eq(creditReservations.scopeType, input.scopeType),
            eq(creditReservations.scopeId, input.scopeId),
          ),
        )
        .limit(1);

      if (!reservation) {
        throw new CreditReservationNotFoundError();
      }

      const replayKey = buildReservationOperationIdempotencyKey(
        reservation,
        "release",
      );
      const existingLedger = await this.findLedgerEntryByIdempotencyKey(replayKey);

      if (reservation.status === "released" && existingLedger) {
        return {
          account: await this.getRequiredAccountById(reservation.accountId),
          idempotentReplay: true,
          ledgerEntry: existingLedger,
          reservation,
        };
      }

      if (reservation.status !== "active") {
        throw new CreditReservationInvalidStateError();
      }

      const [account] = await tx
        .update(creditAccounts)
        .set({
          availableCredits:
            sql`${creditAccounts.availableCredits} + ${reservation.credits}`,
          updatedAt: new Date(),
        })
        .where(eq(creditAccounts.id, reservation.accountId))
        .returning();

      if (!account) {
        throw new CreditAccountNotFoundError();
      }

      const [updatedReservation] = await tx
        .update(creditReservations)
        .set({
          status: "released" satisfies CreditReservationStatus,
          updatedAt: new Date(),
        })
        .where(eq(creditReservations.id, reservation.id))
        .returning();

      if (!updatedReservation) {
        throw new Error("Failed to release reservation.");
      }

      const [ledgerEntry] = await tx
        .insert(creditLedgerEntries)
        .values({
          accountId: account.id,
          actorUserId: input.actorUserId,
          balanceAfter: account.availableCredits,
          balanceBefore: account.availableCredits - reservation.credits,
          credits: reservation.credits,
          descriptionKey:
            input.descriptionKey ?? "creditsHistoryActionReservationRelease",
          expiresAt: null,
          featureKey: updatedReservation.featureKey,
          fileId: normalizeNullableUuid(updatedReservation.fileId),
          idempotencyKey: replayKey,
          metadata: input.metadata ?? updatedReservation.metadata ?? null,
          ownerId: updatedReservation.scopeId,
          projectId: normalizeNullableUuid(updatedReservation.projectId),
          scopeId: updatedReservation.scopeId,
          scopeType: updatedReservation.scopeType,
          source: "feature_usage",
          type: "reservation_release",
          versionId: normalizeNullableUuid(updatedReservation.versionId),
        })
        .returning();

      if (!ledgerEntry) {
        throw new Error("Failed to create reservation release ledger entry.");
      }

      return {
        account,
        idempotentReplay: false,
        ledgerEntry,
        reservation: updatedReservation,
      };
    });
  }

  private async findLedgerEntryByIdempotencyKey(idempotencyKey: string) {
    const [entry] = await db
      .select()
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.idempotencyKey, idempotencyKey))
      .limit(1);

    return entry ?? null;
  }

  private async getRequiredLedgerEntryByIdempotencyKey(idempotencyKey: string) {
    const entry = await this.findLedgerEntryByIdempotencyKey(idempotencyKey);

    if (!entry) {
      throw new CreditIdempotencyConflictError();
    }

    return entry;
  }

  private async findReservationByIdempotencyKey(idempotencyKey: string) {
    const [reservation] = await db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.idempotencyKey, idempotencyKey))
      .limit(1);

    return reservation ?? null;
  }

  private async getRequiredAccountById(accountId: string) {
    const [account] = await db
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.id, accountId))
      .limit(1);

    if (!account) {
      throw new CreditAccountNotFoundError();
    }

    return account;
  }

  async getLedgerEntriesByVersionId(
    versionId: string,
  ): Promise<CreditLedgerEntryRecord[]> {
    return db
      .select()
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.versionId, versionId));
  }

  async getMonthlyUsage(
    scope: Pick<
      CreditBillingScope,
      "scopeId" | "scopeType"
    >,
    fromDate: Date,
    toDate: Date,
  ): Promise<number> {

    const result =
      await db
        .select({
          total: sql<number>`
          COALESCE(SUM(${creditLedgerEntries.credits}),0)
        `,
        })
        .from(creditLedgerEntries)
        .where(
          and(
            eq(
              creditLedgerEntries.scopeId,
              scope.scopeId,
            ),

            eq(
              creditLedgerEntries.scopeType,
              scope.scopeType,
            ),

            lt(
              creditLedgerEntries.credits,
              0,
            ),

            gte(
              creditLedgerEntries.createdAt,
              fromDate,
            ),

            lt(
              creditLedgerEntries.createdAt,
              toDate,
            ),
          ),
        );


    return Math.abs(
      Number(result[0]?.total ?? 0),
    );
  }

  async getPurchasedCreditsAvailable(
    scope: Pick<CreditBillingScope, "scopeId" | "scopeType">,
    now: Date,
  ): Promise<number> {

    const result = await db
      .select({
        total: sql<number>`
          COALESCE(SUM(${creditLedgerEntries.credits}),0)
        `,
      })
      .from(creditLedgerEntries)
      .where(
        and(
          eq(
            creditLedgerEntries.scopeId,
            scope.scopeId,
          ),

          eq(
            creditLedgerEntries.scopeType,
            scope.scopeType,
          ),

          eq(
            creditLedgerEntries.source,
            "purchased_pack",
          ),

          gt(
            creditLedgerEntries.expiresAt,
            now,
          ),
        ),
      );


    return Number(
      result[0]?.total ?? 0,
    );
  }
}
