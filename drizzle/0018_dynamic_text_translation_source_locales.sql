ALTER TABLE "mitfloww"."revision_comments"
  ADD COLUMN IF NOT EXISTS "source_locale" varchar(16) NOT NULL DEFAULT 'und';--> statement-breakpoint

ALTER TABLE "mitfloww"."revision_comment_replies"
  ADD COLUMN IF NOT EXISTS "source_locale" varchar(16) NOT NULL DEFAULT 'und';--> statement-breakpoint

ALTER TABLE "mitfloww"."file_version_reports"
  ADD COLUMN IF NOT EXISTS "source_locale" varchar(16) NOT NULL DEFAULT 'und';--> statement-breakpoint

ALTER TABLE "mitfloww"."files"
  ADD COLUMN IF NOT EXISTS "final_draft_report_source_locale" varchar(16) NOT NULL DEFAULT 'und';--> statement-breakpoint

ALTER TABLE "mitfloww"."projects"
  ADD COLUMN IF NOT EXISTS "title_source_locale" varchar(16) NOT NULL DEFAULT 'und';--> statement-breakpoint

ALTER TABLE "mitfloww"."projects"
  ADD COLUMN IF NOT EXISTS "client_name_source_locale" varchar(16) NOT NULL DEFAULT 'und';--> statement-breakpoint

ALTER TABLE "mitfloww"."files"
  ADD COLUMN IF NOT EXISTS "name_source_locale" varchar(16) NOT NULL DEFAULT 'und';--> statement-breakpoint

ALTER TABLE "mitfloww"."notifications"
  ADD COLUMN IF NOT EXISTS "title_key" varchar(160);--> statement-breakpoint

ALTER TABLE "mitfloww"."notifications"
  ADD COLUMN IF NOT EXISTS "description_key" varchar(160);--> statement-breakpoint

ALTER TABLE "mitfloww"."notifications"
  ALTER COLUMN "title" DROP NOT NULL;--> statement-breakpoint

ALTER TABLE "mitfloww"."notifications"
  ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint

UPDATE "mitfloww"."revision_comments"
SET "source_locale" = 'und'
WHERE trim("source_locale") = '';--> statement-breakpoint

UPDATE "mitfloww"."revision_comment_replies"
SET "source_locale" = 'und'
WHERE trim("source_locale") = '';--> statement-breakpoint

UPDATE "mitfloww"."file_version_reports"
SET "source_locale" = 'und'
WHERE trim("source_locale") = '';--> statement-breakpoint

UPDATE "mitfloww"."files"
SET "final_draft_report_source_locale" = 'und'
WHERE trim("final_draft_report_source_locale") = '';--> statement-breakpoint

UPDATE "mitfloww"."projects"
SET "title_source_locale" = 'und'
WHERE trim("title_source_locale") = '';--> statement-breakpoint

UPDATE "mitfloww"."projects"
SET "client_name_source_locale" = 'und'
WHERE trim("client_name_source_locale") = '';--> statement-breakpoint

UPDATE "mitfloww"."files"
SET "name_source_locale" = 'und'
WHERE trim("name_source_locale") = '';--> statement-breakpoint
