ALTER TABLE "mitfloww"."projects" ADD COLUMN "share_token" varchar(255);--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ADD COLUMN "share_url" varchar(1024);--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ADD COLUMN "share_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ADD COLUMN "share_client_email" varchar(255);--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ADD COLUMN "share_email_added" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_share_token_unique_idx" ON "mitfloww"."projects" USING btree ("share_token");