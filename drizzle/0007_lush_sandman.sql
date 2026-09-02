ALTER TABLE "mitfloww"."projects"
  ADD COLUMN IF NOT EXISTS "client_email" varchar(255);

ALTER TABLE "mitfloww"."projects"
  ADD COLUMN IF NOT EXISTS "client_name" varchar(60) NOT NULL DEFAULT 'New client';

ALTER TABLE "mitfloww"."projects"
  ADD COLUMN IF NOT EXISTS "currency" varchar(3) NOT NULL DEFAULT 'INR';

ALTER TABLE "mitfloww"."projects"
  ADD COLUMN IF NOT EXISTS "watermark_enabled" boolean NOT NULL DEFAULT true;

ALTER TABLE "mitfloww"."projects"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;

ALTER TABLE "mitfloww"."projects"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();

UPDATE "mitfloww"."projects"
SET
  "client_name" = COALESCE(NULLIF("client_name", ''), 'New client'),
  "currency" = COALESCE(NULLIF("currency", ''), 'INR'),
  "watermark_enabled" = COALESCE("watermark_enabled", true),
  "updated_at" = COALESCE("updated_at", now());

ALTER TABLE "mitfloww"."projects"
  DROP CONSTRAINT IF EXISTS "projects_currency_format_check";

ALTER TABLE "mitfloww"."projects"
  ADD CONSTRAINT "projects_currency_format_check"
  CHECK ("currency" ~ '^[A-Z]{3}$');

CREATE INDEX IF NOT EXISTS "projects_deleted_at_idx"
  ON "mitfloww"."projects" ("deleted_at");

CREATE INDEX IF NOT EXISTS "projects_updated_at_idx"
  ON "mitfloww"."projects" ("updated_at");