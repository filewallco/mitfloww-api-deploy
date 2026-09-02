ALTER TABLE mitfloww.file_versions
  DROP CONSTRAINT IF EXISTS file_versions_processing_status_check;

ALTER TABLE mitfloww.file_versions
  ADD CONSTRAINT file_versions_processing_status_check CHECK (
    processing_status IN (
      'queued',
      'processing',
      'uploading',
      'completed',
      'retrying',
      'failed',
      'corrupt',
      'skipped'
    )
  );