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
  fromProjectPaymentSnapshotStatusDbValue,
  fromProjectPaymentSnapshotTypeDbValue,
  fromProjectPaymentStatusDbValue,
  fromProjectShareStatusDbValue,
  fromProjectStatusDbValue,
  PROJECT_PAYMENT_SNAPSHOT_STATUSES,
  PROJECT_PAYMENT_SNAPSHOT_TYPES,
  PROJECT_SHARE_STATUSES,
  PROJECT_STATUSES,
  ProjectPaymentSnapshotStatus,
  ProjectPaymentSnapshotType,
  ProjectPaymentStatus,
  ProjectShareStatus,
  ProjectStatus,
  toProjectPaymentSnapshotStatusDbValue,
  toProjectPaymentSnapshotTypeDbValue,
  toProjectPaymentStatusDbValue,
  toProjectShareStatusDbValue,
  toProjectStatusDbValue,
  type ProjectPaymentSnapshotStatus as ProjectPaymentSnapshotStatusType,
  type ProjectPaymentSnapshotType as ProjectPaymentSnapshotTypeType,
  type ProjectPaymentStatus as ProjectPaymentStatusType,
  type ProjectShareStatus as ProjectShareStatusType,
  type ProjectStatus as ProjectStatusType,
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

const projectStatus = customType<{
  data: ProjectStatusType;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toProjectStatusDbValue(value);
  },
  fromDriver(value) {
    return fromProjectStatusDbValue(value);
  },
});

const projectShareStatus = customType<{
  data: ProjectShareStatusType;
  driverData: number;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toProjectShareStatusDbValue(value) as number;
  },
  fromDriver(value) {
    return fromProjectShareStatusDbValue(value) as ProjectShareStatusType;
  },
});

const projectPaymentSnapshotType = customType<{
  data: ProjectPaymentSnapshotTypeType;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toProjectPaymentSnapshotTypeDbValue(value);
  },
  fromDriver(value) {
    return fromProjectPaymentSnapshotTypeDbValue(value);
  },
});

const projectPaymentSnapshotStatus = customType<{
  data: ProjectPaymentSnapshotStatusType;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toProjectPaymentSnapshotStatusDbValue(value);
  },
  fromDriver(value) {
    return fromProjectPaymentSnapshotStatusDbValue(value);
  },
});

const DEFAULT_PROJECT_PAYMENT_STATUS =
  toProjectPaymentStatusDbValue(ProjectPaymentStatus.Pending) as unknown as ProjectPaymentStatusType;

const DEFAULT_PROJECT_STATUS =
  toProjectStatusDbValue(ProjectStatus.Active) as unknown as ProjectStatusType;

const DEFAULT_PROJECT_PAYMENT_SNAPSHOT_TYPE =
  toProjectPaymentSnapshotTypeDbValue(ProjectPaymentSnapshotType.Final) as unknown as ProjectPaymentSnapshotTypeType;

const DEFAULT_PROJECT_PAYMENT_SNAPSHOT_STATUS =
  toProjectPaymentSnapshotStatusDbValue(ProjectPaymentSnapshotStatus.Pending) as unknown as ProjectPaymentSnapshotStatusType;

function buildSqlStringList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(","));
}

export const createProjectTables = (fw: PgSchema) => {
  const projects = fw.table(
    "projects",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      publicId: varchar("public_id", { length: 255 }).notNull(),
      userId: varchar("user_id", { length: 255 }).notNull().default("default-owner"),
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
      status: projectStatus("status")
        .notNull()
        .default(DEFAULT_PROJECT_STATUS),
      shareStatus: projectShareStatus("share_status"),
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
      invoiceId: varchar("invoice_id", {
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
      index("projects_user_id_idx").on(table.userId),
      index("projects_status_updated_at_idx").on(table.status, table.updatedAt),
      index("projects_deleted_at_idx").on(table.deletedAt),
      index("projects_updated_at_idx").on(table.updatedAt),
      uniqueIndex("projects_public_id_unique_idx").on(table.publicId),
      uniqueIndex("projects_share_token_unique_idx").on(table.shareToken),
      uniqueIndex("projects_client_payment_reference_unique_idx").on(table.clientPaymentReference),
      uniqueIndex("projects_invoice_id_unique_idx").on(table.invoiceId),
      check(
        "projects_status_check",
        sql`${table.status} >= 0 AND ${table.status} <= 1`,
      ),
      check(
        "projects_share_status_check",
        sql`${table.shareStatus} IS NULL OR (${table.shareStatus} >= 0 AND ${table.shareStatus} <= 4)`,
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

  const projectPaymentSnapshots = fw.table(
    "project_payment_snapshots",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      projectId: uuid("project_id")
        .notNull()
        .references(() => projects.id, {
          onDelete: "cascade",
          onUpdate: "cascade",
        }),
      paymentType: projectPaymentSnapshotType("payment_type")
        .notNull()
        .default(DEFAULT_PROJECT_PAYMENT_SNAPSHOT_TYPE),
      status: projectPaymentSnapshotStatus("status")
        .notNull()
        .default(DEFAULT_PROJECT_PAYMENT_SNAPSHOT_STATUS),
      amountCents: integer("amount_cents").notNull(),
      currency: varchar("currency", { length: 3 })
        .notNull()
        .default("INR"),
      includedVersionIds: text("included_version_ids").notNull(),
      clientPaymentReference: varchar("client_payment_reference", {
        length: 64,
      }),
      paidAt: timestamp("paid_at", {
        mode: "date",
        withTimezone: true,
      }),
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
      index("project_payment_snapshots_project_id_idx").on(table.projectId),
      index("project_payment_snapshots_status_idx").on(table.status),
      check(
        "project_payment_snapshots_payment_type_check",
        sql`${table.paymentType} >= 0 AND ${table.paymentType} <= 3`,
      ),
      check(
        "project_payment_snapshots_status_check",
        sql`${table.status} >= 0 AND ${table.status} <= 3`,
      ),
    ],
  );

  const projectUnlockedFileVersions = fw.table(
    "project_unlocked_file_versions",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      projectId: uuid("project_id")
        .notNull()
        .references(() => projects.id, {
          onDelete: "cascade",
          onUpdate: "cascade",
        }),
      fileId: uuid("file_id").notNull(),
      fileVersionId: uuid("file_version_id").notNull(),
      paymentSnapshotId: uuid("payment_snapshot_id")
        .references(() => projectPaymentSnapshots.id, {
          onDelete: "set null",
          onUpdate: "cascade",
        }),
      unlockedAt: timestamp("unlocked_at", {
        mode: "date",
        withTimezone: true,
      })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("project_unlocked_file_versions_version_unique_idx").on(
        table.projectId,
        table.fileVersionId,
      ),
      index("project_unlocked_file_versions_file_id_idx").on(table.fileId),
    ],
  );

  return { projectClientReviews, projects, projectPaymentSnapshots, projectUnlockedFileVersions };
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

export type ProjectPaymentSnapshotRecord = InferSelectModel<
  ReturnType<typeof createProjectTables>["projectPaymentSnapshots"]
>;

export type NewProjectPaymentSnapshotRecord = InferInsertModel<
  ReturnType<typeof createProjectTables>["projectPaymentSnapshots"]
>;

export type ProjectUnlockedFileVersionRecord = InferSelectModel<
  ReturnType<typeof createProjectTables>["projectUnlockedFileVersions"]
>;

export type NewProjectUnlockedFileVersionRecord = InferInsertModel<
  ReturnType<typeof createProjectTables>["projectUnlockedFileVersions"]
>;
