export const MANAGED_UPLOAD_STORAGE_KEY_PREFIX = "projects";
export const LEGACY_MANAGED_UPLOAD_STORAGE_KEY_PREFIX = "users";
export const LEGACY_ADMIN_STORAGE_KEY_PREFIX = "admin";
export const MANAGED_UPLOAD_OWNER = "admin";

function stripFileExtension(fileName: string) {
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
}

/**
 * Normalizes a free-form value into a storage-safe path segment.
 *
 * This is only used for leaf names such as filenames. Permanent storage paths
 * intentionally use stable IDs for project and file identity instead of any
 * editable title or display name.
 */
export function toStorageSegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildSafeFileName(originalName: string, extension: string) {
  const fileStem = toStorageSegment(stripFileExtension(originalName)) || "file";
  return `${fileStem}${extension}`;
}

function revisionFolder(revisionNumber: number) {
  return `r${String(revisionNumber).padStart(3, "0")}`;
}

function extractRevisionPrefix(storageKey: string) {
  const match = storageKey.match(/^(.*\/revisions\/r\d{3}\/)/);
  return match?.[1] ?? null;
}

function resolveRevisionPrefixFromOriginalKey(input: {
  originalStorageKey: string;
  revisionNumber: number;
}) {
  const extractedPrefix = extractRevisionPrefix(input.originalStorageKey);

  if (extractedPrefix) {
    return extractedPrefix;
  }

  const revision = revisionFolder(input.revisionNumber);
  const marker = `/revisions/${revision}/original/`;
  const root = input.originalStorageKey.includes(marker)
    ? input.originalStorageKey.split(marker)[0]
    : input.originalStorageKey.split("/original/")[0];

  return `${root}/revisions/${revision}/`;
}

/**
 * Builds the permanent file root prefix for managed uploads.
 *
 * New keys are prefixed with the owner's email address so each user's files
 * are isolated under their own namespace in R2. The immutable project and
 * file UUIDs follow so renaming never changes the storage identity.
 */
export function buildFileRootStoragePrefix(input: {
  fileId: string;
  projectId: string;
  userEmail?: string | null;
}) {
  const projectSegment = toStorageSegment(input.projectId) || "project";
  const fileSegment = toStorageSegment(input.fileId) || "file";
  const basePath = `${MANAGED_UPLOAD_STORAGE_KEY_PREFIX}/${projectSegment}/files/${fileSegment}`;

  if (input.userEmail) {
    const emailSegment = toStorageSegment(input.userEmail) || "user";
    return `${emailSegment}/${basePath}`;
  }

  return basePath;
}

/**
 * Builds the revision prefix for one permanent file revision.
 *
 * Every original upload, processed output, preview, and worker log for the
 * same revision lives under this prefix so revision deletion can safely remove
 * the whole folder without touching sibling revisions.
 */
export function buildRevisionStoragePrefix(input: {
  fileId: string;
  projectId: string;
  revisionNumber: number;
  userEmail?: string | null;
}) {
  return `${buildFileRootStoragePrefix(input)}/revisions/${revisionFolder(
    input.revisionNumber,
  )}/`;
}

/**
 * Builds the permanent original-object key for a managed upload revision.
 *
 * The object path uses stable IDs for project and file ownership while keeping
 * the original filename only as the terminal leaf for readability.
 */
export function buildManagedUploadStorageKey(input: {
  extension: string;
  fileId: string;
  originalName: string;
  projectId: string;
  revisionNumber?: number;
  userEmail?: string | null;
}) {
  const revisionPrefix = buildRevisionStoragePrefix({
    fileId: input.fileId,
    projectId: input.projectId,
    revisionNumber: input.revisionNumber ?? 1,
    userEmail: input.userEmail,
  });
  const fileName = buildSafeFileName(input.originalName, input.extension);

  return `${revisionPrefix}original/${fileName}`;
}

/**
 * Builds the processed-object key that stays alongside the original revision.
 *
 * Processed outputs reuse the original revision prefix so worker retries and
 * revision-prefix deletion remain stable even when filenames change.
 */
export function buildProcessedStorageKey(input: {
  originalStorageKey: string;
  originalName: string;
  processedExtension: string;
  revisionNumber: number;
}) {
  const revisionPrefix = resolveRevisionPrefixFromOriginalKey({
    originalStorageKey: input.originalStorageKey,
    revisionNumber: input.revisionNumber,
  });
  const fileName = buildSafeFileName(input.originalName, input.processedExtension);

  return `${revisionPrefix}processed/${fileName}`;
}

/**
 * Builds the worker log key for a processed revision attempt.
 *
 * Logs stay under the same revision prefix so cleanup can remove all artifacts
 * created for one revision without widening deletion to the full file root.
 */
export function buildProcessingLogStorageKey(input: {
  originalStorageKey: string;
  jobId: string;
  revisionNumber: number;
}) {
  const revisionPrefix = resolveRevisionPrefixFromOriginalKey({
    originalStorageKey: input.originalStorageKey,
    revisionNumber: input.revisionNumber,
  });

  return `${revisionPrefix}logs/${input.jobId}.json`;
}

/**
 * Derives the revision folder prefix from any managed object key.
 *
 * This is used by deletion flows to remove one revision's original, processed,
 * preview, and log artifacts together while keeping prefix deletion safely
 * scoped to a single `revisions/rNNN/` subtree.
 */
export function getRevisionStoragePrefixFromKey(storageKey: string) {
  return extractRevisionPrefix(storageKey);
}

/**
 * Returns whether a storage key belongs to the managed upload namespace.
 *
 * New writes use `<email>/projects/<projectId>/files/<fileId>/...` format.
 * Reads and cleanup still accept older `projects/...`, `users/...`, and
 * `admin/...` keys for backward compatibility with pre-existing objects.
 */
export function isManagedUploadStorageKey(key: string) {
  // TODO(storage): Migrate legacy `users/...` and `admin/...` objects to the
  // stable email-prefixed `projects/<projectId>/files/<fileId>/...` layout.
  if (
    key.startsWith(`${MANAGED_UPLOAD_STORAGE_KEY_PREFIX}/`) ||
    key.startsWith(`${LEGACY_MANAGED_UPLOAD_STORAGE_KEY_PREFIX}/`) ||
    key.startsWith(`${LEGACY_ADMIN_STORAGE_KEY_PREFIX}/`)
  ) {
    return true;
  }

  // New email-prefixed format: <email>/projects/<projectId>/files/<fileId>/...
  // Match any single path segment followed by /projects/
  return /^[^/]+\/projects\//.test(key);
}
