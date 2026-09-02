CREATE SCHEMA "mitfloww";
--> statement-breakpoint
CREATE TYPE "mitfloww"."file_payment_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TYPE "mitfloww"."file_upload_status" AS ENUM('pending', 'uploaded', 'failed', 'deleted');--> statement-breakpoint
CREATE TABLE "mitfloww"."files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar(255),
	"name" varchar(120) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mime_type" varchar(255) NOT NULL,
	"extension" varchar(16) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"storage_bucket" varchar(128) DEFAULT 'files' NOT NULL,
	"preview_enabled" boolean DEFAULT false NOT NULL,
	"payment_locked" boolean DEFAULT true NOT NULL,
	"payment_status" "mitfloww"."file_payment_status" DEFAULT 'pending' NOT NULL,
	"revision_limit" integer DEFAULT 0 NOT NULL,
	"extra_revision_cost_cents" integer DEFAULT 0 NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"upload_status" "mitfloww"."file_upload_status" DEFAULT 'pending' NOT NULL,
	"uploaded_by" varchar(255),
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mitfloww"."health_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "files_storage_key_unique_idx" ON "mitfloww"."files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "files_project_id_created_at_idx" ON "mitfloww"."files" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "files_upload_status_created_at_idx" ON "mitfloww"."files" USING btree ("upload_status","created_at");--> statement-breakpoint
CREATE INDEX "files_payment_status_idx" ON "mitfloww"."files" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "files_deleted_at_idx" ON "mitfloww"."files" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "files_created_at_idx" ON "mitfloww"."files" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "files_updated_at_idx" ON "mitfloww"."files" USING btree ("updated_at");