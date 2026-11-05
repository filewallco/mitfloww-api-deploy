import { sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  type PgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { createUserTables } from "./users";

export const PAYMENT_TRANSACTION_STATUSES = [
  "pending",
  "created",
  "authorized",
  "captured",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
] as const;

export type PaymentTransactionStatus =
  (typeof PAYMENT_TRANSACTION_STATUSES)[number];

export const PAYMENT_WEBHOOK_STATUSES = [
  "received",
  "processing",
  "processed",
  "failed",
] as const;

export type PaymentWebhookStatus =
  (typeof PAYMENT_WEBHOOK_STATUSES)[number];

export const PAYMENT_OUTBOX_STATUSES = [
  "pending",
  "processing",
  "delivered",
  "dead_letter",
] as const;

export type PaymentOutboxStatus =
  (typeof PAYMENT_OUTBOX_STATUSES)[number];

export const PAYMENT_REFUND_STATUSES = [
  "pending",
  "processed",
  "failed",
] as const;

export type PaymentRefundStatus =
  (typeof PAYMENT_REFUND_STATUSES)[number];

export function createPaymentTables(
  fw: PgSchema,
  deps: {
    users: ReturnType<typeof createUserTables>["users"];
  },
) {
  const paymentTransactions = fw.table(
    "payment_transactions",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
      provider: varchar("provider", { length: 64 }).notNull().default("razorpay"),
      orderId: varchar("order_id", { length: 255 }),
      paymentId: varchar("payment_id", { length: 255 }),
      status: varchar("status", { length: 32 })
        .$type<PaymentTransactionStatus>()
        .notNull()
        .default("pending"),
      currency: varchar("currency", { length: 3 }).notNull().default("INR"),
      originalAmount: bigint("original_amount", { mode: "number" }).notNull(),
      feePercentage: numeric("fee_percentage", { precision: 6, scale: 4 })
        .notNull()
        .default("0.0000"),
      fixedFee: bigint("fixed_fee", { mode: "number" }).notNull().default(0),
      taxRate: numeric("tax_rate", { precision: 6, scale: 4 })
        .notNull()
        .default("0.0000"),
      feeAmount: bigint("fee_amount", { mode: "number" }).notNull().default(0),
      taxAmount: bigint("tax_amount", { mode: "number" }).notNull().default(0),
      totalPayable: bigint("total_payable", { mode: "number" }).notNull(),
      amount: bigint("amount", { mode: "number" }).notNull(),
      amountRefunded: bigint("amount_refunded", { mode: "number" })
        .notNull()
        .default(0),
      feeAbsorbedByMerchant: boolean("fee_absorbed_by_merchant")
        .notNull()
        .default(false),
      feeConfigVersion: varchar("fee_config_version", { length: 32 })
        .notNull()
        .default("v1"),
      referenceType: varchar("reference_type", { length: 64 }).notNull(),
      referenceId: varchar("reference_id", { length: 255 }).notNull(),
      userId: varchar("user_id", { length: 255 }).references(
        () => deps.users.id,
        { onDelete: "set null" },
      ),
      customerName: varchar("customer_name", { length: 120 }),
      customerEmail: varchar("customer_email", { length: 255 }),
      customerContact: varchar("customer_contact", { length: 32 }),
      receipt: varchar("receipt", { length: 255 }),
      failureCode: varchar("failure_code", { length: 80 }),
      failureReason: text("failure_reason"),
      metadata: jsonb("metadata").notNull().default({}),
      entitlementGranted: boolean("entitlement_granted")
        .notNull()
        .default(false),
      entitlementGrantedAt: timestamp("entitlement_granted_at", {
        mode: "date",
        withTimezone: true,
      }),
      capturedAt: timestamp("captured_at", { mode: "date", withTimezone: true }),
      refundedAt: timestamp("refunded_at", { mode: "date", withTimezone: true }),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("payment_transactions_idempotency_key_unique_idx").on(
        table.idempotencyKey,
      ),
      uniqueIndex("payment_transactions_provider_order_id_unique_idx").on(
        table.provider,
        table.orderId,
      ),
      uniqueIndex("payment_transactions_provider_payment_id_unique_idx").on(
        table.provider,
        table.paymentId,
      ),
      index("payment_transactions_status_idx").on(table.status),
      index("payment_transactions_provider_idx").on(table.provider),
      index("payment_transactions_reference_idx").on(
        table.referenceType,
        table.referenceId,
      ),
      index("payment_transactions_user_id_idx").on(table.userId),
      index("payment_transactions_created_at_idx").on(table.createdAt),
      index("payment_transactions_updated_at_idx").on(table.updatedAt),
      check(
        "payment_transactions_original_amount_check",
        sql`${table.originalAmount} >= 0`,
      ),
      check("payment_transactions_amount_check", sql`${table.amount} >= 0`),
      check(
        "payment_transactions_amount_refunded_check",
        sql`${table.amountRefunded} >= 0`,
      ),
      check(
        "payment_transactions_currency_check",
        sql`${table.currency} ~ '^[A-Z]{3}$'`,
      ),
      check(
        "payment_transactions_reference_type_check",
        sql`${table.referenceType} <> ''`,
      ),
      check(
        "payment_transactions_reference_id_check",
        sql`${table.referenceId} <> ''`,
      ),
      check(
        "payment_transactions_idempotency_key_check",
        sql`${table.idempotencyKey} <> ''`,
      ),
      check(
        "payment_transactions_status_check",
        sql`${table.status} IN ('pending', 'created', 'authorized', 'captured', 'failed', 'cancelled', 'refunded', 'partially_refunded')`,
      ),
    ],
  );

  const paymentRefunds = fw.table(
    "payment_refunds",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      paymentTransactionId: uuid("payment_transaction_id")
        .notNull()
        .references(() => paymentTransactions.id, { onDelete: "cascade" }),
      provider: varchar("provider", { length: 64 }).notNull(),
      providerRefundId: varchar("provider_refund_id", { length: 255 }).notNull(),
      amount: bigint("amount", { mode: "number" }).notNull(),
      currency: varchar("currency", { length: 3 }).notNull().default("INR"),
      status: varchar("status", { length: 32 })
        .$type<PaymentRefundStatus>()
        .notNull()
        .default("pending"),
      reason: text("reason"),
      idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
      metadata: jsonb("metadata").notNull().default({}),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("payment_refunds_provider_refund_id_unique_idx").on(
        table.provider,
        table.providerRefundId,
      ),
      uniqueIndex("payment_refunds_tx_idempotency_unique_idx").on(
        table.paymentTransactionId,
        table.idempotencyKey,
      ),
      index("payment_refunds_tx_id_idx").on(table.paymentTransactionId),
      index("payment_refunds_status_idx").on(table.status),
      check("payment_refunds_amount_check", sql`${table.amount} > 0`),
      check(
        "payment_refunds_status_check",
        sql`${table.status} IN ('pending', 'processed', 'failed')`,
      ),
    ],
  );

  const paymentWebhookEvents = fw.table(
    "payment_webhook_events",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      provider: varchar("provider", { length: 64 }).notNull(),
      eventId: varchar("event_id", { length: 255 }).notNull(),
      eventType: varchar("event_type", { length: 128 }).notNull(),
      status: varchar("status", { length: 32 })
        .$type<PaymentWebhookStatus>()
        .notNull()
        .default("received"),
      paymentTransactionId: uuid("payment_transaction_id").references(
        () => paymentTransactions.id,
        { onDelete: "set null" },
      ),
      payload: jsonb("payload").notNull().default({}),
      attempts: integer("attempts").notNull().default(0),
      leaseExpiresAt: timestamp("lease_expires_at", {
        mode: "date",
        withTimezone: true,
      }),
      lastError: text("last_error"),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      processedAt: timestamp("processed_at", {
        mode: "date",
        withTimezone: true,
      }),
    },
    (table) => [
      uniqueIndex("payment_webhook_events_provider_event_id_unique_idx").on(
        table.provider,
        table.eventId,
      ),
      index("payment_webhook_events_status_lease_idx").on(
        table.status,
        table.leaseExpiresAt,
      ),
      index("payment_webhook_events_tx_id_idx").on(table.paymentTransactionId),
      check(
        "payment_webhook_events_status_check",
        sql`${table.status} IN ('received', 'processing', 'processed', 'failed')`,
      ),
    ],
  );

  const paymentOutboxEvents = fw.table(
    "payment_outbox_events",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      paymentTransactionId: uuid("payment_transaction_id")
        .notNull()
        .references(() => paymentTransactions.id, { onDelete: "cascade" }),
      eventType: varchar("event_type", { length: 128 }).notNull(),
      payload: jsonb("payload").notNull().default({}),
      status: varchar("status", { length: 32 })
        .$type<PaymentOutboxStatus>()
        .notNull()
        .default("pending"),
      attempts: integer("attempts").notNull().default(0),
      maxAttempts: integer("max_attempts").notNull().default(5),
      nextRetryAt: timestamp("next_retry_at", {
        mode: "date",
        withTimezone: true,
      }),
      leaseExpiresAt: timestamp("lease_expires_at", {
        mode: "date",
        withTimezone: true,
      }),
      lastError: text("last_error"),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      processedAt: timestamp("processed_at", {
        mode: "date",
        withTimezone: true,
      }),
    },
    (table) => [
      index("payment_outbox_events_poll_idx").on(
        table.status,
        table.leaseExpiresAt,
        table.nextRetryAt,
      ),
      index("payment_outbox_events_tx_id_idx").on(table.paymentTransactionId),
      check(
        "payment_outbox_events_status_check",
        sql`${table.status} IN ('pending', 'processing', 'delivered', 'dead_letter')`,
      ),
    ],
  );

  const paymentAuditLogs = fw.table(
    "payment_audit_logs",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      timestamp: timestamp("timestamp", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      severity: varchar("severity", { length: 16 }).notNull().default("info"),
      operation: varchar("operation", { length: 80 }).notNull(),
      paymentTransactionId: uuid("payment_transaction_id").references(
        () => paymentTransactions.id,
        { onDelete: "set null" },
      ),
      referenceType: varchar("reference_type", { length: 64 }),
      referenceId: varchar("reference_id", { length: 255 }),
      provider: varchar("provider", { length: 64 }),
      providerOrderId: varchar("provider_order_id", { length: 255 }),
      providerPaymentId: varchar("provider_payment_id", { length: 255 }),
      providerRefundId: varchar("provider_refund_id", { length: 255 }),
      idempotencyKey: varchar("idempotency_key", { length: 255 }),
      previousStatus: varchar("previous_status", { length: 32 }),
      newStatus: varchar("new_status", { length: 32 }),
      outcome: varchar("outcome", { length: 32 }).notNull().default("success"),
      errorCode: varchar("error_code", { length: 80 }),
      errorMessage: text("error_message"),
      requestId: varchar("request_id", { length: 255 }),
      correlationId: varchar("correlation_id", { length: 255 }),
      actorId: varchar("actor_id", { length: 255 }),
      data: jsonb("data").notNull().default({}),
    },
    (table) => [
      index("payment_audit_logs_timestamp_idx").on(table.timestamp),
      index("payment_audit_logs_tx_id_idx").on(table.paymentTransactionId),
      index("payment_audit_logs_operation_idx").on(table.operation),
      index("payment_audit_logs_provider_payment_id_idx").on(
        table.providerPaymentId,
      ),
      index("payment_audit_logs_correlation_id_idx").on(table.correlationId),
      check(
        "payment_audit_logs_severity_check",
        sql`${table.severity} IN ('debug', 'info', 'warn', 'error', 'critical')`,
      ),
    ],
  );

  const paymentGatewayConfigs = fw.table(
    "payment_gateway_configs",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      provider: varchar("provider", { length: 32 }).notNull().unique(),
      displayName: varchar("display_name", { length: 64 }).notNull(),
      description: varchar("description", { length: 255 }),
      isEnabled: boolean("is_enabled").notNull().default(true),
      supportedCurrencies: jsonb("supported_currencies")
        .$type<string[]>()
        .notNull()
        .default(["INR"]),
      environment: varchar("environment", { length: 16 })
        .notNull()
        .default("sandbox"),
      feePercentageBasisPoints: integer("fee_percentage_basis_points")
        .notNull()
        .default(230),
      fixedFeeCents: integer("fixed_fee_cents").notNull().default(0),
      taxRateBasisPoints: integer("tax_rate_basis_points")
        .notNull()
        .default(1800),
      feePassingEnabled: boolean("fee_passing_enabled").notNull().default(true),
      isDefault: boolean("is_default").notNull().default(false),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("payment_gateway_configs_provider_idx").on(table.provider),
    ],
  );

  return {
    paymentTransactions,
    paymentRefunds,
    paymentWebhookEvents,
    paymentOutboxEvents,
    paymentAuditLogs,
    paymentGatewayConfigs,
  };
}

