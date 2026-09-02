CREATE TABLE "mitfloww"."revision_comment_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mitfloww"."revision_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"file_version_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revision_comments_status_check" CHECK ("mitfloww"."revision_comments"."status" IN ('pending','resolved'))
);
--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ALTER COLUMN "project_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "mitfloww"."notifications" ALTER COLUMN "project_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "mitfloww"."file_versions" ADD COLUMN "is_final_draft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ADD COLUMN "approval_status" varchar(32) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ADD COLUMN "approved_version_id" uuid;--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ADD COLUMN "final_draft_version_id" uuid;--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ADD COLUMN "public_id" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comment_replies" ADD CONSTRAINT "revision_comment_replies_comment_id_revision_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "mitfloww"."revision_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comments" ADD CONSTRAINT "revision_comments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "mitfloww"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comments" ADD CONSTRAINT "revision_comments_file_version_id_file_versions_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "mitfloww"."file_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comments" ADD CONSTRAINT "revision_comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "mitfloww"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "revision_comment_replies_comment_id_unique" ON "mitfloww"."revision_comment_replies" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "revision_comment_replies_comment_id_idx" ON "mitfloww"."revision_comment_replies" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "revision_comments_file_version_created_at_idx" ON "mitfloww"."revision_comments" USING btree ("file_id","file_version_id","created_at");--> statement-breakpoint
CREATE INDEX "revision_comments_project_id_idx" ON "mitfloww"."revision_comments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "revision_comments_status_idx" ON "mitfloww"."revision_comments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "revision_comments_created_at_idx" ON "mitfloww"."revision_comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "files_approved_version_id_idx" ON "mitfloww"."files" USING btree ("approved_version_id");--> statement-breakpoint
CREATE INDEX "files_final_draft_version_id_idx" ON "mitfloww"."files" USING btree ("final_draft_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_public_id_unique_idx" ON "mitfloww"."projects" USING btree ("public_id");--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ADD CONSTRAINT "files_approval_status_check" CHECK ("mitfloww"."files"."approval_status" IN ('pending','approved'));