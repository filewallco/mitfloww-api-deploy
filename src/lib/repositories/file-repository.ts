import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  ilike,
  lte,
  not,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  fileVersions,
  files,
  fileVersionReports,
  FileApprovalStatus,
  FileProcessingStatus,
  FileVersionReportStatus,
  revisionComments,
  revisionCommentMarkers,
  revisionCommentItems,
  type FileRecord,
  type FileVersionReportRecord,
  type FileVersionRecord,
} from "@/lib/db/schema";
import { FileUploadStatus } from "@/lib/dto/file-contracts";
import type { UpdatableFileUploadStatus } from "@/lib/dto/file-contracts";
import { buildContainsSearchPattern } from "@/lib/query/search";
import type {
  FileListRepositoryQuery,
  FileSortField,
  FileTypeFilter,
} from "@/lib/query/files";
import type { SortOrder } from "@/lib/query/sorting";

export type CreateFileRecordInput = {
  extension: string;
  id?: string;
  mimeType: string;
  name: string;
  nameSourceLocale: string;
  originalName: string;
  projectId: string;
  sizeBytes: number;
  storageBucket: string;
  storageKey: string;
  uploadedBy: string | null;
  uploadStatus: FileUploadStatus;
};

export type CreateLogicalFileRecordInput = Omit<
  CreateFileRecordInput,
  | "extension"
  | "mimeType"
  | "originalName"
  | "sizeBytes"
  | "storageBucket"
  | "storageKey"
> & {
  id: string;
};

export type CreateFileVersionRecordInput = {
  extension: string;
  isFinalDraft?: boolean;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageBucket: string;
  storageKey: string;
  uploadedBy: string | null;
  revisionDescription?: string | null;
  revisionDescriptionSourceLocale?: string | null;
  revisionNumber: number;
  watermarkEnabled?: boolean;
  useSoftWatermark?: boolean;
  processingStatus?: FileVersionRecord["processingStatus"];
  processingJobId?: string | null;
  processingAttempts?: number;
  queuedAt?: Date | null;
};

export type UpdateFileVersionProcessingInput = Partial<{
  processedStorageBucket: string | null;
  processedStorageKey: string | null;
  processedMimeType: string | null;
  processedExtension: string | null;
  processedSizeBytes: number | null;
  processingStatus: FileVersionRecord["processingStatus"];
  processingJobId: string | null;
  processingErrorCode: string | null;
  processingErrorMessage: string | null;
  processingAttempts: number;
  queuedAt: Date | null;
  processingStartedAt: Date | null;
  processingCompletedAt: Date | null;
  updatedAt: Date;
}>;

export type UpdateFileVersionInput = Partial<
  Pick<
    FileVersionRecord,
    | "deleteReason"
    | "deletedAt"
    | "deletedBy"
    | "finalDraftDownloadCount"
    | "finalDraftDownloadedAt"
    | "previewPurgedAt"
    | "previewRetentionUntil"
    | "previewStorageBucket"
    | "previewStorageKey"
    | "processedExtension"
    | "processedMimeType"
    | "processedSizeBytes"
    | "processedStorageBucket"
    | "processedStorageKey"
    | "processingAttempts"
    | "processingCompletedAt"
    | "processingErrorCode"
    | "processingErrorMessage"
    | "processingJobId"
    | "processingStartedAt"
    | "processingStatus"
    | "queuedAt"
    | "updatedAt"
    | "storageBucket"
    | "storageKey"
    | "mimeType"
    | "extension"
    | "sizeBytes"
  >
>;

export type UpdateFileRecordInput = Partial<
  Omit<
    Pick<CreateFileRecordInput, "name" | "projectId" | "uploadStatus">,
    "uploadStatus"
  >
> & {
  approvalStatus?: FileRecord["approvalStatus"];
  approvedVersionId?: string | null;
  currentVersionId?: string | null;
  extension?: string;
  finalDraftReportMessage?: string | null;
  finalDraftReportSourceLocale?: string;
  finalDraftReportReason?: string | null;
  finalDraftReportStatus?: FileRecord["finalDraftReportStatus"];
  finalDraftReportedAt?: Date | null;
  finalDraftVersionId?: string | null;
  mimeType?: string;
  nameSourceLocale?: string;
  originalName?: string;
  sizeBytes?: number;
  storageBucket?: string;
  storageKey?: string;
  uploadStatus?: UpdatableFileUploadStatus;
  uploadedBy?: string | null;
  updatedAt?: Date;
};

export type FindManyFilesParams = FileListRepositoryQuery & {
  includeDeleted?: boolean;
};

type FileListRecord = Pick<
  FileRecord,
  | "approvalStatus"
  | "approvedVersionId"
  | "createdAt"
  | "currentVersionId"
  | "deletedAt"
  | "extension"
  | "finalDraftVersionId"
  | "finalDraftReportMessage"
  | "finalDraftReportReason"
  | "finalDraftReportStatus"
  | "finalDraftReportedAt"
  | "id"
  | "mimeType"
  | "name"
  | "nameSourceLocale"
  | "originalName"
  | "projectId"
  | "sizeBytes"
  | "updatedAt"
  | "uploadedBy"
  | "uploadStatus"
  | "finalDraftReportSourceLocale"
>;

export type FindManyFilesResult = {
  records: FileListRecord[];
  total: number | null;
};

export type FileWithVersionsRecord = {
  file: FileRecord;
  versions: FileVersionRecord[];
};

export type FileSafetySummary = {
  activeVersionCount: number;
  activeVersionCommentCount: number;
  activeVersionReportCount: number;
  fileId: string;
  unresolvedVersionReportCount: number;
};

export type FileVersionSafetySummary = {
  commentCount: number;
  fileVersionId: string;
  latestReportStatus: FileVersionReportStatus | null;
  unresolvedReportCount: number;
};

