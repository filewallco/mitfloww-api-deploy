ALTER TABLE "mitfloww"."projects"
  ADD COLUMN "amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."projects"
  ADD COLUMN "payment_status" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."projects"
  ADD COLUMN "revision_limit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."projects"
  ADD COLUMN "extra_revision_cost_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

WITH "project_file_backfill" AS (
  SELECT
    "project_id",
    COALESCE(SUM("price_cents"), 0) AS "amount_cents",
    COUNT(*) AS "active_file_count",
    SUM(CASE WHEN "payment_status" = 1 THEN 1 ELSE 0 END) AS "paid_file_count",
    COALESCE(MAX("revision_limit"), 0) AS "revision_limit",
    COALESCE(MAX("extra_revision_cost_cents"), 0) AS "extra_revision_cost_cents"
  FROM "mitfloww"."files"
  WHERE "deleted_at" IS NULL
  GROUP BY "project_id"
)
UPDATE "mitfloww"."projects" AS "projects"
SET
  "amount_cents" = "project_file_backfill"."amount_cents",
  "payment_status" = CASE
    WHEN "project_file_backfill"."amount_cents" > 0
      AND "project_file_backfill"."active_file_count" > 0
      AND "project_file_backfill"."paid_file_count" = "project_file_backfill"."active_file_count"
      THEN 1
    ELSE 0
  END,
  "revision_limit" = "project_file_backfill"."revision_limit",
  "extra_revision_cost_cents" = "project_file_backfill"."extra_revision_cost_cents"
FROM "project_file_backfill"
WHERE "projects"."id" = "project_file_backfill"."project_id";--> statement-breakpoint

ALTER TABLE "mitfloww"."projects"
  ALTER COLUMN "amount_cents" DROP DEFAULT;--> statement-breakpoint

ALTER TABLE "mitfloww"."projects"
  ADD CONSTRAINT "projects_amount_cents_check"
  CHECK ("mitfloww"."projects"."amount_cents" >= 0);--> statement-breakpoint
ALTER TABLE "mitfloww"."projects"
  ADD CONSTRAINT "projects_payment_status_check"
  CHECK ("mitfloww"."projects"."payment_status" >= 0 AND "mitfloww"."projects"."payment_status" <= 1);--> statement-breakpoint
ALTER TABLE "mitfloww"."projects"
  ADD CONSTRAINT "projects_revision_limit_check"
  CHECK ("mitfloww"."projects"."revision_limit" >= 0);--> statement-breakpoint
ALTER TABLE "mitfloww"."projects"
  ADD CONSTRAINT "projects_extra_revision_cost_cents_check"
  CHECK ("mitfloww"."projects"."extra_revision_cost_cents" >= 0);--> statement-breakpoint

ALTER TABLE "mitfloww"."files"
  DROP CONSTRAINT "files_payment_status_check";--> statement-breakpoint
DROP INDEX "mitfloww"."files_payment_status_idx";--> statement-breakpoint

ALTER TABLE "mitfloww"."files" DROP COLUMN "payment_status";--> statement-breakpoint
ALTER TABLE "mitfloww"."files" DROP COLUMN "revision_limit";--> statement-breakpoint
ALTER TABLE "mitfloww"."files" DROP COLUMN "extra_revision_cost_cents";--> statement-breakpoint
ALTER TABLE "mitfloww"."files" DROP COLUMN "price_cents";--> statement-breakpoint
