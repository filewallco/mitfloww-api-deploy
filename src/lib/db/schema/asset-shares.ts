import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type PgSchema,
} from "drizzle-orm/pg-core";
import { DEFAULT_PROJECT_CURRENCY } from "@/lib/constants/currencies";

export const ASSET_SHARE_STATUSES = ["active", "deactivated"] as const;
export type AssetShareStatus = (typeof ASSET_SHARE_STATUSES)[number];

export const ASSET_SHARE_TEMPLATES = [
  "minimal-modern",
  "neon-cyber",
  "clean-studio",
  "bold-editorial",
] as const;
export type AssetShareTemplateKey = (typeof ASSET_SHARE_TEMPLATES)[number];

function buildSqlStringList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(","));
}

export const createAssetShareTables = (fw: PgSchema) => {
  const assetShares = fw.table(
    "asset_shares",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      userId: varchar("user_id", { length: 255 }).notNull(),
      title: varchar("title", { length: 120 }).notNull(),
      description: text("description"),
      amountCents: integer("amount_cents").notNull(),
      currency: varchar("currency", { length: 3 })
        .notNull()
        .default(DEFAULT_PROJECT_CURRENCY),
      templateKey: varchar("template_key", { length: 64 })
        .$type<AssetShareTemplateKey>()
        .notNull()
        .default("minimal-modern"),
      status: varchar("status", { length: 32 })
        .$type<AssetShareStatus>()
        .notNull()
        .default("active"),
      shareToken: varchar("share_token", { length: 255 }).notNull(),
      shareExpiresAt: timestamp("share_expires_at", {
        mode: "date",
        withTimezone: true,
      }),
      deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("asset_shares_share_token_unique_idx").on(table.shareToken),
      index("asset_shares_user_id_idx").on(table.userId),
      index("asset_shares_status_idx").on(table.status),
      index("asset_shares_deleted_at_idx").on(table.deletedAt),
      index("asset_shares_updated_at_idx").on(table.updatedAt),
      check(
        "asset_shares_status_check",
        sql`${table.status} IN (${buildSqlStringList(ASSET_SHARE_STATUSES)})`,
      ),
      check("asset_shares_amount_cents_check", sql`${table.amountCents} > 0`),
    ],
  );

  const assetSharePreviewFiles = fw.table(
    "asset_share_preview_files",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      assetShareId: uuid("asset_share_id")
        .notNull()
        .references(() => assetShares.id, { onDelete: "cascade" }),
      name: varchar("name", { length: 255 }).notNull(),
      mimeType: varchar("mime_type", { length: 120 }).notNull(),
      sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
      storageKey: text("storage_key").notNull(),
      previewUrl: text("preview_url"),
      sortOrder: integer("sort_order").notNull().default(0),
      deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      index("asset_share_preview_files_asset_share_id_idx").on(table.assetShareId),
      index("asset_share_preview_files_deleted_at_idx").on(table.deletedAt),
    ],
  );

  const assetShareFiles = fw.table(
    "asset_share_files",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      assetShareId: uuid("asset_share_id")
        .notNull()
        .references(() => assetShares.id, { onDelete: "cascade" }),
      name: varchar("name", { length: 255 }).notNull(),
      originalName: varchar("original_name", { length: 255 }).notNull(),
      mimeType: varchar("mime_type", { length: 120 }).notNull(),
      extension: varchar("extension", { length: 32 }).notNull(),
      sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
      storageKey: text("storage_key").notNull(),
      deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      index("asset_share_files_asset_share_id_idx").on(table.assetShareId),
      index("asset_share_files_deleted_at_idx").on(table.deletedAt),
      index("asset_share_files_updated_at_idx").on(table.updatedAt),
    ],
  );

  const assetSharePurchases = fw.table(
    "asset_share_purchases",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      assetShareId: uuid("asset_share_id")
        .notNull()
        .references(() => assetShares.id, { onDelete: "cascade" }),
      buyerEmail: varchar("buyer_email", { length: 255 }).notNull(),
      amountCents: integer("amount_cents").notNull(),
      currency: varchar("currency", { length: 3 }).notNull(),
      commissionCents: integer("commission_cents").notNull().default(0),
      netAmountCents: integer("net_amount_cents").notNull().default(0),
      invoiceNumber: varchar("invoice_number", { length: 64 }).notNull(),
      accessToken: varchar("access_token", { length: 255 }).notNull(),
      paidAt: timestamp("paid_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("asset_share_purchases_access_token_unique_idx").on(table.accessToken),
      uniqueIndex("asset_share_purchases_invoice_number_unique_idx").on(table.invoiceNumber),
      index("asset_share_purchases_asset_share_buyer_idx").on(table.assetShareId, table.buyerEmail),
      index("asset_share_purchases_buyer_email_idx").on(table.buyerEmail),
      index("asset_share_purchases_expires_at_idx").on(table.expiresAt),
    ],
  );

  return {
    assetShares,
    assetSharePreviewFiles,
    assetShareFiles,
    assetSharePurchases,
  };
};

export type AssetShareRecord = InferSelectModel<
  ReturnType<typeof createAssetShareTables>["assetShares"]
>;
export type NewAssetShareRecord = InferInsertModel<
  ReturnType<typeof createAssetShareTables>["assetShares"]
>;

export type AssetSharePreviewFileRecord = InferSelectModel<
  ReturnType<typeof createAssetShareTables>["assetSharePreviewFiles"]
>;
export type NewAssetSharePreviewFileRecord = InferInsertModel<
  ReturnType<typeof createAssetShareTables>["assetSharePreviewFiles"]
>;

export type AssetShareFileRecord = InferSelectModel<
  ReturnType<typeof createAssetShareTables>["assetShareFiles"]
>;
export type NewAssetShareFileRecord = InferInsertModel<
  ReturnType<typeof createAssetShareTables>["assetShareFiles"]
>;

export type AssetSharePurchaseRecord = InferSelectModel<
  ReturnType<typeof createAssetShareTables>["assetSharePurchases"]
>;
export type NewAssetSharePurchaseRecord = InferInsertModel<
  ReturnType<typeof createAssetShareTables>["assetSharePurchases"]
>;