export type ProjectFileNavigationRecord = Pick<
  FileRecord,
  | "approvalStatus"
  | "createdAt"
  | "extension"
  | "id"
  | "name"
  | "nameSourceLocale"
  | "updatedAt"
>;

export type ProjectWorkflowSummary = {
  activeFileCount: number;
  allFilesHaveFinalDrafts: boolean;
  filesMissingFinalDraftCount: number;
  unresolvedFinalDraftReportCount?: number;
  finalDraftProcessingIncompleteCount?: number;
  hasAnyApprovedRevision: boolean;
};

export type CreateFileVersionReportInput = {
  fileId: string;
  fileVersionId: string;
  message?: string | null;
  projectId: string;
  reason: string;
  sourceLocale: string;
  status?: FileVersionReportStatus;
};

export interface FileRepository {
  countActiveByProjectId(projectId: string): Promise<number>;

  create(input: CreateFileRecordInput): Promise<FileRecord>;

  createWithInitialVersion(input: {
    file: CreateLogicalFileRecordInput;
    version: CreateFileVersionRecordInput;
  }): Promise<{ file: FileRecord; version: FileVersionRecord }>;

  appendVersion(input: {
    fileId: string;
    markAsFinalDraft?: boolean;
    version: Omit<CreateFileVersionRecordInput, "revisionNumber">;
  }): Promise<{ file: FileRecord; version: FileVersionRecord } | null>;

  hardDeleteVersion(input: {
    fileId: string;
    fileUpdate: UpdateFileRecordInput;
    versionId: string;
  }): Promise<{ file: FileRecord; versionId: string } | null>;

