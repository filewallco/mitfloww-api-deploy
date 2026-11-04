-- Migration 0047: Add payment gateway system (Razorpay, Cashfree, Stripe)
-- Tables: payment_transactions, payment_refunds, payment_webhook_events, payment_outbox_events, payment_audit_logs

CREATE TABLE IF NOT EXISTS "mitfloww"."payment_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "idempotency_key" varchar(255) NOT NULL,
  "provider" varchar(64) NOT NULL DEFAULT 'razorpay',
  "order_id" varchar(255),
  "payment_id" varchar(255),
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "currency" varchar(3) NOT NULL DEFAULT 'INR',
  "original_amount" bigint NOT NULL,
  "fee_percentage" numeric(6, 4) NOT NULL DEFAULT 0.0000,
  "fixed_fee" bigint NOT NULL DEFAULT 0,
  "tax_rate" numeric(6, 4) NOT NULL DEFAULT 0.0000,
  "fee_amount" bigint NOT NULL DEFAULT 0,
  "tax_amount" bigint NOT NULL DEFAULT 0,
  "total_payable" bigint NOT NULL,
  "amount" bigint NOT NULL,
  "amount_refunded" bigint NOT NULL DEFAULT 0,
  "fee_absorbed_by_merchant" boolean NOT NULL DEFAULT false,
  "fee_config_version" varchar(32) NOT NULL DEFAULT 'v1',
  "reference_type" varchar(64) NOT NULL,
  "reference_id" varchar(255) NOT NULL,
  "user_id" varchar(255) REFERENCES "mitfloww"."users"("id") ON DELETE SET NULL,
  "customer_name" varchar(120),
  "customer_email" varchar(255),
  "customer_contact" varchar(32),
  "receipt" varchar(255),
  "failure_code" varchar(80),
  "failure_reason" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "entitlement_granted" boolean NOT NULL DEFAULT false,
  "entitlement_granted_at" timestamp with time zone,
  "captured_at" timestamp with time zone,
  "refunded_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "payment_transactions_original_amount_check" CHECK ("original_amount" >= 0),
  CONSTRAINT "payment_transactions_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "payment_transactions_amount_refunded_check" CHECK ("amount_refunded" >= 0),
  CONSTRAINT "payment_transactions_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "payment_transactions_reference_type_check" CHECK ("reference_type" <> ''),
  CONSTRAINT "payment_transactions_reference_id_check" CHECK ("reference_id" <> ''),
  CONSTRAINT "payment_transactions_idempotency_key_check" CHECK ("idempotency_key" <> ''),
  CONSTRAINT "payment_transactions_status_check" CHECK ("status" IN ('pending', 'created', 'authorized', 'captured', 'failed', 'cancelled', 'refunded', 'partially_refunded'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_transactions_idempotency_key_unique_idx"
  ON "mitfloww"."payment_transactions" ("idempotency_key");

CREATE UNIQUE INDEX IF NOT EXISTS "payment_transactions_provider_order_id_unique_idx"
  ON "mitfloww"."payment_transactions" ("provider", "order_id")
  WHERE "order_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "payment_transactions_provider_payment_id_unique_idx"
  ON "mitfloww"."payment_transactions" ("provider", "payment_id")
  WHERE "payment_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "payment_transactions_status_idx"
  ON "mitfloww"."payment_transactions" ("status");

CREATE INDEX IF NOT EXISTS "payment_transactions_provider_idx"
  ON "mitfloww"."payment_transactions" ("provider");

CREATE INDEX IF NOT EXISTS "payment_transactions_reference_idx"
  ON "mitfloww"."payment_transactions" ("reference_type", "reference_id");

CREATE INDEX IF NOT EXISTS "payment_transactions_user_id_idx"
  ON "mitfloww"."payment_transactions" ("user_id");

CREATE INDEX IF NOT EXISTS "payment_transactions_created_at_idx"
  ON "mitfloww"."payment_transactions" ("created_at");

CREATE INDEX IF NOT EXISTS "payment_transactions_updated_at_idx"
  ON "mitfloww"."payment_transactions" ("updated_at");

-- Refunds table
CREATE TABLE IF NOT EXISTS "mitfloww"."payment_refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "payment_transaction_id" uuid NOT NULL REFERENCES "mitfloww"."payment_transactions"("id") ON DELETE CASCADE,
  "provider" varchar(64) NOT NULL,
  "provider_refund_id" varchar(255) NOT NULL,
  "amount" bigint NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'INR',
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "reason" text,
  "idempotency_key" varchar(255) NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "payment_refunds_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "payment_refunds_status_check" CHECK ("status" IN ('pending', 'processed', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_refunds_provider_refund_id_unique_idx"
  ON "mitfloww"."payment_refunds" ("provider", "provider_refund_id");

CREATE UNIQUE INDEX IF NOT EXISTS "payment_refunds_tx_idempotency_unique_idx"
  ON "mitfloww"."payment_refunds" ("payment_transaction_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "payment_refunds_tx_id_idx"
  ON "mitfloww"."payment_refunds" ("payment_transaction_id");

CREATE INDEX IF NOT EXISTS "payment_refunds_status_idx"
  ON "mitfloww"."payment_refunds" ("status");

-- Webhook events table
CREATE TABLE IF NOT EXISTS "mitfloww"."payment_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" varchar(64) NOT NULL,
  "event_id" varchar(255) NOT NULL,
  "event_type" varchar(128) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'received',
  "payment_transaction_id" uuid REFERENCES "mitfloww"."payment_transactions"("id") ON DELETE SET NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "attempts" integer NOT NULL DEFAULT 0,
  "lease_expires_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "processed_at" timestamp with time zone,
  CONSTRAINT "payment_webhook_events_status_check" CHECK ("status" IN ('received', 'processing', 'processed', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_webhook_events_provider_event_id_unique_idx"
  ON "mitfloww"."payment_webhook_events" ("provider", "event_id");

CREATE INDEX IF NOT EXISTS "payment_webhook_events_status_lease_idx"
  ON "mitfloww"."payment_webhook_events" ("status", "lease_expires_at");

CREATE INDEX IF NOT EXISTS "payment_webhook_events_tx_id_idx"
  ON "mitfloww"."payment_webhook_events" ("payment_transaction_id");

-- Outbox events table
CREATE TABLE IF NOT EXISTS "mitfloww"."payment_outbox_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "payment_transaction_id" uuid NOT NULL REFERENCES "mitfloww"."payment_transactions"("id") ON DELETE CASCADE,
  "event_type" varchar(128) NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 5,
  "next_retry_at" timestamp with time zone,
  "lease_expires_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "processed_at" timestamp with time zone,
  CONSTRAINT "payment_outbox_events_status_check" CHECK ("status" IN ('pending', 'processing', 'delivered', 'dead_letter'))
);

CREATE INDEX IF NOT EXISTS "payment_outbox_events_poll_idx"
  ON "mitfloww"."payment_outbox_events" ("status", "lease_expires_at", "next_retry_at");

CREATE INDEX IF NOT EXISTS "payment_outbox_events_tx_id_idx"
  ON "mitfloww"."payment_outbox_events" ("payment_transaction_id");

-- Audit logs table (immutable financial audit trail)
CREATE TABLE IF NOT EXISTS "mitfloww"."payment_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "timestamp" timestamp with time zone NOT NULL DEFAULT now(),
  "severity" varchar(16) NOT NULL DEFAULT 'info',
  "operation" varchar(80) NOT NULL,
  "payment_transaction_id" uuid REFERENCES "mitfloww"."payment_transactions"("id") ON DELETE SET NULL,
  "reference_type" varchar(64),
  "reference_id" varchar(255),
  "provider" varchar(64),
  "provider_order_id" varchar(255),
  "provider_payment_id" varchar(255),
  "provider_refund_id" varchar(255),
  "idempotency_key" varchar(255),
  "previous_status" varchar(32),
  "new_status" varchar(32),
  "outcome" varchar(32) NOT NULL DEFAULT 'success',
  "error_code" varchar(80),
  "error_message" text,
  "request_id" varchar(255),
  "correlation_id" varchar(255),
  "actor_id" varchar(255),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "payment_audit_logs_severity_check" CHECK ("severity" IN ('debug', 'info', 'warn', 'error', 'critical'))
);

CREATE INDEX IF NOT EXISTS "payment_audit_logs_timestamp_idx"
  ON "mitfloww"."payment_audit_logs" ("timestamp");

CREATE INDEX IF NOT EXISTS "payment_audit_logs_tx_id_idx"
  ON "mitfloww"."payment_audit_logs" ("payment_transaction_id");

CREATE INDEX IF NOT EXISTS "payment_audit_logs_operation_idx"
  ON "mitfloww"."payment_audit_logs" ("operation");

CREATE INDEX IF NOT EXISTS "payment_audit_logs_provider_payment_id_idx"
  ON "mitfloww"."payment_audit_logs" ("provider_payment_id");

CREATE INDEX IF NOT EXISTS "payment_audit_logs_correlation_id_idx"
  ON "mitfloww"."payment_audit_logs" ("correlation_id");

