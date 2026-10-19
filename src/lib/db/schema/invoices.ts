
import { check, customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const INVOICE_PAPER_SIZES = ["a4", "a5", "letter"] as const;
export type InvoicePaperSize = (typeof INVOICE_PAPER_SIZES)[number];
export const InvoicePaperSize = {
  A4: INVOICE_PAPER_SIZES[0],
  A5: INVOICE_PAPER_SIZES[1],
  Letter: INVOICE_PAPER_SIZES[2],
} as const satisfies Record<string, InvoicePaperSize>;
export const INVOICE_PAPER_SIZE_DB_VALUES = [0, 1, 2] as const;
export type InvoicePaperSizeDbValue = (typeof INVOICE_PAPER_SIZE_DB_VALUES)[number];
export const InvoicePaperSizeDb = { A4: 0, A5: 1, Letter: 2 } as const;

export function toInvoicePaperSizeDbValue(size: unknown): InvoicePaperSizeDbValue {
  if (size === InvoicePaperSize.A4 || size === 0 || size === "a4") return InvoicePaperSizeDb.A4;
  if (size === InvoicePaperSize.A5 || size === 1 || size === "a5") return InvoicePaperSizeDb.A5;
  if (size === InvoicePaperSize.Letter || size === 2 || size === "letter") return InvoicePaperSizeDb.Letter;
  return InvoicePaperSizeDb.A4;
}

export function fromInvoicePaperSizeDbValue(value: unknown): InvoicePaperSize {
  if (typeof value === "string" && (INVOICE_PAPER_SIZES as readonly string[]).includes(value)) {
    return value as InvoicePaperSize;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case InvoicePaperSizeDb.A4: return InvoicePaperSize.A4;
    case InvoicePaperSizeDb.A5: return InvoicePaperSize.A5;
    case InvoicePaperSizeDb.Letter: return InvoicePaperSize.Letter;
    default: return InvoicePaperSize.A4;
  }
}

const invoicePaperSize = customType<{
  data: InvoicePaperSize;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() { return "smallint"; },
  toDriver(val) { return toInvoicePaperSizeDbValue(val); },
  fromDriver(val) { return fromInvoicePaperSizeDbValue(val); },
});

const DEFAULT_INVOICE_PAPER_SIZE =
  toInvoicePaperSizeDbValue(InvoicePaperSize.A4) as unknown as InvoicePaperSize;

export const INVOICE_ALIGNMENTS = ["left", "center", "right"] as const;
export type InvoiceAlignment = (typeof INVOICE_ALIGNMENTS)[number];
export const InvoiceAlignment = {
  Left: INVOICE_ALIGNMENTS[0],
  Center: INVOICE_ALIGNMENTS[1],
  Right: INVOICE_ALIGNMENTS[2],
} as const satisfies Record<string, InvoiceAlignment>;
export const INVOICE_ALIGNMENT_DB_VALUES = [0, 1, 2] as const;
export type InvoiceAlignmentDbValue = (typeof INVOICE_ALIGNMENT_DB_VALUES)[number];
export const InvoiceAlignmentDb = { Left: 0, Center: 1, Right: 2 } as const;

export function toInvoiceAlignmentDbValue(align: unknown): InvoiceAlignmentDbValue {
  if (align === InvoiceAlignment.Left || align === 0 || align === "left") return InvoiceAlignmentDb.Left;
  if (align === InvoiceAlignment.Center || align === 1 || align === "center") return InvoiceAlignmentDb.Center;
  if (align === InvoiceAlignment.Right || align === 2 || align === "right") return InvoiceAlignmentDb.Right;
  return InvoiceAlignmentDb.Left;
}

export function fromInvoiceAlignmentDbValue(value: unknown): InvoiceAlignment {
  if (typeof value === "string" && (INVOICE_ALIGNMENTS as readonly string[]).includes(value)) {
    return value as InvoiceAlignment;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case InvoiceAlignmentDb.Left: return InvoiceAlignment.Left;
    case InvoiceAlignmentDb.Center: return InvoiceAlignment.Center;
    case InvoiceAlignmentDb.Right: return InvoiceAlignment.Right;
    default: return InvoiceAlignment.Left;
  }
}

const invoiceAlignment = customType<{
  data: InvoiceAlignment;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() { return "smallint"; },
  toDriver(val) { return toInvoiceAlignmentDbValue(val); },
  fromDriver(val) { return fromInvoiceAlignmentDbValue(val); },
});

const DEFAULT_INVOICE_ALIGNMENT =
  toInvoiceAlignmentDbValue(InvoiceAlignment.Left) as unknown as InvoiceAlignment;

import { boolean, jsonb, text, timestamp, uuid, varchar, type PgSchema } from "drizzle-orm/pg-core";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { createUserTables } from "./users";

export interface CustomInvoiceTemplate {
  id: string;
  name: string;
  elements: string[];
  layoutDirection?: "column" | "row" | null;
  elementOffsets?: string | null;
  elementStyles?: string | null;
  accentColor?: string | null;
  paperSize?: "a4" | "a5" | "letter" | null;
  fontFamily?: string | null;
  fontWeight?: string | null;
  fontStyle?: string | null;
  logoAlignment?: "left" | "center" | "right" | null;
  nameAlignment?: "left" | "center" | "right" | null;
  showLogo?: boolean | null;
  showTaxNumber?: boolean | null;
  taxNumber?: string | null;
  showNotes?: boolean | null;
  notes?: string | null;
  terms?: string | null;
  createdAt: string;
  updatedAt: string;
}

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
    logoAlignment: invoiceAlignment("logo_alignment").notNull().default(DEFAULT_INVOICE_ALIGNMENT),
    nameAlignment: invoiceAlignment("name_alignment").notNull().default(DEFAULT_INVOICE_ALIGNMENT),
    accentColor: varchar("accent_color", { length: 32 }).notNull().default("primary"),
    showLogo: boolean("show_logo").notNull().default(true),
    showTaxNumber: boolean("show_tax_number").notNull().default(false),
    taxNumber: varchar("tax_number", { length: 50 }),
    showNotes: boolean("show_notes").notNull().default(true),
    notes: text("notes"),
    terms: text("terms"),
    paperSize: invoicePaperSize("paper_size").notNull().default(DEFAULT_INVOICE_PAPER_SIZE),
    fontFamily: varchar("font_family", { length: 64 }),
    fontWeight: varchar("font_weight", { length: 32 }),
    fontStyle: varchar("font_style", { length: 32 }),
    customTemplateName: varchar("custom_template_name", { length: 100 }),
    customElements: text("custom_elements").array(),
    customLayoutDirection: varchar("custom_layout_direction", { length: 16 }),
    customElementOffsets: text("custom_element_offsets"),
    customElementStyles: text("custom_element_styles"),
    customTemplates: jsonb("custom_templates").$type<CustomInvoiceTemplate[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  }, (table) => [
    check("invoice_settings_paper_size_check", sql`${table.paperSize} >= 0 AND ${table.paperSize} <= 2`),
    check("invoice_settings_logo_alignment_check", sql`${table.logoAlignment} >= 0 AND ${table.logoAlignment} <= 2`),
    check("invoice_settings_name_alignment_check", sql`${table.nameAlignment} >= 0 AND ${table.nameAlignment} <= 2`),
  ]);

  return { invoiceSettings };
};

export type InvoiceSettingsRecord = InferSelectModel<
  ReturnType<typeof createInvoiceTables>["invoiceSettings"]
>;

export type NewInvoiceSettingsRecord = InferInsertModel<
  ReturnType<typeof createInvoiceTables>["invoiceSettings"]
>;