  findById(
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<FileRecord | null>;

  findByStorageKey(
    storageKey: string,
    options?: { includeDeleted?: boolean },
  ): Promise<FileRecord | null>;

  findWithVersionsById(
    id: string,
    options?: {
      includeDeleted?: boolean;
      includeDeletedVersions?: boolean;
    },
  ): Promise<FileWithVersionsRecord | null>;

  findFileWithVersionByStorageKey(
    storageKey: string,
    options?: { includeDeleted?: boolean },
  ): Promise<{ file: FileRecord; version: FileVersionRecord | null } | null>;

  findVersionById(
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<FileVersionRecord | null>;

  findVersionsByIds(ids: string[]): Promise<FileVersionRecord[]>;

  findVersionByProcessingJobId(
    jobId: string,
  ): Promise<FileVersionRecord | null>;

  findFileSafetySummaries(fileIds: string[]): Promise<FileSafetySummary[]>;
  countProjectAddedRevisions(projectId: string): Promise<number>;
  countProjectBillableRevisions(projectId: string): Promise<number>;

  findVersionSafetySummaries(
    fileId: string,
  ): Promise<FileVersionSafetySummary[]>;

  findProjectFileNavigation(
    projectId: string,
  ): Promise<ProjectFileNavigationRecord[]>;

  getProjectWorkflowSummary(projectId: string): Promise<ProjectWorkflowSummary>;

  createVersionReport(
    input: CreateFileVersionReportInput,
  ): Promise<FileVersionReportRecord>;

  findUnresolvedVersionReportCountByFileId(fileId: string): Promise<number>;

  findVersionsPendingPreviewPurge(input: {
    limit?: number;
    now: Date;
  }): Promise<FileVersionRecord[]>;

  findStaleProcessingVersions(staleBefore: Date): Promise<FileVersionRecord[]>;

  findActiveProcessingVersionsByProjectId(
    projectId: string,
  ): Promise<FileVersionRecord[]>;

  findActiveUploadingFilesByProjectId(
    projectId: string,
  ): Promise<FileRecord[]>;

  updateVersionProcessingResult(
    id: string,
    input: UpdateFileVersionProcessingInput,
  ): Promise<FileVersionRecord | null>;

  updateVersion(
    id: string,
    input: UpdateFileVersionInput,
  ): Promise<FileVersionRecord | null>;

  markVersionDownloaded(
    id: string,
    downloadedAt: Date,
  ): Promise<FileVersionRecord | null>;

  softDeleteVersion(input: {
    fileId: string;
    fileUpdate: UpdateFileRecordInput;
    versionId: string;
    versionUpdate: UpdateFileVersionInput;
  }): Promise<{ file: FileRecord; version: FileVersionRecord } | null>;

  findMany(params: FindManyFilesParams): Promise<FindManyFilesResult>;

  hardDeleteWithVersions(id: string): Promise<FileRecord | null>;

  softDelete(id: string, deletedAt: Date): Promise<FileRecord | null>;

  softDeleteWithVersions(id: string, deletedAt?: Date): Promise<FileRecord | null>;

  update(id: string, input: UpdateFileRecordInput): Promise<FileRecord | null>;
}

const ARCHIVE_MIME_TYPES = [
  "application/gzip",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/zip",
] as const;

function getFileTypeCondition(fileType: FileTypeFilter) {
  const imageCondition = ilike(files.mimeType, "image/%");
  const videoCondition = ilike(files.mimeType, "video/%");
  const archiveCondition = inArray(files.mimeType, ARCHIVE_MIME_TYPES);

  switch (fileType) {
    case "image":
      return imageCondition;
    case "video":
      return videoCondition;
    case "archive":
      return archiveCondition;
    case "document":
    default:
      return and(
        not(imageCondition),
        not(videoCondition),
        not(archiveCondition),
      );
  }
}

function getSortColumn(sortField: FileSortField) {
  switch (sortField) {
    case "createdAt":
      return files.createdAt;
    case "name":
      return files.name;
    case "sizeBytes":
      return files.sizeBytes;
    case "updatedAt":
      return files.updatedAt;
  }
}

function getOrderExpression(sortField: FileSortField, order: SortOrder) {
  const sortColumn = getSortColumn(sortField);
  const orderBy = order === "asc" ? asc : desc;

  return [orderBy(sortColumn), orderBy(files.id)] as const;
}

const FILE_LIST_COLUMNS = {
  approvalStatus: files.approvalStatus,
  approvedVersionId: files.approvedVersionId,
  createdAt: files.createdAt,
  currentVersionId: files.currentVersionId,
  deletedAt: files.deletedAt,
  extension: files.extension,
  finalDraftVersionId: files.finalDraftVersionId,
  finalDraftReportMessage: files.finalDraftReportMessage,
  finalDraftReportReason: files.finalDraftReportReason,
  finalDraftReportStatus: files.finalDraftReportStatus,
  finalDraftReportedAt: files.finalDraftReportedAt,
  id: files.id,
  mimeType: files.mimeType,
  name: files.name,
  nameSourceLocale: files.nameSourceLocale,
  originalName: files.originalName,
  projectId: files.projectId,
  sizeBytes: files.sizeBytes,
  updatedAt: files.updatedAt,
  uploadedBy: files.uploadedBy,
  uploadStatus: files.uploadStatus,
  finalDraftReportSourceLocale: files.finalDraftReportSourceLocale,
} as const;

export class DrizzleFileRepository implements FileRepository {
  async countActiveByProjectId(projectId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(files)
      .where(and(eq(files.projectId, projectId), isNull(files.deletedAt)));

    return Number(result?.count ?? 0);
  }

  async create(input: CreateFileRecordInput): Promise<FileRecord> {
    const [record] = await db.insert(files).values(input).returning();

    if (!record) {
      throw new Error("Failed to create file record.");
    }

    return record;
  }

  async createWithInitialVersion(input: {
    file: CreateLogicalFileRecordInput;
    version: CreateFileVersionRecordInput;
  }): Promise<{ file: FileRecord; version: FileVersionRecord }> {
    return db.transaction(async (tx) => {
      const [file] = await tx
        .insert(files)
        .values({
          ...input.file,

          // Compatibility mirror.
          originalName: input.version.originalName,
          mimeType: input.version.mimeType,
          extension: input.version.extension,
          sizeBytes: input.version.sizeBytes,
          storageBucket: input.version.storageBucket,
          storageKey: input.version.storageKey,
        })
        .returning();

      if (!file) {
        throw new Error("Failed to create file record.");
      }

      const [version] = await tx
        .insert(fileVersions)
        .values({
          fileId: file.id,
          revisionNumber: input.version.revisionNumber,
          revisionDescription: input.version.revisionDescription ?? null,
          revisionDescriptionSourceLocale:
            input.version.revisionDescriptionSourceLocale ?? null,
          originalName: input.version.originalName,
          mimeType: input.version.mimeType,
          extension: input.version.extension,
          sizeBytes: input.version.sizeBytes,
          storageBucket: input.version.storageBucket,
          storageKey: input.version.storageKey,
          uploadedBy: input.version.uploadedBy,
          watermarkEnabled: input.version.watermarkEnabled ?? false,
          useSoftWatermark: input.version.useSoftWatermark ?? false,
          isFinalDraft: input.version.isFinalDraft ?? false,
          processingStatus:
            input.version.processingStatus ?? FileProcessingStatus.Queued,
          processingJobId: input.version.processingJobId ?? null,
          processingAttempts: input.version.processingAttempts ?? 0,
          queuedAt: input.version.queuedAt ?? null,
        })
        .returning();

      if (!version) {
        throw new Error("Failed to create file version record.");
      }

      const [updatedFile] = await tx
        .update(files)
        .set({
          currentVersionId: version.id,
          updatedAt: new Date(),
        })
        .where(eq(files.id, file.id))
        .returning();

      return {
        file: updatedFile ?? file,
        version,
      };
    });
  }

  async appendVersion(input: {
    fileId: string;
    markAsFinalDraft?: boolean;
    version: Omit<CreateFileVersionRecordInput, "revisionNumber">;
  }): Promise<{ file: FileRecord; version: FileVersionRecord } | null> {
    return db.transaction(async (tx) => {
      const [existingFile] = await tx
        .select()
        .from(files)
        .where(and(eq(files.id, input.fileId), isNull(files.deletedAt)))
        .limit(1);

      if (!existingFile) {
        return null;
      }

      const [revisionResult] = await tx
        .select({
          maxRevisionNumber: sql<number>`coalesce(max(${fileVersions.revisionNumber}), 0)`,
        })
        .from(fileVersions)
        .where(eq(fileVersions.fileId, input.fileId));

      const nextRevisionNumber =
        Number(revisionResult?.maxRevisionNumber ?? 0) + 1;

      const [version] = await tx
        .insert(fileVersions)
        .values({
          fileId: input.fileId,
          revisionNumber: nextRevisionNumber,
          revisionDescription: input.version.revisionDescription ?? null,
          revisionDescriptionSourceLocale:
            input.version.revisionDescriptionSourceLocale ?? null,
          originalName: input.version.originalName,
          mimeType: input.version.mimeType,
          extension: input.version.extension,
          sizeBytes: input.version.sizeBytes,
          storageBucket: input.version.storageBucket,
          storageKey: input.version.storageKey,
          uploadedBy: input.version.uploadedBy,
          watermarkEnabled: input.version.watermarkEnabled ?? false,
          useSoftWatermark: input.version.useSoftWatermark ?? false,
          isFinalDraft:
            input.version.isFinalDraft ?? input.markAsFinalDraft ?? false,
          processingStatus:
            input.version.processingStatus ?? FileProcessingStatus.Queued,
          processingJobId: input.version.processingJobId ?? null,
          processingAttempts: input.version.processingAttempts ?? 0,
          queuedAt: input.version.queuedAt ?? null,
        })
        .returning();

      if (!version) {
        throw new Error("Failed to create file version record.");
      }

      const [updatedFile] = await tx
        .update(files)
        .set({
          approvalStatus: input.markAsFinalDraft
            ? FileApprovalStatus.Approved
            : existingFile.approvalStatus,
          approvedVersionId: input.markAsFinalDraft
            ? version.id
            : existingFile.approvedVersionId,
          currentVersionId: version.id,
          extension: version.extension,
          finalDraftVersionId: input.markAsFinalDraft
            ? version.id
            : existingFile.finalDraftVersionId,
          mimeType: version.mimeType,
          originalName: version.originalName,
          sizeBytes: version.sizeBytes,
          storageBucket: version.storageBucket,
          storageKey: version.storageKey,
          uploadStatus: FileUploadStatus.Uploaded,
          uploadedBy: version.uploadedBy,
          updatedAt: new Date(),
        })
        .where(eq(files.id, input.fileId))
        .returning();

      return {
        file: updatedFile ?? existingFile,
        version,
      };
    });
  }

  async findFileWithVersionByStorageKey(
    storageKey: string,
    options?: { includeDeleted?: boolean },
  ): Promise<{ file: FileRecord; version: FileVersionRecord | null } | null> {
    const versionConditions: SQL[] = [eq(fileVersions.storageKey, storageKey)];

    if (!options?.includeDeleted) {
      versionConditions.push(isNull(files.deletedAt));
    }

    const [versionRow] = await db
      .select({
        file: files,
        version: fileVersions,
      })
      .from(fileVersions)
      .innerJoin(files, eq(fileVersions.fileId, files.id))
      .where(and(...versionConditions))
      .limit(1);

    if (versionRow) {
      return versionRow;
    }

    const legacyFile = await this.findByStorageKey(storageKey, options);

    return legacyFile
      ? {
        file: legacyFile,
        version: null,
      }
      : null;
  }

  async findVersionById(
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<FileVersionRecord | null> {
    const whereClause = options?.includeDeleted
      ? eq(fileVersions.id, id)
      : and(eq(fileVersions.id, id), isNull(fileVersions.deletedAt));

    const [record] = await db
      .select()
      .from(fileVersions)
      .where(whereClause)
      .limit(1);

    return record ?? null;
  }

  async findVersionsByIds(ids: string[]): Promise<FileVersionRecord[]> {
    if (ids.length === 0) {
      return [];
    }

    return db.select().from(fileVersions).where(inArray(fileVersions.id, ids));
  }

  async findVersionByProcessingJobId(
    jobId: string,
  ): Promise<FileVersionRecord | null> {
    const [record] = await db
      .select()
      .from(fileVersions)
      .where(eq(fileVersions.processingJobId, jobId))
      .limit(1);

    return record ?? null;
  }

  async findStaleProcessingVersions(
    staleBefore: Date,
  ): Promise<FileVersionRecord[]> {
    return await db
      .select()
      .from(fileVersions)
      .where(
        and(
          or(
            eq(fileVersions.processingStatus, FileProcessingStatus.Queued),
            eq(fileVersions.processingStatus, FileProcessingStatus.Processing),
            eq(fileVersions.processingStatus, FileProcessingStatus.Retrying),
          ),
          lte(fileVersions.updatedAt, staleBefore),
          isNull(fileVersions.deletedAt),
        ),
      );
  }

  async findActiveProcessingVersionsByProjectId(
    projectId: string,
  ): Promise<FileVersionRecord[]> {
    return await db
      .select({
        id: fileVersions.id,
        fileId: fileVersions.fileId,
        revisionNumber: fileVersions.revisionNumber,
        revisionDescription: fileVersions.revisionDescription,
        revisionDescriptionSourceLocale:
          fileVersions.revisionDescriptionSourceLocale,
        originalName: fileVersions.originalName,
        mimeType: fileVersions.mimeType,
        extension: fileVersions.extension,
        sizeBytes: fileVersions.sizeBytes,
        storageBucket: fileVersions.storageBucket,
        storageKey: fileVersions.storageKey,
        processedStorageBucket: fileVersions.processedStorageBucket,
        processedStorageKey: fileVersions.processedStorageKey,
        processedMimeType: fileVersions.processedMimeType,
        processedExtension: fileVersions.processedExtension,
        processedSizeBytes: fileVersions.processedSizeBytes,
        watermarkEnabled: fileVersions.watermarkEnabled,
        useSoftWatermark: fileVersions.useSoftWatermark,
        isFinalDraft: fileVersions.isFinalDraft,
        finalDraftDownloadedAt: fileVersions.finalDraftDownloadedAt,
        finalDraftDownloadCount: fileVersions.finalDraftDownloadCount,
        previewRetentionUntil: fileVersions.previewRetentionUntil,
        previewPurgedAt: fileVersions.previewPurgedAt,
        previewStorageBucket: fileVersions.previewStorageBucket,
        previewStorageKey: fileVersions.previewStorageKey,
        deletedAt: fileVersions.deletedAt,
        deletedBy: fileVersions.deletedBy,
        deleteReason: fileVersions.deleteReason,
        processingStatus: fileVersions.processingStatus,
        processingJobId: fileVersions.processingJobId,
        processingErrorCode: fileVersions.processingErrorCode,
        processingErrorMessage: fileVersions.processingErrorMessage,
        processingAttempts: fileVersions.processingAttempts,
        queuedAt: fileVersions.queuedAt,
        processingStartedAt: fileVersions.processingStartedAt,
        processingCompletedAt: fileVersions.processingCompletedAt,
        uploadedBy: fileVersions.uploadedBy,
        createdAt: fileVersions.createdAt,
        updatedAt: fileVersions.updatedAt,
      })
      .from(fileVersions)
      .innerJoin(files, eq(fileVersions.fileId, files.id))
      .where(
        and(
          eq(files.projectId, projectId),
          isNull(files.deletedAt),
          isNull(fileVersions.deletedAt),
          or(
            eq(fileVersions.processingStatus, FileProcessingStatus.Queued),
            eq(fileVersions.processingStatus, FileProcessingStatus.Processing),
            eq(fileVersions.processingStatus, FileProcessingStatus.Retrying),
            eq(fileVersions.processingStatus, FileProcessingStatus.Uploading),
          ),
        ),
      );
  }

  async findActiveUploadingFilesByProjectId(
    projectId: string,
  ): Promise<FileRecord[]> {
    return await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.projectId, projectId),
          isNull(files.deletedAt),
          eq(files.uploadStatus, FileUploadStatus.Pending),
        ),
      );
  }

