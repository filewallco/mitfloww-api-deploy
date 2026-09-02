ALTER TABLE "mitfloww"."projects"
	RENAME COLUMN "preview_mode_enabled" TO "watermark_enabled";
--> statement-breakpoint
ALTER TABLE "mitfloww"."projects"
	ADD COLUMN "client_email" varchar(255);
--> statement-breakpoint
ALTER TABLE "mitfloww"."projects"
	DROP COLUMN "payment_lock_enabled";
--> statement-breakpoint
ALTER TABLE "mitfloww"."files"
	ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "mitfloww"."files"
	ADD CONSTRAINT "files_project_id_projects_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "mitfloww"."projects"("id")
	ON DELETE RESTRICT
	ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "mitfloww"."files"
	DROP COLUMN "preview_enabled";
--> statement-breakpoint
ALTER TABLE "mitfloww"."files"
	DROP COLUMN "payment_locked";
--> statement-breakpoint
CREATE TABLE "mitfloww"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(40) DEFAULT 'system' NOT NULL,
	"project_id" varchar(255),
	"file_id" uuid,
	"event_key" varchar(255),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_project_id_projects_id_fk"
		FOREIGN KEY ("project_id") REFERENCES "mitfloww"."projects"("id")
		ON DELETE SET NULL
		ON UPDATE NO ACTION,
	CONSTRAINT "notifications_file_id_files_id_fk"
		FOREIGN KEY ("file_id") REFERENCES "mitfloww"."files"("id")
		ON DELETE SET NULL
		ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_event_key_unique"
	ON "mitfloww"."notifications" USING btree ("event_key");
--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx"
	ON "mitfloww"."notifications" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "notifications_read_at_created_at_idx"
	ON "mitfloww"."notifications" USING btree ("read_at","created_at");
--> statement-breakpoint
CREATE INDEX "notifications_project_id_idx"
	ON "mitfloww"."notifications" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "notifications_file_id_idx"
	ON "mitfloww"."notifications" USING btree ("file_id");
--> statement-breakpoint
CREATE INDEX "notifications_category_idx"
	ON "mitfloww"."notifications" USING btree ("category");
