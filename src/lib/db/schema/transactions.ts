import { sql } from "drizzle-orm";
import {
  index,
  integer,
  type PgSchema,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { createUserTables } from "./users";
import type { createProjectTables } from "./projects";

export function createTransactionTables(
  fw: PgSchema,
  deps: {
    users: ReturnType<typeof createUserTables>["users"];
    projects: ReturnType<typeof createProjectTables>["projects"];
  },
) {
  const transactions = fw.table(
    "transactions",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      userId: varchar("user_id", { length: 255 })
        .notNull()
        .references(() => deps.users.id, { onDelete: "cascade" }),
      projectId: uuid("project_id")
        .notNull()
        .references(() => deps.projects.id, { onDelete: "cascade" }),
      projectName: varchar("project_name", { length: 255 }).notNull(),
      clientName: varchar("client_name", { length: 255 }).notNull(),
      clientEmail: varchar("client_email", { length: 255 }),
      invoiceNumber: varchar("invoice_number", { length: 64 }).notNull(),
      amountCents: integer("amount_cents").notNull(),
      commissionCents: integer("commission_cents").notNull().default(0),
      netAmountCents: integer("net_amount_cents").notNull(),
      currency: varchar("currency", { length: 3 }).notNull().default("INR"),
      paymentStatus: varchar("payment_status", { length: 32 })
        .notNull()
        .default("paid"),
      paymentType: varchar("payment_type", { length: 32 })
        .notNull()
        .default("full"),
      paymentMethod: varchar("payment_method", { length: 64 })
        .notNull()
        .default("Online"),
      paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" })
        .notNull()
        .defaultNow(),
      createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      index("transactions_user_id_idx").on(table.userId),
      index("transactions_project_id_idx").on(table.projectId),
      uniqueIndex("transactions_invoice_number_unique_idx").on(
        table.invoiceNumber,
      ),
      index("transactions_paid_at_idx").on(table.paidAt),
    ],
  );

  return { transactions };
}

export type TransactionRecord = InferSelectModel<
  ReturnType<typeof createTransactionTables>["transactions"]
>;
export type NewTransactionRecord = InferInsertModel<
  ReturnType<typeof createTransactionTables>["transactions"]
>;
