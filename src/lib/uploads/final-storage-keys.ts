export const USERS_STORAGE_KEY_PREFIX = "users";
export const MANAGED_UPLOAD_STORAGE_KEY_PREFIX = "projects";
export const LEGACY_MANAGED_UPLOAD_STORAGE_KEY_PREFIX = "users";
export const LEGACY_ADMIN_STORAGE_KEY_PREFIX = "admin";
export const DEFAULT_OWNER_ID = "default-owner";
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
 * Keys are prefixed with user_id inside the users root directory so each user's
 * files are isolated under their own namespace in R2:
 * `users/<userId>/projects/<projectId>/files/<fileId>`.
 */
export function buildFileRootStoragePrefix(input: {
  fileId: string;
  projectId: string;
  userEmail?: string | null;
  userId?: string | null;
}) {
  const userSegment =
    toStorageSegment(input.userId || input.userEmail || "") || DEFAULT_OWNER_ID;
  const projectSegment = toStorageSegment(input.projectId) || "project";
  const fileSegment = toStorageSegment(input.fileId) || "file";

  return `${USERS_STORAGE_KEY_PREFIX}/${userSegment}/${MANAGED_UPLOAD_STORAGE_KEY_PREFIX}/${projectSegment}/files/${fileSegment}`;
}

/**
 * Builds the storage key for user avatar upload in R2:
 * `users/<userId>/userprofile/avatar_<timestamp>.<ext>`
 */
export function buildUserProfileAvatarStorageKey(input: {
  userId: string;
  extension: string;
  timestamp?: number;
}) {
  const userSegment = toStorageSegment(input.userId) || DEFAULT_OWNER_ID;
  const ext = input.extension.startsWith(".") ? input.extension : `.${input.extension}`;
  const ts = input.timestamp ?? Date.now();
  return `${USERS_STORAGE_KEY_PREFIX}/${userSegment}/userprofile/avatar_${ts}${ext}`;
}

/**
 * Builds the storage key for company logo upload in R2:
 * `users/<userId>/userprofile/company_logo_<timestamp>.<ext>`
 */
export function buildCompanyLogoStorageKey(input: {
  userId: string;
  extension: string;
  timestamp?: number;
}) {
  const userSegment = toStorageSegment(input.userId) || DEFAULT_OWNER_ID;
  const ext = input.extension.startsWith(".") ? input.extension : `.${input.extension}`;
  const ts = input.timestamp ?? Date.now();
  return `${USERS_STORAGE_KEY_PREFIX}/${userSegment}/userprofile/company_logo_${ts}${ext}`;
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
  userId?: string | null;
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
  userId?: string | null;
}) {
  const revisionPrefix = buildRevisionStoragePrefix({
    fileId: input.fileId,
    projectId: input.projectId,
    revisionNumber: input.revisionNumber ?? 1,
    userEmail: input.userEmail,
    userId: input.userId,
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
  // Canonical user-scoped format: users/<userId>/projects/... or users/<userId>/userprofile/...
  if (key.startsWith(`${USERS_STORAGE_KEY_PREFIX}/`)) {
    return true;
  }

  // Legacy formats supported for backwards compatibility
  if (
    key.startsWith(`${MANAGED_UPLOAD_STORAGE_KEY_PREFIX}/`) ||
    key.startsWith(`${LEGACY_MANAGED_UPLOAD_STORAGE_KEY_PREFIX}/`) ||
    key.startsWith(`${LEGACY_ADMIN_STORAGE_KEY_PREFIX}/`)
  ) {
    return true;
  }

  // Legacy user-prefixed format: <userId>/projects/<projectId>/files/<fileId>/... or <userId>/userprofile/...
  return /^[^/]+\/(projects|userprofile)\//.test(key);
}
