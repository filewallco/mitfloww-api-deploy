CREATE TABLE "mitfloww"."revision_comment_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"file_version_id" uuid NOT NULL,
	"comment_id" uuid,
	"reply_id" uuid,
	"reporter_id" varchar(255) NOT NULL,
	"reason" varchar(120) NOT NULL,
	"message" text,
	"source_locale" varchar(16) DEFAULT 'und' NOT NULL,
	"status" varchar(32) DEFAULT 'reported' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revision_comment_reports_target_check" CHECK (("mitfloww"."revision_comment_reports"."comment_id" IS NOT NULL AND "mitfloww"."revision_comment_reports"."reply_id" IS NULL) OR ("mitfloww"."revision_comment_reports"."comment_id" IS NULL AND "mitfloww"."revision_comment_reports"."reply_id" IS NOT NULL)),
	CONSTRAINT "revision_comment_reports_status_check" CHECK ("mitfloww"."revision_comment_reports"."status" IN ('reported','under_review','resolved','dismissed'))
);
--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comment_reports" ADD CONSTRAINT "revision_comment_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "mitfloww"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comment_reports" ADD CONSTRAINT "revision_comment_reports_file_version_id_file_versions_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "mitfloww"."file_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comment_reports" ADD CONSTRAINT "revision_comment_reports_comment_id_revision_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "mitfloww"."revision_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comment_reports" ADD CONSTRAINT "revision_comment_reports_reply_id_revision_comment_replies_id_fk" FOREIGN KEY ("reply_id") REFERENCES "mitfloww"."revision_comment_replies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revision_comment_reports_project_id_idx" ON "mitfloww"."revision_comment_reports" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "revision_comment_reports_comment_id_idx" ON "mitfloww"."revision_comment_reports" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "revision_comment_reports_reply_id_idx" ON "mitfloww"."revision_comment_reports" USING btree ("reply_id");--> statement-breakpoint
CREATE INDEX "revision_comment_reports_reporter_id_idx" ON "mitfloww"."revision_comment_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "revision_comment_reports_status_idx" ON "mitfloww"."revision_comment_reports" USING btree ("status");