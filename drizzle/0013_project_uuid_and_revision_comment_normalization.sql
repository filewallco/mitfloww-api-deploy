ALTER TABLE "mitfloww"."projects"
  ADD COLUMN IF NOT EXISTS "public_id" varchar(255);--> statement-breakpoint

UPDATE "mitfloww"."projects"
SET "public_id" = "id"
WHERE "public_id" IS NULL;--> statement-breakpoint

ALTER TABLE "mitfloww"."projects"
  ALTER COLUMN "public_id" SET NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "projects_public_id_unique_idx"
  ON "mitfloww"."projects" ("public_id");--> statement-breakpoint

ALTER TABLE "mitfloww"."projects"
  ADD COLUMN IF NOT EXISTS "uuid_id" uuid;--> statement-breakpoint

UPDATE "mitfloww"."projects"
SET "uuid_id" = gen_random_uuid()
WHERE "uuid_id" IS NULL;--> statement-breakpoint

ALTER TABLE "mitfloww"."projects"
  ALTER COLUMN "uuid_id" SET DEFAULT gen_random_uuid();--> statement-breakpoint

ALTER TABLE "mitfloww"."projects"
  ALTER COLUMN "uuid_id" SET NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "projects_uuid_id_unique_idx"
  ON "mitfloww"."projects" ("uuid_id");--> statement-breakpoint

ALTER TABLE "mitfloww"."files"
  ADD COLUMN IF NOT EXISTS "project_uuid" uuid;--> statement-breakpoint

UPDATE "mitfloww"."files" AS "files"
SET "project_uuid" = "projects"."uuid_id"
FROM "mitfloww"."projects" AS "projects"
WHERE "files"."project_uuid" IS NULL
  AND "files"."project_id" = "projects"."public_id";--> statement-breakpoint

ALTER TABLE "mitfloww"."files"
  ALTER COLUMN "project_uuid" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "mitfloww"."notifications"
  ADD COLUMN IF NOT EXISTS "project_uuid" uuid;--> statement-breakpoint

UPDATE "mitfloww"."notifications" AS "notifications"
SET "project_uuid" = "projects"."uuid_id"
FROM "mitfloww"."projects" AS "projects"
WHERE "notifications"."project_uuid" IS NULL
  AND "notifications"."project_id" = "projects"."public_id";--> statement-breakpoint

ALTER TABLE "mitfloww"."files"
  DROP CONSTRAINT IF EXISTS "files_project_id_projects_id_fk";--> statement-breakpoint

ALTER TABLE "mitfloww"."notifications"
  DROP CONSTRAINT IF EXISTS "notifications_project_id_projects_id_fk";--> statement-breakpoint

ALTER TABLE "mitfloww"."file_revision_notes"
  DROP CONSTRAINT IF EXISTS "file_revision_notes_project_id_fk";--> statement-breakpoint

DROP INDEX IF EXISTS "mitfloww"."files_project_id_created_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "mitfloww"."notifications_project_id_idx";--> statement-breakpoint

ALTER TABLE "mitfloww"."projects"
  DROP CONSTRAINT IF EXISTS "projects_pkey";--> statement-breakpoint

ALTER TABLE "mitfloww"."projects"
  RENAME COLUMN "id" TO "legacy_id";--> statement-breakpoint

ALTER TABLE "mitfloww"."projects"
  RENAME COLUMN "uuid_id" TO "id";--> statement-breakpoint

ALTER TABLE "mitfloww"."projects"
  ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");--> statement-breakpoint

DROP INDEX IF EXISTS "mitfloww"."projects_uuid_id_unique_idx";--> statement-breakpoint

ALTER TABLE "mitfloww"."files"
  DROP COLUMN "project_id";--> statement-breakpoint

ALTER TABLE "mitfloww"."files"
  RENAME COLUMN "project_uuid" TO "project_id";--> statement-breakpoint