  async updateVersionProcessingResult(
    id: string,
    input: UpdateFileVersionProcessingInput,
  ): Promise<FileVersionRecord | null> {
    const [record] = await db
      .update(fileVersions)
      .set(input)
      .where(eq(fileVersions.id, id))
      .returning();

    return record ?? null;
  }

  async updateVersion(
    id: string,
    input: UpdateFileVersionInput,
  ): Promise<FileVersionRecord | null> {
    const [record] = await db
      .update(fileVersions)
      .set(input)
      .where(eq(fileVersions.id, id))
      .returning();

    return record ?? null;
  }

  async markVersionDownloaded(
    id: string,
    downloadedAt: Date,
  ): Promise<FileVersionRecord | null> {
    const [record] = await db
      .update(fileVersions)
      .set({
        finalDraftDownloadCount: sql`${fileVersions.finalDraftDownloadCount} + 1`,
        finalDraftDownloadedAt: sql`coalesce(${fileVersions.finalDraftDownloadedAt}, ${downloadedAt})`,
        updatedAt: downloadedAt,
      })
      .where(eq(fileVersions.id, id))
      .returning();

    return record ?? null;
  }

  async findById(
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<FileRecord | null> {
    const whereClause = options?.includeDeleted
      ? eq(files.id, id)
      : and(eq(files.id, id), isNull(files.deletedAt));

    const [record] = await db.select().from(files).where(whereClause).limit(1);

    return record ?? null;
  }

  async findByStorageKey(
    storageKey: string,
    options?: { includeDeleted?: boolean },
  ): Promise<FileRecord | null> {
    const whereClause = options?.includeDeleted
      ? eq(files.storageKey, storageKey)
      : and(eq(files.storageKey, storageKey), isNull(files.deletedAt));

    const [record] = await db.select().from(files).where(whereClause).limit(1);

    return record ?? null;
  }

  async findWithVersionsById(
    id: string,
    options?: {
      includeDeleted?: boolean;
      includeDeletedVersions?: boolean;
    },
  ): Promise<FileWithVersionsRecord | null> {
    const file = await this.findById(id, options);

    if (!file) {
      return null;
    }

    const versionConditions: SQL[] = [eq(fileVersions.fileId, id)];

    if (!options?.includeDeletedVersions) {
      versionConditions.push(isNull(fileVersions.deletedAt));
    }

    const versions = await db
      .select()
      .from(fileVersions)
      .where(and(...versionConditions))
      .orderBy(desc(fileVersions.revisionNumber), desc(fileVersions.createdAt));

    return {
      file,
      versions,
    };
  }

  async findFileSafetySummaries(
    fileIds: string[],
  ): Promise<FileSafetySummary[]> {
    if (fileIds.length === 0) {
      return [];
    }

    const unresolvedStatuses = [
      FileVersionReportStatus.Reported,
      FileVersionReportStatus.UnderReview,
    ];

    const activeVersionsByFile = db
      .select({
        activeVersionCount:
          sql<number>`cast(count(*) as int)`.as("activeVersionCount"),
        fileId: fileVersions.fileId,
      })
      .from(fileVersions)
      .where(
        and(
          inArray(fileVersions.fileId, fileIds),
          isNull(fileVersions.deletedAt),
        ),
      )
      .groupBy(fileVersions.fileId)
      .as("active_versions_by_file");

    const unresolvedReportsByFile = db
      .select({
        fileId: fileVersionReports.fileId,
        unresolvedVersionReportCount:
          sql<number>`cast(count(*) as int)`.as(
            "unresolvedVersionReportCount",
          ),
      })
      .from(fileVersionReports)
      .innerJoin(
        fileVersions,
        eq(fileVersionReports.fileVersionId, fileVersions.id),
      )
      .where(
        and(
          inArray(fileVersionReports.fileId, fileIds),
          inArray(fileVersionReports.status, unresolvedStatuses),
          isNull(fileVersions.deletedAt),
        ),
      )
      .groupBy(fileVersionReports.fileId)
      .as("unresolved_reports_by_file");

    const commentCountsByFile = db
      .select({
        activeVersionCommentCount:
          sql<number>`cast(count(*) as int)`.as("activeVersionCommentCount"),
        fileId: revisionComments.fileId,
      })
      .from(revisionComments)
      .innerJoin(
        fileVersions,
        eq(revisionComments.fileVersionId, fileVersions.id),
      )
      .where(
        and(
          inArray(revisionComments.fileId, fileIds),
          isNull(revisionComments.deletedAt),
          isNull(fileVersions.deletedAt),
        ),
      )
      .groupBy(revisionComments.fileId)
      .as("comment_counts_by_file");

    const versionReportsByFile = db
      .select({
        activeVersionReportCount:
          sql<number>`cast(count(*) as int)`.as("activeVersionReportCount"),
        fileId: fileVersionReports.fileId,
      })
      .from(fileVersionReports)
      .innerJoin(
        fileVersions,
        eq(fileVersionReports.fileVersionId, fileVersions.id),
      )
      .where(
        and(
          inArray(fileVersionReports.fileId, fileIds),
          isNull(fileVersions.deletedAt),
        ),
      )
      .groupBy(fileVersionReports.fileId)
      .as("version_reports_by_file");

    const rows = await db
      .select({
        activeVersionCount: sql<number>`coalesce(${activeVersionsByFile.activeVersionCount}, 0)`,
        activeVersionCommentCount:
          sql<number>`coalesce(${commentCountsByFile.activeVersionCommentCount}, 0)`,
        activeVersionReportCount:
          sql<number>`coalesce(${versionReportsByFile.activeVersionReportCount}, 0)`,
        fileId: files.id,
        unresolvedVersionReportCount: sql<number>`coalesce(${unresolvedReportsByFile.unresolvedVersionReportCount}, 0)`,
      })
      .from(files)
      .leftJoin(activeVersionsByFile, eq(activeVersionsByFile.fileId, files.id))
      .leftJoin(commentCountsByFile, eq(commentCountsByFile.fileId, files.id))
      .leftJoin(
        unresolvedReportsByFile,
        eq(unresolvedReportsByFile.fileId, files.id),
      )
      .leftJoin(versionReportsByFile, eq(versionReportsByFile.fileId, files.id))
      .where(inArray(files.id, fileIds));

    return rows.map((row) => ({
      activeVersionCount: Number(row.activeVersionCount ?? 0),
      activeVersionCommentCount: Number(row.activeVersionCommentCount ?? 0),
      activeVersionReportCount: Number(row.activeVersionReportCount ?? 0),
      fileId: row.fileId,
      unresolvedVersionReportCount: Number(
        row.unresolvedVersionReportCount ?? 0,
      ),
    }));
  }

  async countProjectAddedRevisions(projectId: string): Promise<number> {
    const [result] = await db
      .select({
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(fileVersions)
      .innerJoin(files, eq(fileVersions.fileId, files.id))
      .where(
        and(
          eq(files.projectId, projectId),
          isNull(files.deletedAt),

          // Revision usage is project-wide and should continue counting
          // versions that were later hidden from review history.
          gt(fileVersions.revisionNumber, 1),
          eq(fileVersions.isFinalDraft, false),
        ),
      );

    return Number(result?.count ?? 0);
  }

  async countProjectBillableRevisions(projectId: string): Promise<number> {
    const [result] = await db
      .select({
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(fileVersions)
      .innerJoin(files, eq(fileVersions.fileId, files.id))
      .where(
        and(
          eq(files.projectId, projectId),
          isNull(files.deletedAt),
          isNull(fileVersions.deletedAt),
          eq(fileVersions.isFinalDraft, false),
          gt(fileVersions.revisionNumber, 1),
        ),
      );

    return Number(result?.count ?? 0);
  }

  async findVersionSafetySummaries(
    fileId: string,
  ): Promise<FileVersionSafetySummary[]> {
    const unresolvedStatuses = [
      FileVersionReportStatus.Reported,
      FileVersionReportStatus.UnderReview,
    ];

    const commentCounts = db
      .select({
        commentCount: sql<number>`cast(count(*) as int)`.as("commentCount"),
        fileVersionId: revisionComments.fileVersionId,
      })
      .from(revisionComments)
      .where(
        and(
          eq(revisionComments.fileId, fileId),
          isNull(revisionComments.deletedAt),
        ),
      )
      .groupBy(revisionComments.fileVersionId)
      .as("comment_counts");

    const unresolvedReportCounts = db
      .select({
        fileVersionId: fileVersionReports.fileVersionId,
        unresolvedReportCount:
          sql<number>`cast(count(*) as int)`.as("unresolvedReportCount"),
      })
      .from(fileVersionReports)
      .where(
        and(
          eq(fileVersionReports.fileId, fileId),
          inArray(fileVersionReports.status, unresolvedStatuses),
        ),
      )
      .groupBy(fileVersionReports.fileVersionId)
      .as("unresolved_report_counts");

    const latestReportStatus = sql<FileVersionReportStatus | null>`(
        select ${fileVersionReports.status}
        from ${fileVersionReports}
        where ${fileVersionReports.fileVersionId} = ${fileVersions.id}
        order by ${fileVersionReports.updatedAt} desc, ${fileVersionReports.createdAt} desc
        limit 1
      )`;

    const rows = await db
      .select({
        commentCount: sql<number>`coalesce(${commentCounts.commentCount}, 0)`,
        fileVersionId: fileVersions.id,
        latestReportStatus,
        unresolvedReportCount: sql<number>`coalesce(${unresolvedReportCounts.unresolvedReportCount}, 0)`,
      })
      .from(fileVersions)
      .leftJoin(commentCounts, eq(commentCounts.fileVersionId, fileVersions.id))
      .leftJoin(
        unresolvedReportCounts,
        eq(unresolvedReportCounts.fileVersionId, fileVersions.id),
      )
      .where(eq(fileVersions.fileId, fileId));

    return rows.map((row) => ({
      commentCount: Number(row.commentCount ?? 0),
      fileVersionId: row.fileVersionId,
      latestReportStatus: row.latestReportStatus ?? null,
      unresolvedReportCount: Number(row.unresolvedReportCount ?? 0),
    }));
  }

  async findProjectFileNavigation(
    projectId: string,
  ): Promise<ProjectFileNavigationRecord[]> {
    return db
      .select({
        approvalStatus: files.approvalStatus,
        createdAt: files.createdAt,
        extension: files.extension,
        id: files.id,
        name: files.name,
        nameSourceLocale: files.nameSourceLocale,
        updatedAt: files.updatedAt,
      })
      .from(files)
      .where(and(eq(files.projectId, projectId), isNull(files.deletedAt)))
      .orderBy(desc(files.createdAt), desc(files.id));
  }

  async getProjectWorkflowSummary(
    projectId: string,
  ): Promise<ProjectWorkflowSummary> {
    const [row] = await db
      .select({
        activeFileCount:
          sql<number>`cast(count(*) as int)`.as("activeFileCount"),
        approvedRevisionCount: sql<number>`cast(coalesce(sum(case when ${files.approvedVersionId} is not null then 1 else 0 end), 0) as int)`.as(
          "approvedRevisionCount",
        ),
        finalDraftCount: sql<number>`cast(coalesce(sum(case when ${files.finalDraftVersionId} is not null then 1 else 0 end), 0) as int)`.as(
          "finalDraftCount",
        ),
      })
      .from(files)
      .where(and(eq(files.projectId, projectId), isNull(files.deletedAt)));

    const activeFileCount = Number(row?.activeFileCount ?? 0);
    const finalDraftCount = Number(row?.finalDraftCount ?? 0);
    const filesMissingFinalDraftCount = Math.max(
      0,
      activeFileCount - finalDraftCount,
    );

    // Count unresolved final-draft reports (reported or under_review)
    const [unresolvedRow] = await db
      .select({
        unresolvedFinalDraftReportCount: sql<number>`cast(coalesce(sum(case when ${files.finalDraftReportStatus} in ('reported','under_review') then 1 else 0 end), 0) as int)`.as(
          "unresolvedFinalDraftReportCount",
        ),
      })
      .from(files)
      .where(and(eq(files.projectId, projectId), isNull(files.deletedAt)));

    // Count final-draft versions that are present but whose processing/preview
    // is incomplete (no processed/preview artifacts or processing not completed).
    const [processingIncompleteRow] = await db
      .select({
        finalDraftProcessingIncompleteCount: sql<number>`cast(coalesce(count(*) filter (where ${files.finalDraftVersionId} is not null and ${fileVersions.processingStatus} is distinct from 'completed'), 0) as int)`.as(
          "finalDraftProcessingIncompleteCount",
        ),
      })
      .from(files)
      .leftJoin(fileVersions, eq(fileVersions.id, files.finalDraftVersionId))
      .where(and(eq(files.projectId, projectId), isNull(files.deletedAt)));

    return {
      activeFileCount,
      allFilesHaveFinalDrafts:
        activeFileCount > 0 && filesMissingFinalDraftCount === 0,
      filesMissingFinalDraftCount,
      unresolvedFinalDraftReportCount: Number(
        unresolvedRow?.unresolvedFinalDraftReportCount ?? 0,
      ),
      finalDraftProcessingIncompleteCount: Number(
        processingIncompleteRow?.finalDraftProcessingIncompleteCount ?? 0,
      ),
      hasAnyApprovedRevision: Number(row?.approvedRevisionCount ?? 0) > 0,
    };
  }

  async createVersionReport(
    input: CreateFileVersionReportInput,
  ): Promise<FileVersionReportRecord> {
    const [record] = await db
      .insert(fileVersionReports)
      .values({
        fileId: input.fileId,
        fileVersionId: input.fileVersionId,
        message: input.message ?? null,
        projectId: input.projectId,
        reason: input.reason,
        sourceLocale: input.sourceLocale,
        status: input.status ?? FileVersionReportStatus.Reported,
      })
      .returning();

    if (!record) {
      throw new Error("Failed to create file version report.");
    }

    return record;
  }

  async findUnresolvedVersionReportCountByFileId(
    fileId: string,
  ): Promise<number> {
    const unresolvedStatuses = [
      FileVersionReportStatus.Reported,
      FileVersionReportStatus.UnderReview,
    ];

    const [result] = await db
      .select({
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(fileVersionReports)
      .innerJoin(
        fileVersions,
        eq(fileVersionReports.fileVersionId, fileVersions.id),
      )
      .where(
        and(
          eq(fileVersionReports.fileId, fileId),
          inArray(fileVersionReports.status, unresolvedStatuses),
          isNull(fileVersions.deletedAt),
        ),
      );

    return Number(result?.count ?? 0);
  }

  async findVersionsPendingPreviewPurge(input: {
    limit?: number;
    now: Date;
  }): Promise<FileVersionRecord[]> {
    return db
      .select()
      .from(fileVersions)
      .where(
        and(
          isNull(fileVersions.previewPurgedAt),
          sql`${fileVersions.previewRetentionUntil} <= ${input.now}`,
          sql`${fileVersions.previewStorageKey} is not null`,
        ),
      )
      .orderBy(asc(fileVersions.previewRetentionUntil), asc(fileVersions.id))
      .limit(input.limit ?? 100);
  }

  async findMany(params: FindManyFilesParams): Promise<FindManyFilesResult> {
    const conditions: SQL[] = [];

    if (!params.includeDeleted) {
      conditions.push(isNull(files.deletedAt));
    }

    if (params.projectId !== undefined) {
      conditions.push(eq(files.projectId, params.projectId));
    }

    if (params.fileType !== undefined) {
      const fileTypeCondition = getFileTypeCondition(params.fileType);

      if (fileTypeCondition) {
        conditions.push(fileTypeCondition);
      }
    }

    if (params.uploadStatus !== undefined) {
      conditions.push(eq(files.uploadStatus, params.uploadStatus));
    }

    if (params.search !== undefined) {
      const searchPattern = buildContainsSearchPattern(params.search);
      const searchCondition = or(
        ilike(files.name, searchPattern),
        ilike(files.originalName, searchPattern),
      );

      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const orderBy = getOrderExpression(params.sort, params.order);

    const recordsQuery = db
      .select(FILE_LIST_COLUMNS)
      .from(files)
      .orderBy(...orderBy)
      .limit(params.limit)
      .offset(params.offset);

    const recordsPromise = whereClause
      ? recordsQuery.where(whereClause)
      : recordsQuery;

    if (params.includeTotal === false) {
      const records = await recordsPromise;

      return {
        records,
        total: null,
      };
    }

    const totalQuery = db.select({ count: count() }).from(files);

    const [records, totalResult] = await Promise.all([
      recordsPromise,
      whereClause ? totalQuery.where(whereClause) : totalQuery,
    ]);

    return {
      records,
      total: Number(totalResult[0]?.count ?? 0),
    };
  }

  async softDelete(id: string, deletedAt: Date): Promise<FileRecord | null> {
    const [record] = await db
      .update(files)
      .set({
        deletedAt,
        updatedAt: deletedAt,
        uploadStatus: FileUploadStatus.Deleted,
      })
      .where(and(eq(files.id, id), isNull(files.deletedAt)))
      .returning();

    return record ?? null;
  }

  async softDeleteVersion(input: {
    fileId: string;
    fileUpdate: UpdateFileRecordInput;
    versionId: string;
    versionUpdate: UpdateFileVersionInput;
  }): Promise<{ file: FileRecord; version: FileVersionRecord } | null> {
    return db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .update(revisionComments)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(revisionComments.fileVersionId, input.versionId),
            isNull(revisionComments.deletedAt),
          ),
        );

      await tx
        .update(revisionCommentMarkers)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(revisionCommentMarkers.fileVersionId, input.versionId),
            isNull(revisionCommentMarkers.deletedAt),
          ),
        );

      await tx
        .update(revisionCommentItems)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(revisionCommentItems.fileVersionId, input.versionId),
            isNull(revisionCommentItems.deletedAt),
          ),
        );

      const [version] = await tx
        .update(fileVersions)
        .set(input.versionUpdate)
        .where(
          and(
            eq(fileVersions.id, input.versionId),
            eq(fileVersions.fileId, input.fileId),
            isNull(fileVersions.deletedAt),
          ),
        )
        .returning();

      if (!version) {
        return null;
      }

      const [file] = await tx
        .update(files)
        .set(input.fileUpdate)
        .where(and(eq(files.id, input.fileId), isNull(files.deletedAt)))
        .returning();

      if (!file) {
        throw new Error("Failed to update parent file for version deletion.");
      }

      return { file, version };
    });
  }

