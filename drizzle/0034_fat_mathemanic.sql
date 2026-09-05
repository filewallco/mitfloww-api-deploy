CREATE TABLE "mitfloww"."companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"name" varchar(150) DEFAULT 'DilCo Design Company' NOT NULL,
	"tagline" varchar(255),
	"industry" varchar(100),
	"website" varchar(255),
	"email" varchar(255),
	"logo_url" varchar(1024),
	"logo_storage_key" varchar(1024),
	"year_founded" varchar(10),
	"company_size" varchar(50),
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mitfloww"."file_versions" DROP CONSTRAINT "file_versions_processing_status_check";--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ALTER COLUMN "avatar_url" SET DATA TYPE varchar(1024);--> statement-breakpoint
ALTER TABLE "mitfloww"."health_checks" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ADD COLUMN "user_id" varchar(255) DEFAULT 'default-owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."revision_comment_replies" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "username" varchar(100);--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "password_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "first_name" varchar(100);--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "last_name" varchar(100);--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "phone" varchar(50);--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "country_code" varchar(10);--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "city" varchar(100);--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "state" varchar(100);--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "postcode" varchar(20);--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "country" varchar(100);--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "role_title" varchar(150);--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "avatar_storage_key" varchar(1024);--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "is_verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "status" varchar(32) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "client_share_link_expiry_days" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mitfloww"."companies" ADD CONSTRAINT "companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "mitfloww"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "mitfloww"."projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "revision_comment_replies_deleted_at_idx" ON "mitfloww"."revision_comment_replies" USING btree ("deleted_at");--> statement-breakpoint
ALTER TABLE "mitfloww"."file_versions" ADD CONSTRAINT "file_versions_processing_status_check" CHECK ("mitfloww"."file_versions"."processing_status" IN ('queued','processing','uploading','completed','retrying','failed','corrupt','skipped','cancelled'));