ALTER TABLE "mitfloww"."files"
  ADD CONSTRAINT "files_project_id_projects_id_fk"
  FOREIGN KEY ("project_id")
  REFERENCES "mitfloww"."projects"("id")
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;--> statement-breakpoint

CREATE INDEX "files_project_id_created_at_idx"
  ON "mitfloww"."files" ("project_id","created_at");--> statement-breakpoint

ALTER TABLE "mitfloww"."notifications"
  DROP COLUMN "project_id";--> statement-breakpoint

ALTER TABLE "mitfloww"."notifications"
  RENAME COLUMN "project_uuid" TO "project_id";--> statement-breakpoint

ALTER TABLE "mitfloww"."notifications"
  ADD CONSTRAINT "notifications_project_id_projects_id_fk"
  FOREIGN KEY ("project_id")
  REFERENCES "mitfloww"."projects"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;--> statement-breakpoint

CREATE INDEX "notifications_project_id_idx"
  ON "mitfloww"."notifications" ("project_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mitfloww"."revision_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "file_id" uuid NOT NULL,
  "file_version_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "body" text NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "created_by" varchar(255),
  "updated_by" varchar(255),
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "revision_comments_status_check"
    CHECK ("mitfloww"."revision_comments"."status" IN ('pending','resolved')),
  CONSTRAINT "revision_comments_file_id_fk"
    FOREIGN KEY ("file_id") REFERENCES "mitfloww"."files"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "revision_comments_file_version_id_fk"
    FOREIGN KEY ("file_version_id") REFERENCES "mitfloww"."file_versions"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "revision_comments_project_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "mitfloww"."projects"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mitfloww"."revision_comment_replies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "comment_id" uuid NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "revision_comment_replies_comment_id_fk"
    FOREIGN KEY ("comment_id") REFERENCES "mitfloww"."revision_comments"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "revision_comment_replies_comment_id_unique"
  ON "mitfloww"."revision_comment_replies" ("comment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revision_comments_file_version_created_at_idx"
  ON "mitfloww"."revision_comments" ("file_id","file_version_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revision_comments_project_id_idx"
  ON "mitfloww"."revision_comments" ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revision_comments_status_idx"
  ON "mitfloww"."revision_comments" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revision_comments_created_at_idx"
  ON "mitfloww"."revision_comments" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revision_comment_replies_comment_id_idx"
  ON "mitfloww"."revision_comment_replies" ("comment_id");--> statement-breakpoint

INSERT INTO "mitfloww"."revision_comments" (
  "id",
  "file_id",
  "file_version_id",
  "project_id",
  "body",
  "status",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at"
)
SELECT
  "frn"."id",
  "frn"."file_id",
  "frn"."file_version_id",
  "files"."project_id",
  "frn"."note",
  CASE
    WHEN "files"."current_version_id" = "frn"."file_version_id" THEN 'pending'
    ELSE 'resolved'
  END,
  "frn"."created_by",
  "frn"."updated_by",
  "frn"."created_at",
  "frn"."updated_at"
FROM "mitfloww"."file_revision_notes" AS "frn"
INNER JOIN "mitfloww"."files" AS "files"
  ON "files"."id" = "frn"."file_id"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "mitfloww"."revision_comment_replies" (
  "comment_id",
  "body",
  "created_at",
  "updated_at"
)
SELECT
  "frn"."id",
  "frn"."reply",
  COALESCE("frn"."replied_at", "frn"."updated_at", "frn"."created_at"),
  COALESCE("frn"."replied_at", "frn"."updated_at", "frn"."created_at")
FROM "mitfloww"."file_revision_notes" AS "frn"
WHERE "frn"."reply" IS NOT NULL
  AND btrim("frn"."reply") <> ''
ON CONFLICT ("comment_id") DO NOTHING;--> statement-breakpoint

DROP TABLE IF EXISTS "mitfloww"."file_revision_notes";--> statement-breakpoint

ALTER TABLE "mitfloww"."projects"
  DROP COLUMN "legacy_id";--> statement-breakpoint
