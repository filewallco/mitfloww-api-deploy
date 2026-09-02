import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  type PgSchema,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  CREDIT_PLAN_KEYS,
  type CreditPlanKey,
} from "@/lib/credits";
import {
  STORAGE_MUTATION_OPERATIONS,
  STORAGE_SCOPE_TYPES,
  type StorageLedgerMetadata,
  type StorageMutationOperation,
  type StorageScopeType,
} from "@/lib/storage/types";
import type { createFileTables } from "./files";
import type { createProjectTables } from "./projects";

function buildSqlStringList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(","));
}

export const createStorageTables = (
  fw: PgSchema,
  tables: {
    fileVersions: ReturnType<typeof createFileTables>["fileVersions"];
    files: ReturnType<typeof createFileTables>["files"];
    projects: ReturnType<typeof createProjectTables>["projects"];
  },
) => {
  const storageAccounts = fw.table(
    "storage_accounts",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      scopeType: varchar("scope_type", { length: 32 })
        .$type<StorageScopeType>()
        .notNull(),
      scopeId: varchar("scope_id", { length: 255 }).notNull(),
      planKey: varchar("plan_key", { length: 32 })
        .$type<CreditPlanKey>()
        .notNull(),
      storageLimitBytes: bigint("storage_limit_bytes", { mode: "number" })
        .notNull()
        .default(0),
      usedStorageBytes: bigint("used_storage_bytes", { mode: "number" })
        .notNull()
        .default(0),
      reservedStorageBytes: bigint("reserved_storage_bytes", {
        mode: "number",
      })
        .notNull()
        .default(0),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("storage_accounts_scope_unique_idx").on(
        table.scopeType,
        table.scopeId,
      ),
      index("storage_accounts_plan_key_idx").on(table.planKey),
      check(
        "storage_accounts_scope_type_check",
        sql`${table.scopeType} IN (${buildSqlStringList(STORAGE_SCOPE_TYPES)})`,
      ),
      check(
        "storage_accounts_plan_key_check",
        sql`${table.planKey} IN (${buildSqlStringList(CREDIT_PLAN_KEYS)})`,
      ),
      check(
        "storage_accounts_storage_limit_bytes_check",
        sql`${table.storageLimitBytes} >= 0`,
      ),
      check(
        "storage_accounts_used_storage_bytes_check",
        sql`${table.usedStorageBytes} >= 0`,
      ),
      check(
        "storage_accounts_reserved_storage_bytes_check",
        sql`${table.reservedStorageBytes} >= 0`,
      ),
    ],
  );

  const storageAccountMutations = fw.table(
    "storage_account_mutations",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      accountId: uuid("account_id")
        .notNull()
        .references(() => storageAccounts.id, { onDelete: "cascade" }),
      scopeType: varchar("scope_type", { length: 32 })
        .$type<StorageScopeType>()
        .notNull(),
      scopeId: varchar("scope_id", { length: 255 }).notNull(),
      actorUserId: varchar("actor_user_id", { length: 255 }).notNull(),
      operation: varchar("operation", { length: 32 })
        .$type<StorageMutationOperation>()
        .notNull(),
      bytesDelta: bigint("bytes_delta", { mode: "number" }).notNull(),
      idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
      projectId: uuid("project_id").references(() => tables.projects.id, {
        onDelete: "set null",
      }),
      fileId: uuid("file_id").references(() => tables.files.id, {
        onDelete: "set null",
      }),
      versionId: uuid("version_id").references(() => tables.fileVersions.id, {
        onDelete: "set null",
      }),
      metadata: jsonb("metadata").$type<StorageLedgerMetadata>(),
      expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }),
      isExpired: boolean("is_expired").notNull().default(false),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("storage_account_mutations_idempotency_unique_idx").on(
        table.idempotencyKey,
      ),
      index("storage_account_mutations_account_created_at_idx").on(
        table.accountId,
        table.createdAt,
      ),
      index("storage_account_mutations_scope_created_at_idx").on(
        table.scopeType,
        table.scopeId,
        table.createdAt,
      ),
      check(
        "storage_account_mutations_scope_type_check",
        sql`${table.scopeType} IN (${buildSqlStringList(STORAGE_SCOPE_TYPES)})`,
      ),
      check(
        "storage_account_mutations_operation_check",
        sql`${table.operation} IN (${buildSqlStringList(STORAGE_MUTATION_OPERATIONS)})`,
      ),
      check(
        "storage_account_mutations_bytes_delta_check",
        sql`${table.bytesDelta} <> 0`,
      ),
    ],
  );

  return {
    storageAccounts,
    storageAccountMutations,
  };
};

export type StorageAccountRecord = InferSelectModel<
  ReturnType<typeof createStorageTables>["storageAccounts"]
>;

export type NewStorageAccountRecord = InferInsertModel<
  ReturnType<typeof createStorageTables>["storageAccounts"]
>;

export type StorageAccountMutationRecord = InferSelectModel<
  ReturnType<typeof createStorageTables>["storageAccountMutations"]
>;

export type NewStorageAccountMutationRecord = InferInsertModel<
  ReturnType<typeof createStorageTables>["storageAccountMutations"]
>;
