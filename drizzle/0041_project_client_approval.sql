-- Migration 0041: Add client approval and notification tracking to projects
ALTER TABLE "mitfloww"."projects" ADD COLUMN IF NOT EXISTS "client_approved_at" timestamp with time zone;
ALTER TABLE "mitfloww"."projects" ADD COLUMN IF NOT EXISTS "creator_last_viewed_comments_at" timestamp with time zone;
ALTER TABLE "mitfloww"."projects" ADD COLUMN IF NOT EXISTS "client_last_viewed_comments_at" timestamp with time zone;
ALTER TABLE "mitfloww"."projects" ADD COLUMN IF NOT EXISTS "creator_digest_email_sent_at" timestamp with time zone;
ALTER TABLE "mitfloww"."projects" ADD COLUMN IF NOT EXISTS "client_digest_email_sent_at" timestamp with time zone;
