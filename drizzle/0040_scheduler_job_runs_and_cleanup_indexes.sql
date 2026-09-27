-- MitFloww Scheduler Execution Audit Table & Production Indexes
CREATE TABLE IF NOT EXISTS "mitfloww"."scheduler_job_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "execution_id" varchar(255) NOT NULL,
  "job_name" varchar(128) NOT NULL,
  "status" varchar(32) NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "duration_ms" integer,
  "records_scanned" integer NOT NULL DEFAULT 0,
  "records_eligible" integer NOT NULL DEFAULT 0,
  "records_processed" integer NOT NULL DEFAULT 0,
  "records_deleted" integer NOT NULL DEFAULT 0,
  "records_skipped" integer NOT NULL DEFAULT 0,
  "records_failed" integer NOT NULL DEFAULT 0,
  "error_message" text,
  "details" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Audit Table Performance Indexes
CREATE INDEX IF NOT EXISTS "scheduler_job_runs_job_name_idx" 
  ON "mitfloww"."scheduler_job_runs" ("job_name");
CREATE INDEX IF NOT EXISTS "scheduler_job_runs_started_at_idx" 
  ON "mitfloww"."scheduler_job_runs" ("started_at" DESC);

-- Scheduler Query Performance Indexes
CREATE INDEX IF NOT EXISTS "projects_share_expires_at_idx" 
  ON "mitfloww"."projects" ("share_expires_at")
  WHERE "share_expires_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "users_deleted_at_idx" 
  ON "mitfloww"."users" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "file_versions_orphaned_cleanup_idx" 
  ON "mitfloww"."file_versions" ("processing_status", "updated_at")
  WHERE "processed_storage_key" IS NOT NULL;
