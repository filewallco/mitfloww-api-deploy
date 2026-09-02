CREATE TABLE IF NOT EXISTS "mitfloww"."credit_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" varchar(255) NOT NULL,
  "plan_key" varchar(32) DEFAULT 'free' NOT NULL,
  "available_credits" integer DEFAULT 0 NOT NULL,
  "current_monthly_credits" integer DEFAULT 0 NOT NULL,
  "current_used_credits" integer DEFAULT 0 NOT NULL,
  "lifetime_purchased_credits" integer DEFAULT 0 NOT NULL,
  "lifetime_granted_credits" integer DEFAULT 0 NOT NULL,
  "lifetime_used_credits" integer DEFAULT 0 NOT NULL,
  "lifetime_expired_credits" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "credit_accounts_plan_key_check" CHECK (
    "mitfloww"."credit_accounts"."plan_key" IN ('free','standard','pro','studio')
  ),
  CONSTRAINT "credit_accounts_available_credits_check" CHECK (
    "mitfloww"."credit_accounts"."available_credits" >= 0
  ),
  CONSTRAINT "credit_accounts_current_monthly_credits_check" CHECK (
    "mitfloww"."credit_accounts"."current_monthly_credits" >= 0
  ),
  CONSTRAINT "credit_accounts_current_used_credits_check" CHECK (
    "mitfloww"."credit_accounts"."current_used_credits" >= 0
  ),
  CONSTRAINT "credit_accounts_lifetime_purchased_credits_check" CHECK (
    "mitfloww"."credit_accounts"."lifetime_purchased_credits" >= 0
  ),
  CONSTRAINT "credit_accounts_lifetime_granted_credits_check" CHECK (
    "mitfloww"."credit_accounts"."lifetime_granted_credits" >= 0
  ),
  CONSTRAINT "credit_accounts_lifetime_used_credits_check" CHECK (
    "mitfloww"."credit_accounts"."lifetime_used_credits" >= 0
  ),
  CONSTRAINT "credit_accounts_lifetime_expired_credits_check" CHECK (
    "mitfloww"."credit_accounts"."lifetime_expired_credits" >= 0
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_accounts_owner_id_unique_idx"
  ON "mitfloww"."credit_accounts" USING btree ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_accounts_plan_key_idx"
  ON "mitfloww"."credit_accounts" USING btree ("plan_key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mitfloww"."credit_ledger_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "mitfloww"."credit_accounts"("id") ON DELETE cascade,
  "owner_id" varchar(255) NOT NULL,
  "type" varchar(40) NOT NULL,
  "source" varchar(40) NOT NULL,
  "feature_key" varchar(80),
  "description_key" varchar(160),
  "credits" integer NOT NULL,
  "balance_before" integer,
  "balance_after" integer NOT NULL,
  "project_id" uuid REFERENCES "mitfloww"."projects"("id") ON DELETE set null,
  "file_id" uuid REFERENCES "mitfloww"."files"("id") ON DELETE set null,
  "version_id" uuid REFERENCES "mitfloww"."file_versions"("id") ON DELETE set null,
  "idempotency_key" varchar(255),
  "metadata" jsonb,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "credit_ledger_entries_type_check" CHECK (
    "mitfloww"."credit_ledger_entries"."type" IN (
      'grant',
      'purchase',
      'deduction',
      'refund',
      'adjustment',
      'expiry',
      'reservation',
      'reservation_release',
      'reservation_capture'
    )
  ),
  CONSTRAINT "credit_ledger_entries_source_check" CHECK (
    "mitfloww"."credit_ledger_entries"."source" IN (
      'monthly_plan',
      'purchased_pack',
      'promotional',
      'feature_usage',
      'admin_adjustment',
      'refund',
      'system'
    )
  ),
  CONSTRAINT "credit_ledger_entries_balance_after_check" CHECK (
    "mitfloww"."credit_ledger_entries"."balance_after" >= 0
  ),
  CONSTRAINT "credit_ledger_entries_credit_value_check" CHECK (
    "mitfloww"."credit_ledger_entries"."credits" <> 0
    OR "mitfloww"."credit_ledger_entries"."type" = 'reservation_capture'
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_entries_idempotency_unique_idx"
  ON "mitfloww"."credit_ledger_entries" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_entries_account_created_at_idx"
  ON "mitfloww"."credit_ledger_entries" USING btree ("account_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_entries_owner_created_at_idx"
  ON "mitfloww"."credit_ledger_entries" USING btree ("owner_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_entries_type_idx"
  ON "mitfloww"."credit_ledger_entries" USING btree ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_entries_source_idx"
  ON "mitfloww"."credit_ledger_entries" USING btree ("source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_entries_project_id_idx"
  ON "mitfloww"."credit_ledger_entries" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_entries_file_id_idx"
  ON "mitfloww"."credit_ledger_entries" USING btree ("file_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_entries_version_id_idx"
  ON "mitfloww"."credit_ledger_entries" USING btree ("version_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mitfloww"."credit_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "mitfloww"."credit_accounts"("id") ON DELETE cascade,
  "owner_id" varchar(255) NOT NULL,
  "credits" integer NOT NULL,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "feature_key" varchar(80) NOT NULL,
  "idempotency_key" varchar(255) NOT NULL,
  "project_id" uuid REFERENCES "mitfloww"."projects"("id") ON DELETE set null,
  "file_id" uuid REFERENCES "mitfloww"."files"("id") ON DELETE set null,
  "version_id" uuid REFERENCES "mitfloww"."file_versions"("id") ON DELETE set null,
  "metadata" jsonb,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "credit_reservations_status_check" CHECK (
    "mitfloww"."credit_reservations"."status" IN ('active','captured','released','expired')
  ),
  CONSTRAINT "credit_reservations_credits_check" CHECK (
    "mitfloww"."credit_reservations"."credits" > 0
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_reservations_idempotency_unique_idx"
  ON "mitfloww"."credit_reservations" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_reservations_account_status_idx"
  ON "mitfloww"."credit_reservations" USING btree ("account_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_reservations_owner_status_idx"
  ON "mitfloww"."credit_reservations" USING btree ("owner_id", "status");
