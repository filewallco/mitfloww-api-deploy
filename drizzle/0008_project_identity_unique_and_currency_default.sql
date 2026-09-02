-- 1. Make INR the Postgres default for future projects.
ALTER TABLE mitfloww.projects
ALTER COLUMN currency SET DEFAULT 'INR';

-- 2. Safety cleanup for bad legacy currency values.
-- This only fixes empty/invalid values, not intentionally selected valid currencies.
UPDATE mitfloww.projects
SET
  currency = 'INR',
  updated_at = now()
WHERE currency IS NULL
   OR trim(currency) = ''
   OR currency !~ '^[A-Z]{3}$';

-- Optional:
-- Only run this if you are sure AUD was created by the old broken default
-- and no existing project intentionally uses AUD.
--
-- UPDATE mitfloww.projects
-- SET
--   currency = 'INR',
--   updated_at = now()
-- WHERE currency = 'AUD';

-- 3. Stop the migration if duplicate active projects already exist.
-- This catches:
-- "name"      vs "name "
-- "Name PRJ"  vs "name prj"
-- "name  prj" vs "name prj"
DO $$
DECLARE
  duplicate_summary text;
BEGIN
  SELECT string_agg(
    format(
      'title="%s", client="%s", count=%s, ids=%s',
      canonical_title,
      canonical_client_name,
      duplicate_count,
      project_ids
    ),
    E'\n'
  )
  INTO duplicate_summary
  FROM (
    SELECT
      lower(regexp_replace(btrim(title), '[[:space:]]+', ' ', 'g')) AS canonical_title,
      lower(regexp_replace(btrim(client_name), '[[:space:]]+', ' ', 'g')) AS canonical_client_name,
      count(*) AS duplicate_count,
      array_agg(id ORDER BY created_at)::text AS project_ids
    FROM mitfloww.projects
    WHERE deleted_at IS NULL
    GROUP BY
      lower(regexp_replace(btrim(title), '[[:space:]]+', ' ', 'g')),
      lower(regexp_replace(btrim(client_name), '[[:space:]]+', ' ', 'g'))
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_summary IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot create projects_active_title_client_unique_idx because duplicate active projects exist. Rename/merge duplicates first:%',
      E'\n' || duplicate_summary;
  END IF;
END $$;

-- 4. Normalize existing active project/client names after duplicate check.
UPDATE mitfloww.projects
SET
  title = regexp_replace(btrim(title), '[[:space:]]+', ' ', 'g'),
  client_name = regexp_replace(btrim(client_name), '[[:space:]]+', ' ', 'g'),
  updated_at = now()
WHERE deleted_at IS NULL;

-- 5. Enforce uniqueness for active projects by canonical project name + client name.
CREATE UNIQUE INDEX IF NOT EXISTS projects_active_title_client_unique_idx
ON mitfloww.projects (
  lower(regexp_replace(btrim(title), '[[:space:]]+', ' ', 'g')),
  lower(regexp_replace(btrim(client_name), '[[:space:]]+', ' ', 'g'))
)
WHERE deleted_at IS NULL;