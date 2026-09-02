CREATE TABLE "mitfloww"."revision_comment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"marker_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"file_version_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"label_number" integer NOT NULL,
	"body" text NOT NULL,
	"source_locale" varchar(16) DEFAULT 'und' NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" varchar(255),
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revision_comment_items_label_number_check" CHECK ("mitfloww"."revision_comment_items"."label_number" >= 1)
);
--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comment_items" ADD CONSTRAINT "revision_comment_items_comment_id_revision_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "mitfloww"."revision_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comment_items" ADD CONSTRAINT "revision_comment_items_marker_id_revision_comment_markers_id_fk" FOREIGN KEY ("marker_id") REFERENCES "mitfloww"."revision_comment_markers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comment_items" ADD CONSTRAINT "revision_comment_items_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "mitfloww"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comment_items" ADD CONSTRAINT "revision_comment_items_file_version_id_file_versions_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "mitfloww"."file_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comment_items" ADD CONSTRAINT "revision_comment_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "mitfloww"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "revision_comment_items_marker_id_unique" ON "mitfloww"."revision_comment_items" USING btree ("marker_id");--> statement-breakpoint
CREATE INDEX "revision_comment_items_comment_id_idx" ON "mitfloww"."revision_comment_items" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "revision_comment_items_file_version_idx" ON "mitfloww"."revision_comment_items" USING btree ("file_id","file_version_id");--> statement-breakpoint
CREATE INDEX "revision_comment_items_project_id_idx" ON "mitfloww"."revision_comment_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "revision_comment_items_deleted_at_idx" ON "mitfloww"."revision_comment_items" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "revision_comment_items_completed_idx" ON "mitfloww"."revision_comment_items" USING btree ("completed");