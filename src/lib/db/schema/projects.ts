import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  text,
  type PgSchema,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { DEFAULT_PROJECT_CURRENCY } from "@/lib/constants/currencies";
import {
  fromProjectPaymentStatusDbValue,
  ProjectPaymentStatus,
  PROJECT_SHARE_STATUSES,
  PROJECT_STATUSES,
  type ProjectShareStatus as ProjectShareStatusType,
  ProjectStatus,
  type ProjectPaymentStatus as ProjectPaymentStatusType,
  type ProjectStatus as ProjectStatusType,
  toProjectPaymentStatusDbValue,
} from "@/lib/dto/projects";

const projectPaymentStatus = customType<{
  data: ProjectPaymentStatusType;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toProjectPaymentStatusDbValue(value);
  },
  fromDriver(value) {
    return fromProjectPaymentStatusDbValue(value);
  },
});

// Keep the default in driver format so drizzle-kit can diff the schema correctly.
const DEFAULT_PROJECT_PAYMENT_STATUS =
  toProjectPaymentStatusDbValue(ProjectPaymentStatus.Pending) as
    unknown as ProjectPaymentStatusType;

function buildSqlStringList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(","));
}

export const createProjectTables = (fw: PgSchema) => {
  const projects = fw.table(
    "projects",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      publicId: varchar("public_id", { length: 255 }).notNull(),
      title: varchar("title", { length: 80 }).notNull(),
      titleSourceLocale: varchar("title_source_locale", { length: 16 })
        .notNull()
        .default("und"),
      clientName: varchar("client_name", { length: 60 })
        .notNull()
        .default("New client"),
      clientNameSourceLocale: varchar("client_name_source_locale", {
        length: 16,
      })
        .notNull()
        .default("und"),
      clientEmail: varchar("client_email", { length: 255 }),
      status: varchar("status", { length: 32 })
        .$type<ProjectStatusType>()
        .notNull()
        .default(ProjectStatus.Active),
      shareStatus: varchar("share_status", { length: 32 }).$type<
        ProjectShareStatusType
      >(),
      shareToken: varchar("share_token", { length: 255 }),
      shareUrl: varchar("share_url", { length: 1024 }),
      shareExpiresAt: timestamp("share_expires_at", {
        mode: "date",
        withTimezone: true,
      }),
      sharePasswordCiphertext: varchar("share_password_ciphertext", {
        length: 1024,
      }),
      sharePasswordHash: varchar("share_password_hash", { length: 255 }),
      shareFailedAttempts: integer("share_failed_attempts")
        .notNull()
        .default(0),
      shareLockedUntil: timestamp("share_locked_until", {
        mode: "date",
        withTimezone: true,
      }),
      shareClientEmail: varchar("share_client_email", { length: 255 }),
      shareEmailAdded: boolean("share_email_added").notNull().default(false),
      currency: varchar("currency", { length: 3 })
        .notNull()
        .default(DEFAULT_PROJECT_CURRENCY),
      amountCents: integer("amount_cents").notNull(),
      paymentStatus: projectPaymentStatus("payment_status")
        .notNull()
        .default(DEFAULT_PROJECT_PAYMENT_STATUS),
      clientPaymentCompletedAt: timestamp("client_payment_completed_at", {
        mode: "date",
        withTimezone: true,
      }),
      clientPaymentReference: varchar("client_payment_reference", {
        length: 64,
      }),
      advancePaymentEnabled: boolean("advance_payment_enabled")
        .notNull()
        .default(false),
      advanceAmountCents: integer("advance_amount_cents")
        .notNull()
        .default(0),
      advancePaymentStatus: projectPaymentStatus("advance_payment_status")
        .notNull()
        .default(DEFAULT_PROJECT_PAYMENT_STATUS),
      advancePaymentCompletedAt: timestamp("advance_payment_completed_at", {
        mode: "date",
        withTimezone: true,
      }),
      revisionLimit: integer("revision_limit").notNull().default(0),
      extraRevisionCostCents: integer("extra_revision_cost_cents")
        .notNull()
        .default(0),
      watermarkEnabled: boolean("watermark_enabled").notNull().default(true),
      deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      index("projects_status_updated_at_idx").on(table.status, table.updatedAt),
      index("projects_deleted_at_idx").on(table.deletedAt),
      index("projects_updated_at_idx").on(table.updatedAt),
      uniqueIndex("projects_public_id_unique_idx").on(table.publicId),
      uniqueIndex("projects_share_token_unique_idx").on(table.shareToken),
      check(
        "projects_status_check",
        sql`${table.status} IN (${buildSqlStringList(PROJECT_STATUSES)})`,
      ),
      check(
        "projects_share_status_check",
        sql`${table.shareStatus} IS NULL OR ${table.shareStatus} IN (${buildSqlStringList(PROJECT_SHARE_STATUSES)})`,
      ),
      check(
        "projects_currency_format_check",
        sql`${table.currency} ~ '^[A-Z]{3}$'`,
      ),
      check(
        "projects_amount_cents_check",
        sql`${table.amountCents} >= 0`,
      ),
      check(
        "projects_advance_amount_cents_check",
        sql`${table.advanceAmountCents} >= 0`,
      ),
      check(
        "projects_payment_status_check",
        sql`${table.paymentStatus} >= 0 AND ${table.paymentStatus} <= 1`,
      ),
      check(
        "projects_advance_payment_status_check",
        sql`${table.advancePaymentStatus} >= 0 AND ${table.advancePaymentStatus} <= 1`,
      ),
      check(
        "projects_revision_limit_check",
        sql`${table.revisionLimit} >= 0`,
      ),
      check(
        "projects_extra_revision_cost_cents_check",
        sql`${table.extraRevisionCostCents} >= 0`,
      ),
      check(
        "projects_share_failed_attempts_check",
        sql`${table.shareFailedAttempts} >= 0`,
      ),
    ],
  );

  const projectClientReviews = fw.table(
    "project_client_reviews",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      projectId: uuid("project_id")
        .notNull()
        .references(() => projects.id, {
          onDelete: "cascade",
          onUpdate: "cascade",
        }),
      rating: integer("rating").notNull(),
      reviewText: text("review_text").notNull(),
      sourceLocale: varchar("source_locale", { length: 16 })
        .notNull()
        .default("und"),
      submittedAt: timestamp("submitted_at", {
        mode: "date",
        withTimezone: true,
      })
        .notNull()
        .defaultNow(),
      createdAt: timestamp("created_at", {
        mode: "date",
        withTimezone: true,
      })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", {
        mode: "date",
        withTimezone: true,
      })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("project_client_reviews_project_id_unique_idx").on(
        table.projectId,
      ),
      index("project_client_reviews_submitted_at_idx").on(table.submittedAt),
      check(
        "project_client_reviews_rating_check",
        sql`${table.rating} >= 1 AND ${table.rating} <= 5`,
      ),
    ],
  );

  return { projectClientReviews, projects };
};

export type ProjectRecord = InferSelectModel<
  ReturnType<typeof createProjectTables>["projects"]
>;

export type NewProjectRecord = InferInsertModel<
  ReturnType<typeof createProjectTables>["projects"]
>;

export type ProjectClientReviewRecord = InferSelectModel<
  ReturnType<typeof createProjectTables>["projectClientReviews"]
>;

export type NewProjectClientReviewRecord = InferInsertModel<
  ReturnType<typeof createProjectTables>["projectClientReviews"]
>;
