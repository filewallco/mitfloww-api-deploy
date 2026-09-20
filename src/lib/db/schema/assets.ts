import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type PgSchema,
} from "drizzle-orm/pg-core";
import { DEFAULT_PROJECT_CURRENCY } from "@/lib/constants/currencies";

export const ASSET_STATUSES = ["active", "deactivated"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_TEMPLATES = [
  "minimal-modern",
  "neon-cyber",
  "clean-studio",
  "bold-editorial",
] as const;
export type AssetTemplateKey = (typeof ASSET_TEMPLATES)[number];

function buildSqlStringList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(","));
}

export const createAssetTables = (fw: PgSchema) => {
  const assets = fw.table(
    "assets",
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
        .$type<AssetTemplateKey>()
        .notNull()
        .default("minimal-modern"),
      status: varchar("status", { length: 32 })
        .$type<AssetStatus>()
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
      uniqueIndex("assets_share_token_unique_idx").on(table.shareToken),
      index("assets_user_id_idx").on(table.userId),
      index("assets_status_idx").on(table.status),
      index("assets_deleted_at_idx").on(table.deletedAt),
      index("assets_updated_at_idx").on(table.updatedAt),
      check(
        "assets_status_check",
        sql`${table.status} IN (${buildSqlStringList(ASSET_STATUSES)})`,
      ),
      check("assets_amount_cents_check", sql`${table.amountCents} > 0`),
    ],
  );

  const assetPreviewFiles = fw.table(
    "asset_preview_files",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      assetId: uuid("asset_id")
        .notNull()
        .references(() => assets.id, { onDelete: "cascade" }),
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
      index("asset_preview_files_asset_id_idx").on(table.assetId),
      index("asset_preview_files_deleted_at_idx").on(table.deletedAt),
    ],
  );

  const assetFiles = fw.table(
    "asset_files",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      assetId: uuid("asset_id")
        .notNull()
        .references(() => assets.id, { onDelete: "cascade" }),
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
      index("asset_files_asset_id_idx").on(table.assetId),
      index("asset_files_deleted_at_idx").on(table.deletedAt),
      index("asset_files_updated_at_idx").on(table.updatedAt),
    ],
  );

  const assetPurchases = fw.table(
    "asset_purchases",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      assetId: uuid("asset_id")
        .notNull()
        .references(() => assets.id, { onDelete: "cascade" }),
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
      uniqueIndex("asset_purchases_access_token_unique_idx").on(table.accessToken),
      uniqueIndex("asset_purchases_invoice_number_unique_idx").on(table.invoiceNumber),
      index("asset_purchases_asset_buyer_idx").on(table.assetId, table.buyerEmail),
      index("asset_purchases_buyer_email_idx").on(table.buyerEmail),
      index("asset_purchases_expires_at_idx").on(table.expiresAt),
    ],
  );

  return {
    assets,
    assetPreviewFiles,
    assetFiles,
    assetPurchases,
  };
};

export type AssetRecord = InferSelectModel<
  ReturnType<typeof createAssetTables>["assets"]
>;
export type NewAssetRecord = InferInsertModel<
  ReturnType<typeof createAssetTables>["assets"]
>;

export type AssetPreviewFileRecord = InferSelectModel<
  ReturnType<typeof createAssetTables>["assetPreviewFiles"]
>;
export type NewAssetPreviewFileRecord = InferInsertModel<
  ReturnType<typeof createAssetTables>["assetPreviewFiles"]
>;

export type AssetFileRecord = InferSelectModel<
  ReturnType<typeof createAssetTables>["assetFiles"]
>;
export type NewAssetFileRecord = InferInsertModel<
  ReturnType<typeof createAssetTables>["assetFiles"]
>;

export type AssetPurchaseRecord = InferSelectModel<
  ReturnType<typeof createAssetTables>["assetPurchases"]
>;
export type NewAssetPurchaseRecord = InferInsertModel<
  ReturnType<typeof createAssetTables>["assetPurchases"]
>;