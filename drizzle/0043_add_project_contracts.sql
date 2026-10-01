-- Migration 0043: Add project contracts and contract update requests
ALTER TABLE "mitfloww"."projects" ADD COLUMN IF NOT EXISTS "contract_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "mitfloww"."projects" ADD COLUMN IF NOT EXISTS "contract_status" varchar(32) NOT NULL DEFAULT 'none';
ALTER TABLE "mitfloww"."projects" ADD COLUMN IF NOT EXISTS "contract_accepted_at" timestamp with time zone;
ALTER TABLE "mitfloww"."projects" ADD COLUMN IF NOT EXISTS "contract_accepted_version" integer NOT NULL DEFAULT 0;
ALTER TABLE "mitfloww"."projects" ADD COLUMN IF NOT EXISTS "contract_pdf_storage_key" varchar(1024);

CREATE TABLE IF NOT EXISTS "mitfloww"."project_contracts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "mitfloww"."projects"("id") ON DELETE CASCADE,
  "user_id" varchar(255) NOT NULL,
  "version" integer NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'accepted',
  "snapshot" jsonb NOT NULL,
  "pdf_storage_bucket" varchar(255),
  "pdf_storage_key" varchar(1024),
  "accepted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "accepted_by" varchar(255),
  "accepted_ip" varchar(64),
  "token_transaction_id" varchar(255),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "project_contracts_project_id_idx" ON "mitfloww"."project_contracts" ("project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "project_contracts_project_version_unique_idx" ON "mitfloww"."project_contracts" ("project_id", "version");

CREATE TABLE IF NOT EXISTS "mitfloww"."project_contract_update_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "mitfloww"."projects"("id") ON DELETE CASCADE,
  "user_id" varchar(255) NOT NULL,
  "from_version" integer NOT NULL,
  "target_version" integer NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "requested_changes" jsonb NOT NULL,
  "proposed_snapshot" jsonb NOT NULL,
  "proposed_pdf_storage_bucket" varchar(255),
  "proposed_pdf_storage_key" varchar(1024),
  "token_transaction_id" varchar(255),
  "requested_at" timestamp with time zone NOT NULL DEFAULT now(),
  "responded_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "project_contract_update_requests_project_id_idx" ON "mitfloww"."project_contract_update_requests" ("project_id");
CREATE INDEX IF NOT EXISTS "project_contract_update_requests_status_idx" ON "mitfloww"."project_contract_update_requests" ("status");
