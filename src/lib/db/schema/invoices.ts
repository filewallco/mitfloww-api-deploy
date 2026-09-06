import { boolean, text, timestamp, uuid, varchar, type PgSchema } from "drizzle-orm/pg-core";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { createUserTables } from "./users";

export const createInvoiceTables = (
  schema: PgSchema,
  tables: {
    users: ReturnType<typeof createUserTables>["users"];
  },
) => {
  const invoiceSettings = schema.table("invoice_settings", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .unique()
      .references(() => tables.users.id, { onDelete: "cascade" }),
    templateId: varchar("template_id", { length: 64 }).notNull().default("modern"),
    logoAlignment: varchar("logo_alignment", { length: 16 }).notNull().default("left"),
    nameAlignment: varchar("name_alignment", { length: 16 }).notNull().default("left"),
    accentColor: varchar("accent_color", { length: 32 }).notNull().default("primary"),
    showLogo: boolean("show_logo").notNull().default(true),
    showTaxNumber: boolean("show_tax_number").notNull().default(false),
    taxNumber: varchar("tax_number", { length: 50 }),
    showNotes: boolean("show_notes").notNull().default(true),
    notes: text("notes"),
    terms: text("terms"),
    paperSize: varchar("paper_size", { length: 16 }).notNull().default("a4"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  });

  return { invoiceSettings };
};

export type InvoiceSettingsRecord = InferSelectModel<
  ReturnType<typeof createInvoiceTables>["invoiceSettings"]
>;

export type NewInvoiceSettingsRecord = InferInsertModel<
  ReturnType<typeof createInvoiceTables>["invoiceSettings"]
>;
