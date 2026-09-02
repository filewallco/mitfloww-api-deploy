CREATE TABLE "mitfloww"."file_revision_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "file_id" uuid NOT NULL,
  "file_version_id" uuid NOT NULL,
  "project_id" varchar(255) NOT NULL,
  "note" text NOT NULL,
  "reply" text,
  "replied_at" timestamp with time zone,
  "replied_by" varchar(255),
  "reply_email_status" varchar(32) DEFAULT 'not_configured' NOT NULL,
  "reply_email_error" text,
  "created_by" varchar(255),
  "updated_by" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "mitfloww"."file_revision_notes"
  ADD CONSTRAINT "file_revision_notes_reply_email_status_check"
  CHECK ("mitfloww"."file_revision_notes"."reply_email_status" IN ('not_configured','queued','sent','failed'));--> statement-breakpoint

ALTER TABLE "mitfloww"."file_revision_notes"
  ADD CONSTRAINT "file_revision_notes_file_id_fk"
  FOREIGN KEY ("file_id")
  REFERENCES "mitfloww"."files"("id")
  ON DELETE CASCADE
  ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "mitfloww"."file_revision_notes"
  ADD CONSTRAINT "file_revision_notes_file_version_id_fk"
  FOREIGN KEY ("file_version_id")
  REFERENCES "mitfloww"."file_versions"("id")
  ON DELETE CASCADE
  ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "mitfloww"."file_revision_notes"
  ADD CONSTRAINT "file_revision_notes_project_id_fk"
  FOREIGN KEY ("project_id")
  REFERENCES "mitfloww"."projects"("id")
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;--> statement-breakpoint

CREATE UNIQUE INDEX "file_revision_notes_file_version_unique"
  ON "mitfloww"."file_revision_notes" ("file_version_id");--> statement-breakpoint
CREATE INDEX "file_revision_notes_file_id_idx"
  ON "mitfloww"."file_revision_notes" ("file_id");--> statement-breakpoint
CREATE INDEX "file_revision_notes_project_id_idx"
  ON "mitfloww"."file_revision_notes" ("project_id");--> statement-breakpoint
CREATE INDEX "file_revision_notes_created_at_idx"
  ON "mitfloww"."file_revision_notes" ("created_at");--> statement-breakpoint
