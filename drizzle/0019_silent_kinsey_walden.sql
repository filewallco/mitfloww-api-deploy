CREATE TABLE IF NOT EXISTS "mitfloww"."file_version_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"file_version_id" uuid NOT NULL,
	"reason" varchar(120) NOT NULL,
	"message" text,
	"source_locale" varchar(16) DEFAULT 'und' NOT NULL,
	"status" varchar(32) DEFAULT 'reported' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_version_reports_status_check" CHECK ("mitfloww"."file_version_reports"."status" IN ('reported','under_review','resolved','dismissed'))
);
--> statement-breakpoint
ALTER TABLE "mitfloww"."notifications" ALTER COLUMN "title" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."notifications" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."file_versions" ADD COLUMN IF NOT EXISTS "watermark_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."file_versions" ADD COLUMN IF NOT EXISTS "final_draft_downloaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mitfloww"."file_versions" ADD COLUMN IF NOT EXISTS "final_draft_download_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."file_versions" ADD COLUMN IF NOT EXISTS "preview_retention_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mitfloww"."file_versions" ADD COLUMN IF NOT EXISTS "preview_purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mitfloww"."file_versions" ADD COLUMN IF NOT EXISTS "preview_storage_bucket" varchar(128);--> statement-breakpoint
ALTER TABLE "mitfloww"."file_versions" ADD COLUMN IF NOT EXISTS "preview_storage_key" text;--> statement-breakpoint
ALTER TABLE "mitfloww"."file_versions" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mitfloww"."file_versions" ADD COLUMN IF NOT EXISTS "deleted_by" varchar(255);--> statement-breakpoint
ALTER TABLE "mitfloww"."file_versions" ADD COLUMN IF NOT EXISTS "delete_reason" text;--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ADD COLUMN IF NOT EXISTS "name_source_locale" varchar(16) DEFAULT 'und' NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ADD COLUMN IF NOT EXISTS "final_draft_report_status" varchar(32) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ADD COLUMN IF NOT EXISTS "final_draft_reported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ADD COLUMN IF NOT EXISTS "final_draft_report_reason" varchar(120);--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ADD COLUMN IF NOT EXISTS "final_draft_report_message" text;--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ADD COLUMN IF NOT EXISTS "final_draft_report_source_locale" varchar(16) DEFAULT 'und' NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."notifications" ADD COLUMN IF NOT EXISTS "title_key" varchar(160);--> statement-breakpoint
ALTER TABLE "mitfloww"."notifications" ADD COLUMN IF NOT EXISTS "description_key" varchar(160);--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ADD COLUMN IF NOT EXISTS "title_source_locale" varchar(16) DEFAULT 'und' NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ADD COLUMN IF NOT EXISTS "client_name_source_locale" varchar(16) DEFAULT 'und' NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ADD COLUMN IF NOT EXISTS "preview_mode_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comment_replies" ADD COLUMN IF NOT EXISTS "source_locale" varchar(16) DEFAULT 'und' NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comments" ADD COLUMN IF NOT EXISTS "source_locale" varchar(16) DEFAULT 'und' NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'file_version_reports_project_id_projects_id_fk'
      AND connamespace = 'mitfloww'::regnamespace
  ) THEN
    ALTER TABLE "mitfloww"."file_version_reports"
      ADD CONSTRAINT "file_version_reports_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "mitfloww"."projects"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'file_version_reports_file_id_files_id_fk'
      AND connamespace = 'mitfloww'::regnamespace
  ) THEN
    ALTER TABLE "mitfloww"."file_version_reports"
      ADD CONSTRAINT "file_version_reports_file_id_files_id_fk"
      FOREIGN KEY ("file_id") REFERENCES "mitfloww"."files"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'file_version_reports_file_version_id_file_versions_id_fk'
      AND connamespace = 'mitfloww'::regnamespace
  ) THEN
    ALTER TABLE "mitfloww"."file_version_reports"
      ADD CONSTRAINT "file_version_reports_file_version_id_file_versions_id_fk"
      FOREIGN KEY ("file_version_id") REFERENCES "mitfloww"."file_versions"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_version_reports_project_id_idx" ON "mitfloww"."file_version_reports" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_version_reports_file_id_idx" ON "mitfloww"."file_version_reports" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_version_reports_file_version_id_idx" ON "mitfloww"."file_version_reports" USING btree ("file_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_version_reports_status_idx" ON "mitfloww"."file_version_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_versions_deleted_at_idx" ON "mitfloww"."file_versions" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_versions_preview_retention_until_idx" ON "mitfloww"."file_versions" USING btree ("preview_retention_until");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "files_final_draft_report_status_idx" ON "mitfloww"."files" USING btree ("final_draft_report_status");--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'file_versions_final_draft_download_count_check'
      AND connamespace = 'mitfloww'::regnamespace
  ) THEN
    ALTER TABLE "mitfloww"."file_versions"
      ADD CONSTRAINT "file_versions_final_draft_download_count_check"
      CHECK ("mitfloww"."file_versions"."final_draft_download_count" >= 0);
  END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'files_final_draft_report_status_check'
      AND connamespace = 'mitfloww'::regnamespace
  ) THEN
    ALTER TABLE "mitfloww"."files"
      ADD CONSTRAINT "files_final_draft_report_status_check"
      CHECK ("mitfloww"."files"."final_draft_report_status" IN ('none','reported','under_review','resolved','dismissed'));
  END IF;
END
$$;
