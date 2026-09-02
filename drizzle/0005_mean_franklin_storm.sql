CREATE TABLE "mitfloww"."projects" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"title" varchar(80) NOT NULL,
	"client_name" varchar(60) DEFAULT 'New client' NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"payment_lock_enabled" boolean DEFAULT true NOT NULL,
	"preview_mode_enabled" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_status_check" CHECK ("mitfloww"."projects"."status" IN ('active', 'completed')),
	CONSTRAINT "projects_currency_format_check" CHECK ("mitfloww"."projects"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE INDEX "projects_status_updated_at_idx" ON "mitfloww"."projects" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "projects_deleted_at_idx" ON "mitfloww"."projects" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "projects_updated_at_idx" ON "mitfloww"."projects" USING btree ("updated_at");
