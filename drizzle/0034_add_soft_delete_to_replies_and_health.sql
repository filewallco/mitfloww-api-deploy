ALTER TABLE "mitfloww"."revision_comment_replies" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "revision_comment_replies_deleted_at_idx" ON "mitfloww"."revision_comment_replies" ("deleted_at");
ALTER TABLE "mitfloww"."health_checks" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
