ALTER TABLE "mitfloww"."files"
  ADD COLUMN IF NOT EXISTS "final_draft_report_status" varchar(32) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "final_draft_reported_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "final_draft_report_reason" varchar(120),
  ADD COLUMN IF NOT EXISTS "final_draft_report_message" text;--> statement-breakpoint

ALTER TABLE "mitfloww"."file_versions"
  ADD COLUMN IF NOT EXISTS "final_draft_downloaded_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "final_draft_download_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "preview_retention_until" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "preview_purged_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "preview_storage_bucket" varchar(128),
  ADD COLUMN IF NOT EXISTS "preview_storage_key" text,
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "deleted_by" varchar(255),
  ADD COLUMN IF NOT EXISTS "delete_reason" text;--> statement-breakpoint

UPDATE "mitfloww"."file_versions"
SET
  "preview_storage_bucket" = COALESCE("preview_storage_bucket", "processed_storage_bucket"),
  "preview_storage_key" = COALESCE("preview_storage_key", "processed_storage_key")
WHERE "processed_storage_key" IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mitfloww"."file_version_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "file_id" uuid NOT NULL,
  "file_version_id" uuid NOT NULL,
  "reason" varchar(120) NOT NULL,
  "message" text,
  "status" varchar(32) NOT NULL DEFAULT 'reported',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "file_version_reports_status_check"
    CHECK ("mitfloww"."file_version_reports"."status" IN ('reported','under_review','resolved','dismissed'))
);--> statement-breakpoint

ALTER TABLE "mitfloww"."file_version_reports"
  ADD CONSTRAINT "file_version_reports_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "mitfloww"."projects"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "mitfloww"."file_version_reports"
  ADD CONSTRAINT "file_version_reports_file_id_files_id_fk"
  FOREIGN KEY ("file_id") REFERENCES "mitfloww"."files"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "mitfloww"."file_version_reports"
  ADD CONSTRAINT "file_version_reports_file_version_id_file_versions_id_fk"
  FOREIGN KEY ("file_version_id") REFERENCES "mitfloww"."file_versions"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "mitfloww"."files"
  ADD CONSTRAINT "files_final_draft_report_status_check"
  CHECK ("mitfloww"."files"."final_draft_report_status" IN ('none','reported','under_review','resolved','dismissed'));--> statement-breakpoint

ALTER TABLE "mitfloww"."file_versions"
  ADD CONSTRAINT "file_versions_final_draft_download_count_check"
  CHECK ("mitfloww"."file_versions"."final_draft_download_count" >= 0);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "files_final_draft_report_status_idx"
  ON "mitfloww"."files" ("final_draft_report_status");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "file_versions_deleted_at_idx"
  ON "mitfloww"."file_versions" ("deleted_at");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "file_versions_preview_retention_until_idx"
  ON "mitfloww"."file_versions" ("preview_retention_until");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "file_version_reports_project_id_idx"
  ON "mitfloww"."file_version_reports" ("project_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "file_version_reports_file_id_idx"
  ON "mitfloww"."file_version_reports" ("file_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "file_version_reports_file_version_id_idx"
  ON "mitfloww"."file_version_reports" ("file_version_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "file_version_reports_status_idx"
  ON "mitfloww"."file_version_reports" ("status");
