ALTER TABLE "mitfloww"."file_versions"
  ADD COLUMN "is_final_draft" boolean DEFAULT false NOT NULL;--> statement-breakpoint

ALTER TABLE "mitfloww"."files"
  ADD COLUMN "approval_status" varchar(32) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."files"
  ADD COLUMN "approved_version_id" uuid;--> statement-breakpoint
ALTER TABLE "mitfloww"."files"
  ADD COLUMN "final_draft_version_id" uuid;--> statement-breakpoint

ALTER TABLE "mitfloww"."files"
  ADD CONSTRAINT "files_approval_status_check"
  CHECK ("mitfloww"."files"."approval_status" IN ('pending','approved'));--> statement-breakpoint

CREATE INDEX "files_approved_version_id_idx"
  ON "mitfloww"."files" ("approved_version_id");--> statement-breakpoint
CREATE INDEX "files_final_draft_version_id_idx"
  ON "mitfloww"."files" ("final_draft_version_id");--> statement-breakpoint

ALTER TABLE "mitfloww"."files"
  ADD CONSTRAINT "files_approved_version_id_fk"
  FOREIGN KEY ("approved_version_id")
  REFERENCES "mitfloww"."file_versions"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "mitfloww"."files"
  ADD CONSTRAINT "files_final_draft_version_id_fk"
  FOREIGN KEY ("final_draft_version_id")
  REFERENCES "mitfloww"."file_versions"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;--> statement-breakpoint
