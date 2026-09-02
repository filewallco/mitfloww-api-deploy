CREATE TABLE "mitfloww"."revision_comment_markers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"file_version_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"type" varchar(32) DEFAULT 'region' NOT NULL,
	"label_number" integer NOT NULL,
	"page_number" integer,
	"x_bp" integer NOT NULL,
	"y_bp" integer NOT NULL,
	"width_bp" integer NOT NULL,
	"height_bp" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revision_comment_markers_type_check" CHECK ("mitfloww"."revision_comment_markers"."type" IN ('region')),
	CONSTRAINT "revision_comment_markers_label_number_check" CHECK ("mitfloww"."revision_comment_markers"."label_number" >= 1),
	CONSTRAINT "revision_comment_markers_page_number_check" CHECK ("mitfloww"."revision_comment_markers"."page_number" IS NULL OR "mitfloww"."revision_comment_markers"."page_number" >= 1),
	CONSTRAINT "revision_comment_markers_x_bp_check" CHECK ("mitfloww"."revision_comment_markers"."x_bp" >= 0 AND "mitfloww"."revision_comment_markers"."x_bp" <= 10000),
	CONSTRAINT "revision_comment_markers_y_bp_check" CHECK ("mitfloww"."revision_comment_markers"."y_bp" >= 0 AND "mitfloww"."revision_comment_markers"."y_bp" <= 10000),
	CONSTRAINT "revision_comment_markers_width_bp_check" CHECK ("mitfloww"."revision_comment_markers"."width_bp" >= 1 AND "mitfloww"."revision_comment_markers"."width_bp" <= 10000),
	CONSTRAINT "revision_comment_markers_height_bp_check" CHECK ("mitfloww"."revision_comment_markers"."height_bp" >= 1 AND "mitfloww"."revision_comment_markers"."height_bp" <= 10000)
);
--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comment_markers" ADD CONSTRAINT "revision_comment_markers_comment_id_revision_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "mitfloww"."revision_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comment_markers" ADD CONSTRAINT "revision_comment_markers_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "mitfloww"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comment_markers" ADD CONSTRAINT "revision_comment_markers_file_version_id_file_versions_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "mitfloww"."file_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comment_markers" ADD CONSTRAINT "revision_comment_markers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "mitfloww"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revision_comment_markers_comment_id_idx" ON "mitfloww"."revision_comment_markers" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "revision_comment_markers_file_version_idx" ON "mitfloww"."revision_comment_markers" USING btree ("file_id","file_version_id");--> statement-breakpoint
CREATE INDEX "revision_comment_markers_project_id_idx" ON "mitfloww"."revision_comment_markers" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "revision_comment_markers_deleted_at_idx" ON "mitfloww"."revision_comment_markers" USING btree ("deleted_at");