export type PaymentTransactionRecord = InferSelectModel<
  ReturnType<typeof createPaymentTables>["paymentTransactions"]
>;
export type NewPaymentTransactionRecord = InferInsertModel<
  ReturnType<typeof createPaymentTables>["paymentTransactions"]
>;

export type PaymentRefundRecord = InferSelectModel<
  ReturnType<typeof createPaymentTables>["paymentRefunds"]
>;
export type NewPaymentRefundRecord = InferInsertModel<
  ReturnType<typeof createPaymentTables>["paymentRefunds"]
>;

export type PaymentWebhookEventRecord = InferSelectModel<
  ReturnType<typeof createPaymentTables>["paymentWebhookEvents"]
>;
export type NewPaymentWebhookEventRecord = InferInsertModel<
  ReturnType<typeof createPaymentTables>["paymentWebhookEvents"]
>;

export type PaymentOutboxEventRecord = InferSelectModel<
  ReturnType<typeof createPaymentTables>["paymentOutboxEvents"]
>;
export type NewPaymentOutboxEventRecord = InferInsertModel<
  ReturnType<typeof createPaymentTables>["paymentOutboxEvents"]
>;

export type PaymentAuditLogRecord = InferSelectModel<
  ReturnType<typeof createPaymentTables>["paymentAuditLogs"]
>;
export type NewPaymentAuditLogRecord = InferInsertModel<
  ReturnType<typeof createPaymentTables>["paymentAuditLogs"]
>;


export type PaymentGatewayConfigRecord = InferSelectModel<
  ReturnType<typeof createPaymentTables>["paymentGatewayConfigs"]
>;
export type NewPaymentGatewayConfigRecord = InferInsertModel<
  ReturnType<typeof createPaymentTables>["paymentGatewayConfigs"]
>;
