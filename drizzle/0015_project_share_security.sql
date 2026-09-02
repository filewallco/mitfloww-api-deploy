ALTER TABLE "mitfloww"."projects"
  ADD COLUMN IF NOT EXISTS "share_status" varchar(32),
  ADD COLUMN IF NOT EXISTS "share_password_hash" varchar(255),
  ADD COLUMN IF NOT EXISTS "share_failed_attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "share_locked_until" timestamp with time zone;--> statement-breakpoint

UPDATE "mitfloww"."projects"
SET
  "share_failed_attempts" = COALESCE("share_failed_attempts", 0),
  "share_status" = CASE
    WHEN "share_token" IS NOT NULL AND "share_expires_at" IS NOT NULL AND "share_status" IS NULL
      THEN CASE
        WHEN "share_expires_at" <= NOW() THEN 'expired'
        ELSE 'active'
      END
    ELSE "share_status"
  END;--> statement-breakpoint

ALTER TABLE "mitfloww"."projects"
  ADD CONSTRAINT "projects_share_status_check"
  CHECK (
    "mitfloww"."projects"."share_status" IS NULL OR
    "mitfloww"."projects"."share_status" IN ('active', 'expired', 'locked', 'revoked', 'password_required')
  );--> statement-breakpoint

ALTER TABLE "mitfloww"."projects"
  ADD CONSTRAINT "projects_share_failed_attempts_check"
  CHECK ("mitfloww"."projects"."share_failed_attempts" >= 0);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "projects_share_status_idx"
  ON "mitfloww"."projects" ("share_status");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "projects_share_locked_until_idx"
  ON "mitfloww"."projects" ("share_locked_until");
