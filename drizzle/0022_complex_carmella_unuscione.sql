ALTER TABLE "mitfloww"."credit_accounts"
  ADD COLUMN IF NOT EXISTS "scope_type" varchar(32);
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_accounts"
  ADD COLUMN IF NOT EXISTS "scope_id" varchar(255);
--> statement-breakpoint
UPDATE "mitfloww"."credit_accounts"
SET
  "scope_type" = coalesce("scope_type", 'personal'),
  "scope_id" = coalesce("scope_id", "owner_id");
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_accounts"
  ALTER COLUMN "scope_type" SET DEFAULT 'personal';
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_accounts"
  ALTER COLUMN "scope_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_accounts"
  ALTER COLUMN "scope_id" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credit_accounts_scope_type_check'
  ) THEN
    ALTER TABLE "mitfloww"."credit_accounts"
      ADD CONSTRAINT "credit_accounts_scope_type_check"
      CHECK ("mitfloww"."credit_accounts"."scope_type" IN ('personal','workspace'));
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "mitfloww"."credit_accounts_owner_id_unique_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_accounts_scope_unique_idx"
  ON "mitfloww"."credit_accounts" USING btree ("scope_type", "scope_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_accounts_owner_id_idx"
  ON "mitfloww"."credit_accounts" USING btree ("owner_id");
--> statement-breakpoint

ALTER TABLE "mitfloww"."credit_ledger_entries"
  ADD COLUMN IF NOT EXISTS "scope_type" varchar(32);
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_ledger_entries"
  ADD COLUMN IF NOT EXISTS "scope_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_ledger_entries"
  ADD COLUMN IF NOT EXISTS "actor_user_id" varchar(255);
--> statement-breakpoint
UPDATE "mitfloww"."credit_ledger_entries"
SET
  "scope_type" = coalesce("scope_type", 'personal'),
  "scope_id" = coalesce("scope_id", "owner_id"),
  "actor_user_id" = coalesce("actor_user_id", "owner_id");
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_ledger_entries"
  ALTER COLUMN "scope_type" SET DEFAULT 'personal';
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_ledger_entries"
  ALTER COLUMN "scope_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_ledger_entries"
  ALTER COLUMN "scope_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_ledger_entries"
  ALTER COLUMN "actor_user_id" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credit_ledger_entries_scope_type_check'
  ) THEN
    ALTER TABLE "mitfloww"."credit_ledger_entries"
      ADD CONSTRAINT "credit_ledger_entries_scope_type_check"
      CHECK ("mitfloww"."credit_ledger_entries"."scope_type" IN ('personal','workspace'));
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_entries_scope_created_at_idx"
  ON "mitfloww"."credit_ledger_entries" USING btree ("scope_type", "scope_id", "created_at");
--> statement-breakpoint

ALTER TABLE "mitfloww"."credit_reservations"
  ADD COLUMN IF NOT EXISTS "scope_type" varchar(32);
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_reservations"
  ADD COLUMN IF NOT EXISTS "scope_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_reservations"
  ADD COLUMN IF NOT EXISTS "actor_user_id" varchar(255);
--> statement-breakpoint
UPDATE "mitfloww"."credit_reservations"
SET
  "scope_type" = coalesce("scope_type", 'personal'),
  "scope_id" = coalesce("scope_id", "owner_id"),
  "actor_user_id" = coalesce("actor_user_id", "owner_id");
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_reservations"
  ALTER COLUMN "scope_type" SET DEFAULT 'personal';
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_reservations"
  ALTER COLUMN "scope_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_reservations"
  ALTER COLUMN "scope_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_reservations"
  ALTER COLUMN "actor_user_id" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credit_reservations_scope_type_check'
  ) THEN
    ALTER TABLE "mitfloww"."credit_reservations"
      ADD CONSTRAINT "credit_reservations_scope_type_check"
      CHECK ("mitfloww"."credit_reservations"."scope_type" IN ('personal','workspace'));
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_reservations_scope_status_idx"
  ON "mitfloww"."credit_reservations" USING btree ("scope_type", "scope_id", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mitfloww"."storage_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope_type" varchar(32) NOT NULL,
  "scope_id" varchar(255) NOT NULL,
  "plan_key" varchar(32) DEFAULT 'free' NOT NULL,
  "storage_limit_bytes" bigint DEFAULT 0 NOT NULL,
  "used_storage_bytes" bigint DEFAULT 0 NOT NULL,
  "reserved_storage_bytes" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "storage_accounts_scope_type_check" CHECK (
    "mitfloww"."storage_accounts"."scope_type" IN ('personal','workspace')
  ),
  CONSTRAINT "storage_accounts_plan_key_check" CHECK (
    "mitfloww"."storage_accounts"."plan_key" IN ('free','standard','pro','studio')
  ),
  CONSTRAINT "storage_accounts_storage_limit_bytes_check" CHECK (
    "mitfloww"."storage_accounts"."storage_limit_bytes" >= 0
  ),
  CONSTRAINT "storage_accounts_used_storage_bytes_check" CHECK (
    "mitfloww"."storage_accounts"."used_storage_bytes" >= 0
  ),
  CONSTRAINT "storage_accounts_reserved_storage_bytes_check" CHECK (
    "mitfloww"."storage_accounts"."reserved_storage_bytes" >= 0
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "storage_accounts_scope_unique_idx"
  ON "mitfloww"."storage_accounts" USING btree ("scope_type", "scope_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_accounts_plan_key_idx"
  ON "mitfloww"."storage_accounts" USING btree ("plan_key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mitfloww"."storage_account_mutations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "mitfloww"."storage_accounts"("id") ON DELETE cascade,
  "scope_type" varchar(32) NOT NULL,
  "scope_id" varchar(255) NOT NULL,
  "actor_user_id" varchar(255) NOT NULL,
  "operation" varchar(32) NOT NULL,
  "bytes_delta" bigint NOT NULL,
  "idempotency_key" varchar(255) NOT NULL,
  "project_id" uuid REFERENCES "mitfloww"."projects"("id") ON DELETE set null,
  "file_id" uuid REFERENCES "mitfloww"."files"("id") ON DELETE set null,
  "version_id" uuid REFERENCES "mitfloww"."file_versions"("id") ON DELETE set null,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "storage_account_mutations_scope_type_check" CHECK (
    "mitfloww"."storage_account_mutations"."scope_type" IN ('personal','workspace')
  ),
  CONSTRAINT "storage_account_mutations_operation_check" CHECK (
    "mitfloww"."storage_account_mutations"."operation" IN ('commit','release','adjustment')
  ),
  CONSTRAINT "storage_account_mutations_bytes_delta_check" CHECK (
    "mitfloww"."storage_account_mutations"."bytes_delta" <> 0
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "storage_account_mutations_idempotency_unique_idx"
  ON "mitfloww"."storage_account_mutations" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_account_mutations_account_created_at_idx"
  ON "mitfloww"."storage_account_mutations" USING btree ("account_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_account_mutations_scope_created_at_idx"
  ON "mitfloww"."storage_account_mutations" USING btree ("scope_type", "scope_id", "created_at");