  async hardDeleteVersion(input: {
    fileId: string;
    fileUpdate: UpdateFileRecordInput;
    versionId: string;
  }): Promise<{ file: FileRecord; versionId: string } | null> {
    return db.transaction(async (tx) => {
      const rollbackNow = new Date();
      const [deletedVersion] = await tx
        .update(fileVersions)
        .set({
          deletedAt: rollbackNow,
          deleteReason: "version_rollback",
          updatedAt: rollbackNow,
        })
        .where(
          and(
            eq(fileVersions.id, input.versionId),
            eq(fileVersions.fileId, input.fileId),
            isNull(fileVersions.deletedAt),
          ),
        )
        .returning({ id: fileVersions.id });

      if (!deletedVersion) {
        return null;
      }

      const [file] = await tx
        .update(files)
        .set(input.fileUpdate)
        .where(and(eq(files.id, input.fileId), isNull(files.deletedAt)))
        .returning();

      if (!file) {
        throw new Error("Failed to restore parent file after version rollback.");
      }

      return {
        file,
        versionId: deletedVersion.id,
      };
    });
  }

  async softDeleteWithVersions(
    id: string,
    deletedAt = new Date(),
  ): Promise<FileRecord | null> {
    return db.transaction(async (tx) => {
      // Soft delete all active file versions
      await tx
        .update(fileVersions)
        .set({
          deletedAt,
          deletedBy: "file_delete",
          updatedAt: deletedAt,
        })
        .where(and(eq(fileVersions.fileId, id), isNull(fileVersions.deletedAt)));

      // Soft delete all revision comments for this file
      await tx
        .update(revisionComments)
        .set({
          deletedAt,
          updatedAt: deletedAt,
        })
        .where(and(eq(revisionComments.fileId, id), isNull(revisionComments.deletedAt)));

      // Soft delete all revision comment markers for this file
      await tx
        .update(revisionCommentMarkers)
        .set({
          deletedAt,
          updatedAt: deletedAt,
        })
        .where(and(eq(revisionCommentMarkers.fileId, id), isNull(revisionCommentMarkers.deletedAt)));

      // Soft delete all revision comment items for this file
      await tx
        .update(revisionCommentItems)
        .set({
          deletedAt,
          updatedAt: deletedAt,
        })
        .where(and(eq(revisionCommentItems.fileId, id), isNull(revisionCommentItems.deletedAt)));

      // Soft delete the file record itself
      const [deletedFile] = await tx
        .update(files)
        .set({
          deletedAt,
          uploadStatus: FileUploadStatus.Deleted,
          updatedAt: deletedAt,
        })
        .where(and(eq(files.id, id), isNull(files.deletedAt)))
        .returning();

      return deletedFile ?? null;
    });
  }

  async hardDeleteWithVersions(id: string): Promise<FileRecord | null> {
    return this.softDeleteWithVersions(id);
  }

  async update(
    id: string,
    input: UpdateFileRecordInput,
  ): Promise<FileRecord | null> {
    const [record] = await db
      .update(files)
      .set(input)
      .where(and(eq(files.id, id), isNull(files.deletedAt)))
      .returning();

    return record ?? null;
  }
}
