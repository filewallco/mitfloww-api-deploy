import { sql } from "drizzle-orm";
import {
  check,
  customType,
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

export const TRANSACTION_PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "refunded",
] as const;
export type TransactionPaymentStatus = (typeof TRANSACTION_PAYMENT_STATUSES)[number];
export const TransactionPaymentStatus = {
  Pending: TRANSACTION_PAYMENT_STATUSES[0],
  Paid: TRANSACTION_PAYMENT_STATUSES[1],
  Failed: TRANSACTION_PAYMENT_STATUSES[2],
  Refunded: TRANSACTION_PAYMENT_STATUSES[3],
} as const satisfies Record<string, TransactionPaymentStatus>;

export const TRANSACTION_PAYMENT_STATUS_DB_VALUES = [0, 1, 2, 3] as const;
export type TransactionPaymentStatusDbValue = (typeof TRANSACTION_PAYMENT_STATUS_DB_VALUES)[number];
export const TransactionPaymentStatusDb = {
  Pending: 0,
  Paid: 1,
  Failed: 2,
  Refunded: 3,
} as const;

export function toTransactionPaymentStatusDbValue(status: unknown): TransactionPaymentStatusDbValue {
  if (status === TransactionPaymentStatus.Pending || status === 0 || status === "pending") return TransactionPaymentStatusDb.Pending;
  if (status === TransactionPaymentStatus.Paid || status === 1 || status === "paid") return TransactionPaymentStatusDb.Paid;
  if (status === TransactionPaymentStatus.Failed || status === 2 || status === "failed") return TransactionPaymentStatusDb.Failed;
  if (status === TransactionPaymentStatus.Refunded || status === 3 || status === "refunded") return TransactionPaymentStatusDb.Refunded;
  return TransactionPaymentStatusDb.Paid;
}

export function fromTransactionPaymentStatusDbValue(value: unknown): TransactionPaymentStatus {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case TransactionPaymentStatusDb.Pending:
      return TransactionPaymentStatus.Pending;
    case TransactionPaymentStatusDb.Paid:
      return TransactionPaymentStatus.Paid;
    case TransactionPaymentStatusDb.Failed:
      return TransactionPaymentStatus.Failed;
    case TransactionPaymentStatusDb.Refunded:
      return TransactionPaymentStatus.Refunded;
    default:
      return TransactionPaymentStatus.Paid;
  }
}

export const TRANSACTION_PAYMENT_TYPES = [
  "advance",
  "final",
  "full",
  "remaining",
] as const;
export type TransactionPaymentType = (typeof TRANSACTION_PAYMENT_TYPES)[number];
export const TransactionPaymentType = {
  Advance: TRANSACTION_PAYMENT_TYPES[0],
  Final: TRANSACTION_PAYMENT_TYPES[1],
  Full: TRANSACTION_PAYMENT_TYPES[2],
  Remaining: TRANSACTION_PAYMENT_TYPES[3],
} as const satisfies Record<string, TransactionPaymentType>;

export const TRANSACTION_PAYMENT_TYPE_DB_VALUES = [0, 1, 2, 3] as const;
export type TransactionPaymentTypeDbValue = (typeof TRANSACTION_PAYMENT_TYPE_DB_VALUES)[number];
export const TransactionPaymentTypeDb = {
  Advance: 0,
  Final: 1,
  Full: 2,
  Remaining: 3,
} as const;

export function toTransactionPaymentTypeDbValue(type: unknown): TransactionPaymentTypeDbValue {
  if (type === TransactionPaymentType.Advance || type === 0 || type === "advance") return TransactionPaymentTypeDb.Advance;
  if (type === TransactionPaymentType.Final || type === 1 || type === "final") return TransactionPaymentTypeDb.Final;
  if (type === TransactionPaymentType.Full || type === 2 || type === "full") return TransactionPaymentTypeDb.Full;
  if (type === TransactionPaymentType.Remaining || type === 3 || type === "remaining") return TransactionPaymentTypeDb.Remaining;
  return TransactionPaymentTypeDb.Full;
}

export function fromTransactionPaymentTypeDbValue(value: unknown): TransactionPaymentType {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case TransactionPaymentTypeDb.Advance:
      return TransactionPaymentType.Advance;
    case TransactionPaymentTypeDb.Final:
      return TransactionPaymentType.Final;
    case TransactionPaymentTypeDb.Full:
      return TransactionPaymentType.Full;
    case TransactionPaymentTypeDb.Remaining:
      return TransactionPaymentType.Remaining;
    default:
      return TransactionPaymentType.Full;
  }
}

const transactionPaymentStatus = customType<{
  data: TransactionPaymentStatus;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toTransactionPaymentStatusDbValue(value);
  },
  fromDriver(value) {
    return fromTransactionPaymentStatusDbValue(value);
  },
});

const transactionPaymentType = customType<{
  data: TransactionPaymentType;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toTransactionPaymentTypeDbValue(value);
  },
  fromDriver(value) {
    return fromTransactionPaymentTypeDbValue(value);
  },
});

const DEFAULT_TRANSACTION_PAYMENT_STATUS =
  toTransactionPaymentStatusDbValue(TransactionPaymentStatus.Paid) as unknown as TransactionPaymentStatus;

const DEFAULT_TRANSACTION_PAYMENT_TYPE =
  toTransactionPaymentTypeDbValue(TransactionPaymentType.Full) as unknown as TransactionPaymentType;

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
      paymentStatus: transactionPaymentStatus("payment_status")
        .notNull()
        .default(DEFAULT_TRANSACTION_PAYMENT_STATUS),
      paymentType: transactionPaymentType("payment_type")
        .notNull()
        .default(DEFAULT_TRANSACTION_PAYMENT_TYPE),
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
      check(
        "transactions_payment_status_check",
        sql`${table.paymentStatus} >= 0 AND ${table.paymentStatus} <= 3`,
      ),
      check(
        "transactions_payment_type_check",
        sql`${table.paymentType} >= 0 AND ${table.paymentType} <= 3`,
      ),
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
