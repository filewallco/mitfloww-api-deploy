CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE mitfloww.files
  ADD COLUMN IF NOT EXISTS current_version_id uuid;

CREATE TABLE IF NOT EXISTS mitfloww.file_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  file_id uuid NOT NULL REFERENCES mitfloww.files(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,

  original_name varchar(255) NOT NULL,
  mime_type varchar(255) NOT NULL,
  extension varchar(16) NOT NULL,
  size_bytes bigint NOT NULL,

  storage_bucket varchar(128) NOT NULL,
  storage_key text NOT NULL,

  processed_storage_bucket varchar(128),
  processed_storage_key text,
  processed_mime_type varchar(255),
  processed_extension varchar(16),
  processed_size_bytes bigint,

  processing_status varchar(32) NOT NULL DEFAULT 'queued',
  processing_job_id varchar(128),
  processing_error_code varchar(128),
  processing_error_message text,
  processing_attempts integer NOT NULL DEFAULT 0,

  queued_at timestamptz,
  processing_started_at timestamptz,
  processing_completed_at timestamptz,

  uploaded_by varchar(255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT file_versions_file_revision_unique UNIQUE (file_id, revision_number),
  CONSTRAINT file_versions_storage_key_unique UNIQUE (storage_key),
  CONSTRAINT file_versions_processed_storage_key_unique UNIQUE (processed_storage_key),
  CONSTRAINT file_versions_revision_number_check CHECK (revision_number >= 1),
  CONSTRAINT file_versions_processing_status_check CHECK (
    processing_status IN (
      'queued',
      'processing',
      'uploading',
      'completed',
      'retrying',
      'failed',
      'corrupt'
    )
  )
);

CREATE INDEX IF NOT EXISTS file_versions_file_id_idx
  ON mitfloww.file_versions(file_id);

CREATE INDEX IF NOT EXISTS file_versions_processing_job_id_idx
  ON mitfloww.file_versions(processing_job_id);

CREATE INDEX IF NOT EXISTS file_versions_processing_status_idx
  ON mitfloww.file_versions(processing_status);

CREATE INDEX IF NOT EXISTS files_current_version_id_idx
  ON mitfloww.files(current_version_id);

INSERT INTO mitfloww.file_versions (
  file_id,
  revision_number,
  original_name,
  mime_type,
  extension,
  size_bytes,
  storage_bucket,
  storage_key,
  processing_status,
  uploaded_by,
  created_at,
  updated_at
)
SELECT
  f.id,
  1,
  f.original_name,
  f.mime_type,
  f.extension,
  f.size_bytes,
  f.storage_bucket,
  f.storage_key,
  'queued',
  f.uploaded_by,
  f.created_at,
  f.updated_at
FROM mitfloww.files f
WHERE NOT EXISTS (
  SELECT 1
  FROM mitfloww.file_versions fv
  WHERE fv.file_id = f.id
    AND fv.revision_number = 1
);

UPDATE mitfloww.files f
SET current_version_id = fv.id
FROM mitfloww.file_versions fv
WHERE fv.file_id = f.id
  AND fv.revision_number = 1
  AND f.current_version_id IS NULL;

ALTER TABLE mitfloww.files
  DROP CONSTRAINT IF EXISTS files_current_version_id_fk;

ALTER TABLE mitfloww.files
  ADD CONSTRAINT files_current_version_id_fk
  FOREIGN KEY (current_version_id)
  REFERENCES mitfloww.file_versions(id)
  ON DELETE SET NULL;