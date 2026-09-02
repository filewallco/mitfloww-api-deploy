import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  boolean,
  jsonb,
  type PgSchema,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  CREDIT_LEDGER_SOURCES,
  CREDIT_LEDGER_TYPES,
  CREDIT_RESERVATION_STATUSES,
  type CreditLedgerSource,
  type CreditLedgerType,
  type CreditPlanKey,
  type CreditReservationStatus,
} from "@/lib/credits";
import type { CreditLedgerMetadata } from "@/lib/credits";
import type { createFileTables } from "./files";
import type { createProjectTables } from "./projects";

function buildSqlStringList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(","));
}

export const createCreditTables = (
  fw: PgSchema,
  tables: {
    fileVersions: ReturnType<typeof createFileTables>["fileVersions"];
    files: ReturnType<typeof createFileTables>["files"];
    projects: ReturnType<typeof createProjectTables>["projects"];
  },
) => {
  const creditAccounts = fw.table(
    "credit_accounts",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      scopeType: varchar("scope_type", { length: 32 }).notNull().default("personal"),
      scopeId: varchar("scope_id", { length: 255 }).notNull(),
      ownerId: varchar("owner_id", { length: 255 }).notNull(),
      planKey: varchar("plan_key", { length: 32 })
        .$type<CreditPlanKey>()
        .notNull(),
      availableCredits: integer("available_credits").notNull().default(0),
      availablePurchasedCredits: integer("available_purchased_credits")
        .notNull()
        .default(0),
      currentMonthlyCredits: integer("current_monthly_credits")
        .notNull()
        .default(0),
      currentUsedCredits: integer("current_used_credits").notNull().default(0),
      lifetimePurchasedCredits: integer("lifetime_purchased_credits")
        .notNull()
        .default(0),
      lifetimeGrantedCredits: integer("lifetime_granted_credits")
        .notNull()
        .default(0),
      lifetimeUsedCredits: integer("lifetime_used_credits")
        .notNull()
        .default(0),
      lifetimeExpiredCredits: integer("lifetime_expired_credits")
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
      uniqueIndex("credit_accounts_scope_unique_idx").on(
        table.scopeType,
        table.scopeId,
      ),
      index("credit_accounts_owner_id_idx").on(table.ownerId),
      index("credit_accounts_plan_key_idx").on(table.planKey),
      check(
        "credit_accounts_scope_type_check",
        sql`${table.scopeType} IN ('personal','workspace')`,
      ),
      check(
        "credit_accounts_plan_key_check",
        sql`${table.planKey} IN ('free','standard','pro','studio','business')`,
      ),
      check(
        "credit_accounts_available_credits_check",
        sql`${table.availableCredits} >= 0`,
      ),
      check(
        "credit_accounts_available_purchased_credits_check",
        sql`${table.availablePurchasedCredits} >= 0`,
      ),
      check(
        "credit_accounts_current_monthly_credits_check",
        sql`${table.currentMonthlyCredits} >= 0`,
      ),
      check(
        "credit_accounts_current_used_credits_check",
        sql`${table.currentUsedCredits} >= 0`,
      ),
      check(
        "credit_accounts_lifetime_purchased_credits_check",
        sql`${table.lifetimePurchasedCredits} >= 0`,
      ),
      check(
        "credit_accounts_lifetime_granted_credits_check",
        sql`${table.lifetimeGrantedCredits} >= 0`,
      ),
      check(
        "credit_accounts_lifetime_used_credits_check",
        sql`${table.lifetimeUsedCredits} >= 0`,
      ),
      check(
        "credit_accounts_lifetime_expired_credits_check",
        sql`${table.lifetimeExpiredCredits} >= 0`,
      ),
    ],
  );

  const creditLedgerEntries = fw.table(
    "credit_ledger_entries",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      accountId: uuid("account_id")
        .notNull()
        .references(() => creditAccounts.id, { onDelete: "cascade" }),
      scopeType: varchar("scope_type", { length: 32 }).notNull().default("personal"),
      scopeId: varchar("scope_id", { length: 255 }).notNull(),
      ownerId: varchar("owner_id", { length: 255 }).notNull(),
      actorUserId: varchar("actor_user_id", { length: 255 }).notNull(),
      type: varchar("type", { length: 40 })
        .$type<CreditLedgerType>()
        .notNull(),
      source: varchar("source", { length: 40 })
        .$type<CreditLedgerSource>()
        .notNull(),
      featureKey: varchar("feature_key", { length: 80 }),
      descriptionKey: varchar("description_key", { length: 160 }),
      credits: integer("credits").notNull(),
      remainingCredits: integer("remaining_credits"),
      isExpired: boolean("is_expired").notNull().default(false),
      balanceBefore: integer("balance_before"),
      balanceAfter: integer("balance_after").notNull(),
      projectId: uuid("project_id").references(() => tables.projects.id, {
        onDelete: "set null",
      }),
      fileId: uuid("file_id").references(() => tables.files.id, {
        onDelete: "set null",
      }),
      versionId: uuid("version_id").references(() => tables.fileVersions.id, {
        onDelete: "set null",
      }),
      idempotencyKey: varchar("idempotency_key", { length: 255 }),
      metadata: jsonb("metadata").$type<CreditLedgerMetadata>(),
      expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("credit_ledger_entries_idempotency_unique_idx").on(
        table.idempotencyKey,
      ),
      index("credit_ledger_entries_account_created_at_idx").on(
        table.accountId,
        table.createdAt,
      ),
      index("credit_ledger_entries_scope_created_at_idx").on(
        table.scopeType,
        table.scopeId,
        table.createdAt,
      ),
      index("credit_ledger_entries_owner_created_at_idx").on(
        table.ownerId,
        table.createdAt,
      ),
      index("credit_ledger_entries_type_idx").on(table.type),
      index("credit_ledger_entries_source_idx").on(table.source),
      index("credit_ledger_entries_project_id_idx").on(table.projectId),
      index("credit_ledger_entries_file_id_idx").on(table.fileId),
      index("credit_ledger_entries_version_id_idx").on(table.versionId),
      check(
        "credit_ledger_entries_scope_type_check",
        sql`${table.scopeType} IN ('personal','workspace')`,
      ),
      check(
        "credit_ledger_entries_type_check",
        sql`${table.type} IN (${buildSqlStringList(CREDIT_LEDGER_TYPES)})`,
      ),
      check(
        "credit_ledger_entries_source_check",
        sql`${table.source} IN (${buildSqlStringList(CREDIT_LEDGER_SOURCES)})`,
      ),
      check(
        "credit_ledger_entries_balance_after_check",
        sql`${table.balanceAfter} >= 0`,
      ),
      check(
        "credit_ledger_entries_credit_value_check",
        sql`${table.credits} <> 0 OR ${table.type} = 'reservation_capture'`,
      ),
    ],
  );

  const creditReservations = fw.table(
    "credit_reservations",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      accountId: uuid("account_id")
        .notNull()
        .references(() => creditAccounts.id, { onDelete: "cascade" }),
      scopeType: varchar("scope_type", { length: 32 }).notNull().default("personal"),
      scopeId: varchar("scope_id", { length: 255 }).notNull(),
      ownerId: varchar("owner_id", { length: 255 }).notNull(),
      actorUserId: varchar("actor_user_id", { length: 255 }).notNull(),
      credits: integer("credits").notNull(),
      status: varchar("status", { length: 32 })
        .$type<CreditReservationStatus>()
        .notNull()
        .default(CREDIT_RESERVATION_STATUSES[0]),
      featureKey: varchar("feature_key", { length: 80 }).notNull(),
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
      metadata: jsonb("metadata").$type<CreditLedgerMetadata>(),
      expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true })
        .notNull(),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("credit_reservations_idempotency_unique_idx").on(
        table.idempotencyKey,
      ),
      index("credit_reservations_account_status_idx").on(
        table.accountId,
        table.status,
      ),
      index("credit_reservations_scope_status_idx").on(
        table.scopeType,
        table.scopeId,
        table.status,
      ),
      index("credit_reservations_owner_status_idx").on(
        table.ownerId,
        table.status,
      ),
      check(
        "credit_reservations_scope_type_check",
        sql`${table.scopeType} IN ('personal','workspace')`,
      ),
      check(
        "credit_reservations_status_check",
        sql`${table.status} IN (${buildSqlStringList(CREDIT_RESERVATION_STATUSES)})`,
      ),
      check(
        "credit_reservations_credits_check",
        sql`${table.credits} > 0`,
      ),
    ],
  );

  return {
    creditAccounts,
    creditLedgerEntries,
    creditReservations,
  };
};

export type CreditAccountRecord = InferSelectModel<
  ReturnType<typeof createCreditTables>["creditAccounts"]
>;

export type NewCreditAccountRecord = InferInsertModel<
  ReturnType<typeof createCreditTables>["creditAccounts"]
>;

export type CreditLedgerEntryRecord = InferSelectModel<
  ReturnType<typeof createCreditTables>["creditLedgerEntries"]
>;

export type NewCreditLedgerEntryRecord = InferInsertModel<
  ReturnType<typeof createCreditTables>["creditLedgerEntries"]
>;

export type CreditReservationRecord = InferSelectModel<
  ReturnType<typeof createCreditTables>["creditReservations"]
>;

export type NewCreditReservationRecord = InferInsertModel<
  ReturnType<typeof createCreditTables>["creditReservations"]
>;
