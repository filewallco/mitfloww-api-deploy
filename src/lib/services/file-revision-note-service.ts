import {
  FileRevisionReplyEmailStatus,
  type FileRevisionNoteDTO,
  type FileRevisionNoteItemDTO,
  type FileRevisionNoteMarkerDTO,
  type FileRevisionNoteMutationResultDTO,
  type FileRevisionNoteReplyResultDTO,
} from "@/lib/dto/file-revision-notes";
import { AppError, NotFoundAppError, ValidationAppError } from "@/lib/errors/app-error";
import {
  DrizzleFileRepository,
  type FileRepository,
} from "@/lib/repositories/file-repository";
import {
  DrizzleProjectRepository,
  type ProjectRepository,
} from "@/lib/repositories/project-repository";
import {
  DrizzleFileRevisionNoteRepository,
  type CreateFileRevisionCommentItemRecordInput,
  type CreateFileRevisionCommentMarkerRecordInput,
  type FileRevisionNoteRepository,
  type FileRevisionNoteWithReplyRecord,
} from "@/lib/repositories/file-revision-note-repository";
import { FileApprovalStatus, FileRevisionCommentStatus, revisionCommentReports } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { inArray, or, desc, and, eq, isNull } from "drizzle-orm";
import {
  fileRevisionNoteEmailService,
  type FileRevisionNoteEmailService,
} from "@/lib/services/file-revision-note-email-service";
import { detectDynamicTextLocale } from "@/lib/i18n/dynamic-locale";
import { notificationService } from "@/lib/services/notification-service";
import { createTranslatedTextDTO } from "@/lib/translation/create-translated-text";
import type {
  FileRevisionNoteItemInput,
  FileRevisionNoteMarkerInput,
} from "@/lib/validation/file-revision-notes";

const MARKER_BASIS_POINTS = 10_000;

function toBasisPoints(value: number) {
  return Math.min(
    MARKER_BASIS_POINTS,
    Math.max(0, Math.round(value * MARKER_BASIS_POINTS)),
  );
}

function fromBasisPoints(value: number) {
  return Number((value / MARKER_BASIS_POINTS).toFixed(6));
}

function toMarkerRecordInput(
  marker: FileRevisionNoteMarkerInput,
): CreateFileRevisionCommentMarkerRecordInput {
  return {
    heightBp: Math.max(1, toBasisPoints(marker.height)),
    pageNumber: marker.pageNumber ?? null,
    widthBp: Math.max(1, toBasisPoints(marker.width)),
    xBp: toBasisPoints(marker.x),
    yBp: toBasisPoints(marker.y),
  };
}

function toItemRecordInput(
  item: FileRevisionNoteItemInput,
): CreateFileRevisionCommentItemRecordInput {
  return {
    body: item.body,
    markerIndex: item.markerIndex,
    sourceLocale: detectDynamicTextLocale(item.body),
  };
}

function toMarkerDTO(
  marker: FileRevisionNoteWithReplyRecord["markers"][number],
): FileRevisionNoteMarkerDTO {
  return {
    createdAt: marker.createdAt.toISOString(),
    height: fromBasisPoints(marker.heightBp),
    id: marker.id,
    labelNumber: marker.labelNumber,
    pageNumber: marker.pageNumber,
    updatedAt: marker.updatedAt.toISOString(),
    width: fromBasisPoints(marker.widthBp),
    x: fromBasisPoints(marker.xBp),
    y: fromBasisPoints(marker.yBp),
  };
}

function toItemDTO(
  item: FileRevisionNoteWithReplyRecord["items"][number],
): FileRevisionNoteItemDTO {
  return {
    body: item.body,
    bodyText: createTranslatedTextDTO({
      originalText: item.body,
      sourceLocale: item.sourceLocale,
    }),
    completed: item.completed,
    completedAt: item.completedAt?.toISOString() ?? null,
    completedBy: item.completedBy,
    createdAt: item.createdAt.toISOString(),
    id: item.id,
    labelNumber: item.labelNumber,
    markerId: item.markerId,
    updatedAt: item.updatedAt.toISOString(),
  };
}

function toFileRevisionNoteDTO(
  record: FileRevisionNoteWithReplyRecord,
): FileRevisionNoteDTO {
  return {
    body: record.comment.body,
    bodyText: createTranslatedTextDTO({
      originalText: record.comment.body,
      sourceLocale: record.comment.sourceLocale,
    }),
    createdAt: record.comment.createdAt.toISOString(),
    createdBy: record.comment.createdBy,
    fileId: record.comment.fileId,
    fileVersionId: record.comment.fileVersionId,
    id: record.comment.id,
    markers: record.markers.map(toMarkerDTO),
    items: record.items.map(toItemDTO),
    projectId: record.comment.projectId,
    reply: record.reply
      ? {
          body: record.reply.body,
          bodyText: createTranslatedTextDTO({
            originalText: record.reply.body,
            sourceLocale: record.reply.sourceLocale,
          }),
          createdAt: record.reply.createdAt.toISOString(),
          createdBy: "admin",
          id: record.reply.id,
          updatedAt: record.reply.updatedAt.toISOString(),
          latestReportStatus: null,
          reportedByCurrentUser: false,
        }
      : null,
    latestReportStatus: null,
    reportedByCurrentUser: false,
    status: record.comment.status,
    updatedAt: record.comment.updatedAt.toISOString(),
  };
}

export class FileRevisionNoteService {
  constructor(
    private readonly fileRepository: FileRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly revisionNoteRepository: FileRevisionNoteRepository,
    private readonly emailService: FileRevisionNoteEmailService,
  ) {}

  async listFileRevisionNotes(input: {
    fileId: string;
    fileVersionId: string;
    viewerId: string | null;
    viewerLocale: string;
  }): Promise<FileRevisionNoteDTO[]> {
    const file = await this.fileRepository.findById(input.fileId);

    if (!file) {
      throw new NotFoundAppError("File not found.");
    }

    const version = await this.fileRepository.findVersionById(input.fileVersionId);

    if (!version || version.fileId !== input.fileId) {
      throw new NotFoundAppError("File version not found.");
    }

    const notes = await this.revisionNoteRepository.findManyByFileVersionId({
      fileId: input.fileId,
      fileVersionId: input.fileVersionId,
    });

    return this.toFileRevisionNoteDTOs(notes, input.viewerLocale, input.viewerId);
  }

  async createFileRevisionNote(input: {
    fileId: string;
    fileVersionId: string;
    items?: FileRevisionNoteItemInput[];
    markers?: FileRevisionNoteMarkerInput[];
    note: string;
    sourceLocale: string;
    viewerLocale: string;
  }): Promise<FileRevisionNoteDTO> {
    const file = await this.fileRepository.findById(input.fileId);

    if (!file) {
      throw new NotFoundAppError("File not found.");
    }

    this.assertFileIsNotApproved(file.approvalStatus);

    if (!(await this.projectRepository.findById(file.projectId))) {
      throw new NotFoundAppError("Project not found.");
    }

    const version = await this.fileRepository.findVersionById(input.fileVersionId);

    if (!version || version.fileId !== input.fileId) {
      throw new NotFoundAppError("File version not found.");
    }

    const note = await this.revisionNoteRepository.createComment({
      body: input.note,
      createdBy: "admin",
      fileId: input.fileId,
      fileVersionId: input.fileVersionId,
      items: input.items?.map(toItemRecordInput),
      markers: input.markers?.map(toMarkerRecordInput),
      projectId: file.projectId,
      sourceLocale: detectDynamicTextLocale(input.note),
      status: FileRevisionCommentStatus.Pending,
      updatedAt: new Date(),
      updatedBy: "admin",
    });

    return this.toFileRevisionNoteDTO(note, input.viewerLocale);
  }

  async createClientFileRevisionNote(input: {
    fileId: string;
    fileVersionId: string;
    items?: FileRevisionNoteItemInput[];
    markers?: FileRevisionNoteMarkerInput[];
    note: string;
    sourceLocale: string;
    viewerLocale: string;
  }): Promise<FileRevisionNoteDTO> {
    const fileWithVersions = await this.fileRepository.findWithVersionsById(
      input.fileId,
      {
        includeDeletedVersions: true,
      },
    );

    if (!fileWithVersions) {
      throw new NotFoundAppError("File not found.");
    }

    this.assertFileIsNotApproved(fileWithVersions.file.approvalStatus);

    const version = fileWithVersions.versions.find(
      (candidate) => candidate.id === input.fileVersionId,
    );

    if (!version || version.deletedAt != null) {
      throw new NotFoundAppError("File version not found.");
    }

    if (version.id !== fileWithVersions.file.currentVersionId) {
      throw new AppError(
        "Comments can only be added to the latest revision.",
        409,
        "client_note_old_revision",
      );
    }

    if (fileWithVersions.file.approvedVersionId === version.id) {
      throw new AppError(
        "Comments are disabled for approved revisions.",
        409,
        "client_note_revision_approved",
      );
    }

    if (
      fileWithVersions.file.finalDraftVersionId === version.id ||
      version.isFinalDraft
    ) {
      throw new AppError(
        "Comments are disabled for the final draft.",
        409,
        "client_note_final_draft_locked",
      );
    }

    const project = await this.projectRepository.findById(
      fileWithVersions.file.projectId,
    );

    if (!project) {
      throw new NotFoundAppError("Project not found.");
    }

    const note = await this.revisionNoteRepository.createComment({
      body: input.note,
      createdBy: "client",
      fileId: input.fileId,
      fileVersionId: input.fileVersionId,
      items: input.items?.map(toItemRecordInput),
      markers: input.markers?.map(toMarkerRecordInput),
      projectId: project.id,
      sourceLocale: detectDynamicTextLocale(input.note),
      status: FileRevisionCommentStatus.Pending,
      updatedAt: new Date(),
      updatedBy: "client",
    });

    await this.createClientMessageNotification({
      fileId: input.fileId,
      projectId: project.id,
    });

    return this.toFileRevisionNoteDTO(note, input.viewerLocale);
  }

  async updateFileRevisionNote(input: {
    fileId: string;
    fileVersionId: string;
    note: string;
    noteId: string;
    sourceLocale: string;
    viewerLocale: string;
  }): Promise<FileRevisionNoteMutationResultDTO> {
    const context = await this.getCommentContext(input);
    this.assertCommentIsPending(context.note);

    const updatedNote = await this.revisionNoteRepository.updateComment(
      input.noteId,
      {
        body: input.note,
        sourceLocale: detectDynamicTextLocale(input.note),
        updatedAt: new Date(),
        updatedBy: null,
      },
    );

    if (!updatedNote) {
      throw new NotFoundAppError("Revision comment not found.");
    }

    return {
      note: await this.toFileRevisionNoteDTO(updatedNote, input.viewerLocale),
    };
  }

  async deleteFileRevisionNote(input: {
    fileId: string;
    fileVersionId: string;
    noteId: string;
    viewerLocale: string;
  }): Promise<FileRevisionNoteMutationResultDTO> {
    const context = await this.getCommentContext(input);
    this.assertCommentIsPending(context.note);

    const [existingReport] = await db
      .select({ id: revisionCommentReports.id })
      .from(revisionCommentReports)
      .where(eq(revisionCommentReports.commentId, input.noteId))
      .limit(1);

    if (existingReport) {
      throw new AppError(
        "A reported comment cannot be deleted.",
        400,
        "comment_reported_delete_locked",
      );
    }

    const deletedNote = await this.revisionNoteRepository.updateComment(
      input.noteId,
      {
        deletedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: null,
      },
    );

    if (!deletedNote) {
      throw new NotFoundAppError("Revision comment not found.");
    }

    return {
      note: await this.toFileRevisionNoteDTO(deletedNote, input.viewerLocale),
    };
  }


  async updateClientFileRevisionNote(input: {
    fileId: string;
    fileVersionId: string;
    items?: Array<{ body: string; id: string }>;
    note: string;
    noteId: string;
    sourceLocale: string;
    viewerLocale: string;
  }): Promise<FileRevisionNoteMutationResultDTO> {
    const context = await this.getCommentContext(input);
    this.assertCommentIsPending(context.note);

    if (context.note.comment.createdBy !== "client") {
      throw new AppError(
        "Only the client comment author can edit this message.",
        403,
        "revision_note_update_forbidden",
      );
    }

    const updatedAt = new Date();
    const updatedNote = await this.revisionNoteRepository.updateCommentWithItems(
      input.noteId,
      {
        body: input.note,
        items: input.items?.map((item) => ({
          body: item.body,
          id: item.id,
          sourceLocale: detectDynamicTextLocale(item.body),
        })),
        sourceLocale: detectDynamicTextLocale(input.note),
        updatedAt,
        updatedBy: "client",
      },
    );

    if (!updatedNote) {
      throw new NotFoundAppError("Revision comment not found.");
    }

    return {
      note: await this.toFileRevisionNoteDTO(updatedNote, input.viewerLocale),
    };
  }

  async deleteClientFileRevisionNote(input: {
    fileId: string;
    fileVersionId: string;
    noteId: string;
    viewerLocale: string;
  }): Promise<FileRevisionNoteMutationResultDTO> {
    const context = await this.getCommentContext(input);
    this.assertCommentIsPending(context.note);

    if (context.note.comment.createdBy !== "client") {
      throw new AppError(
        "Only the client comment author can remove this message.",
        403,
        "revision_note_delete_forbidden",
      );
    }

    const deletedNote = await this.revisionNoteRepository.updateComment(
      input.noteId,
      {
        deletedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: "client",
      },
    );

    if (!deletedNote) {
      throw new NotFoundAppError("Revision comment not found.");
    }

    return {
      note: await this.toFileRevisionNoteDTO(deletedNote, input.viewerLocale),
    };
  }

  private async deleteFileRevisionNoteMarkerForActor(input: {
    actorKey: "admin" | "client";
    fileId: string;
    fileVersionId: string;
    markerId: string;
    noteId: string;
    viewerLocale: string;
  }): Promise<FileRevisionNoteMutationResultDTO> {
    const context = await this.getCommentContext(input);
    this.assertCommentIsPending(context.note);

    const [existingReport] = await db
      .select({ id: revisionCommentReports.id })
      .from(revisionCommentReports)
      .where(eq(revisionCommentReports.commentId, input.noteId))
      .limit(1);

    if (existingReport) {
      throw new AppError(
        "A reported comment cannot be deleted.",
        400,
        "comment_reported_delete_locked",
      );
    }

    if (context.note.comment.createdBy !== input.actorKey) {
      throw new AppError(
        "Only the user who created this highlight can remove it.",
        403,
        "revision_marker_delete_forbidden",
      );
    }

    const markerBelongsToNote = context.note.markers.some(
      (marker) => marker.id === input.markerId,
    );

    if (!markerBelongsToNote) {
      throw new NotFoundAppError("Revision comment marker not found.");
    }

    const updatedNote = await this.revisionNoteRepository.deleteMarker({
      commentId: input.noteId,
      markerId: input.markerId,
      updatedAt: new Date(),
    });

    if (!updatedNote) {
      throw new NotFoundAppError("Revision comment marker not found.");
    }

    return {
      note: await this.toFileRevisionNoteDTO(updatedNote, input.viewerLocale),
    };
  }

  async deleteFileRevisionNoteMarker(input: {
    fileId: string;
    fileVersionId: string;
    markerId: string;
    noteId: string;
    viewerLocale: string;
  }): Promise<FileRevisionNoteMutationResultDTO> {
    return this.deleteFileRevisionNoteMarkerForActor({
      ...input,
      actorKey: "admin",
    });
  }

  async deleteClientFileRevisionNoteMarker(input: {
    fileId: string;
    fileVersionId: string;
    markerId: string;
    noteId: string;
    viewerLocale: string;
  }): Promise<FileRevisionNoteMutationResultDTO> {
    const fileWithVersions = await this.fileRepository.findWithVersionsById(
      input.fileId,
      {
        includeDeletedVersions: true,
      },
    );

    if (!fileWithVersions) {
      throw new NotFoundAppError("File not found.");
    }

    const version = fileWithVersions.versions.find(
      (candidate) => candidate.id === input.fileVersionId,
    );

    if (!version || version.deletedAt != null) {
      throw new NotFoundAppError("File version not found.");
    }

    if (version.id !== fileWithVersions.file.currentVersionId) {
      throw new AppError(
        "Markers can only be changed on the latest revision.",
        409,
        "client_note_old_revision",
      );
    }

    return this.deleteFileRevisionNoteMarkerForActor({
      ...input,
      actorKey: "client",
    });
  }


  async updateFileRevisionNoteItemCompletion(input: {
    completed: boolean;
    fileId: string;
    fileVersionId: string;
    itemId: string;
    noteId: string;
    viewerLocale: string;
  }): Promise<FileRevisionNoteMutationResultDTO> {
    const context = await this.getCommentContext(input);

    const itemBelongsToNote = context.note.items.some(
      (item) => item.id === input.itemId,
    );

    if (!itemBelongsToNote) {
      throw new NotFoundAppError("Revision checklist item not found.");
    }

    const now = new Date();
    const updatedNote = await this.revisionNoteRepository.updateItemCompletion({
      commentId: input.noteId,
      completed: input.completed,
      completedAt: input.completed ? now : null,
      completedBy: input.completed ? "admin" : null,
      itemId: input.itemId,
      updatedAt: now,
    });

    if (!updatedNote) {
      throw new NotFoundAppError("Revision checklist item not found.");
    }

    return {
      note: await this.toFileRevisionNoteDTO(updatedNote, input.viewerLocale),
    };
  }

  async updateClientFileRevisionNoteItemCompletion(input: {
    completed: boolean;
    fileId: string;
    fileVersionId: string;
    itemId: string;
    noteId: string;
    viewerLocale: string;
  }): Promise<FileRevisionNoteMutationResultDTO> {
    void input;

    throw new AppError(
      "Clients cannot mark revision checklist items completed.",
      403,
      "revision_item_completion_forbidden",
    );
  }

  async replyToFileRevisionNote(input: {
    fileId: string;
    fileVersionId: string;
    noteId: string;
    reply: string;
    sourceLocale: string;
    viewerLocale: string;
  }): Promise<FileRevisionNoteReplyResultDTO> {
    const context = await this.getReplyContext(input);

    if (context.note.reply) {
      throw new AppError(
        "This revision comment already has a reply.",
        409,
        "file_revision_note_reply_exists",
      );
    }

    this.assertCommentIsPending(context.note);

    const savedReply = await this.revisionNoteRepository.createReply({
      body: input.reply,
      commentId: input.noteId,
      sourceLocale: detectDynamicTextLocale(input.reply),
      updatedAt: new Date(),
    });

    if (!savedReply) {
      throw new NotFoundAppError("Revision comment not found.");
    }

    return this.finalizeReplyWithEmail({
      fileId: input.fileId,
      fileName: context.file.name,
      note: savedReply,
      projectId: context.project.id,
      projectTitle: context.project.title,
      reply: input.reply,
      viewerLocale: input.viewerLocale,
    });
  }

  async updateFileRevisionNoteReply(input: {
    fileId: string;
    fileVersionId: string;
    noteId: string;
    reply: string;
    sourceLocale: string;
    viewerLocale: string;
  }): Promise<FileRevisionNoteReplyResultDTO> {
    const context = await this.getReplyContext(input);

    if (!context.note.reply) {
      throw new AppError(
        "This revision comment does not have a reply yet.",
        409,
        "file_revision_note_reply_missing",
      );
    }

    this.assertCommentIsPending(context.note);

    const savedReply = await this.revisionNoteRepository.updateReply(
      input.noteId,
      {
        body: input.reply,
        sourceLocale: detectDynamicTextLocale(input.reply),
        updatedAt: new Date(),
      },
    );

    if (!savedReply) {
      throw new NotFoundAppError("Revision comment not found.");
    }

    return this.finalizeReplyWithEmail({
      fileId: input.fileId,
      fileName: context.file.name,
      note: savedReply,
      projectId: context.project.id,
      projectTitle: context.project.title,
      reply: input.reply,
      viewerLocale: input.viewerLocale,
    });
  }

  async deleteFileRevisionNoteReply(input: {
    fileId: string;
    fileVersionId: string;
    noteId: string;
    viewerLocale: string;
  }): Promise<FileRevisionNoteMutationResultDTO> {
    const context = await this.getReplyContext(input);

    if (!context.note.reply) {
      throw new AppError(
        "This revision comment does not have a reply to delete.",
        409,
        "file_revision_note_reply_missing",
      );
    }

    this.assertCommentIsPending(context.note);

    const replyId = context.note.reply.id;
    const [existingReport] = await db
      .select({ id: revisionCommentReports.id })
      .from(revisionCommentReports)
      .where(eq(revisionCommentReports.replyId, replyId))
      .limit(1);

    if (existingReport) {
      throw new AppError(
        "A reported reply cannot be deleted.",
        400,
        "reply_reported_delete_locked",
      );
    }

    const updatedNote = await this.revisionNoteRepository.deleteReply(input.noteId);

    if (!updatedNote) {
      throw new NotFoundAppError("Revision comment not found.");
    }

    return {
      note: await this.toFileRevisionNoteDTO(updatedNote, input.viewerLocale),
    };
  }

  async resolveCommentsForFileVersion(fileVersionId: string): Promise<void> {
    await this.revisionNoteRepository.resolvePendingByFileVersionId(
      fileVersionId,
      new Date(),
    );
  }

  private async getCommentContext(input: {
    fileId: string;
    fileVersionId: string;
    noteId: string;
  }): Promise<{
    file: NonNullable<Awaited<ReturnType<FileRepository["findById"]>>>;
    note: FileRevisionNoteWithReplyRecord;
  }> {
    const note = await this.revisionNoteRepository.findById(input.noteId);

    if (
      !note ||
      note.comment.fileId !== input.fileId ||
      note.comment.fileVersionId !== input.fileVersionId
    ) {
      throw new NotFoundAppError("Revision comment not found.");
    }

    const file = await this.fileRepository.findById(input.fileId);

    if (!file) {
      throw new NotFoundAppError("File not found.");
    }

    this.assertFileIsNotApproved(file.approvalStatus);

    return {
      file,
      note,
    };
  }

  private async getReplyContext(input: {
    fileId: string;
    fileVersionId: string;
    noteId: string;
  }): Promise<{
    file: NonNullable<Awaited<ReturnType<FileRepository["findById"]>>>;
    note: FileRevisionNoteWithReplyRecord;
    project: NonNullable<Awaited<ReturnType<ProjectRepository["findById"]>>>;
  }> {
    const { file, note } = await this.getCommentContext(input);
    const project = await this.projectRepository.findById(file.projectId);

    if (!project) {
      throw new NotFoundAppError("Project not found.");
    }

    return {
      file,
      note,
      project,
    };
  }

  private assertCommentIsPending(note: FileRevisionNoteWithReplyRecord) {
    if (note.comment.status === FileRevisionCommentStatus.Resolved) {
      throw new AppError(
        "Resolved revision comments cannot be changed.",
        409,
        "file_revision_note_resolved",
      );
    }
  }

  private async finalizeReplyWithEmail(input: {
    fileId: string;
    fileName: string;
    note: FileRevisionNoteWithReplyRecord;
    projectId: string;
    projectTitle: string;
    reply: string;
    viewerLocale: string;
  }): Promise<FileRevisionNoteReplyResultDTO> {
    let emailResult:
      | Awaited<ReturnType<FileRevisionNoteEmailService["sendRevisionNoteReplyEmail"]>>
      | null = null;

    try {
      emailResult = await this.emailService.sendRevisionNoteReplyEmail({
        fileId: input.fileId,
        fileName: input.fileName,
        noteId: input.note.comment.id,
        projectId: input.projectId,
        projectTitle: input.projectTitle,
        reply: input.reply,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Reply email failed.";

      emailResult = {
        error: message,
        status: FileRevisionReplyEmailStatus.Failed,
      };
    }

    return {
      emailStatus: emailResult.status,
      note: await this.toFileRevisionNoteDTO(input.note, input.viewerLocale),
    };
  }

  private async toFileRevisionNoteDTO(
    record: FileRevisionNoteWithReplyRecord,
    viewerLocale: string,
    viewerId: string | null = null,
  ) {
    const [dto] = await this.toFileRevisionNoteDTOs([record], viewerLocale, viewerId);

    if (!dto) {
      throw new Error("Revision note translation mapping failed.");
    }

    return dto;
  }

  private async toFileRevisionNoteDTOs(
    records: FileRevisionNoteWithReplyRecord[],
    viewerLocale: string,
    viewerId: string | null = null,
  ) {
    void viewerLocale;

    if (records.length === 0) {
      return [];
    }

    const commentIds = records.map((r) => r.comment.id);
    const replyIds = records.map((r) => r.reply?.id).filter((id): id is string => id != null);

    const reports = await db
      .select()
      .from(revisionCommentReports)
      .where(
        or(
          inArray(revisionCommentReports.commentId, commentIds.length > 0 ? commentIds : ["00000000-0000-0000-0000-000000000000"]),
          inArray(revisionCommentReports.replyId, replyIds.length > 0 ? replyIds : ["00000000-0000-0000-0000-000000000000"])
        )
      )
      .orderBy(desc(revisionCommentReports.createdAt));

    return records.map((record) => {
      const dto = toFileRevisionNoteDTO(record);

      const commentReports = reports.filter((r) => r.commentId === record.comment.id);
      const replyReports = record.reply ? reports.filter((r) => r.replyId === record.reply!.id) : [];

      dto.latestReportStatus = commentReports[0]?.status ?? null;
      dto.reportedByCurrentUser = viewerId ? commentReports.some((r) => r.reporterId === viewerId) : false;

      if (dto.reply) {
        dto.reply.latestReportStatus = replyReports[0]?.status ?? null;
        dto.reply.reportedByCurrentUser = viewerId ? replyReports.some((r) => r.reporterId === viewerId) : false;
      }

      return dto;
    });
  }

  async reportRevisionNote(input: {
    commentId?: string;
    fileId: string;
    fileVersionId: string;
    message?: string;
    reason: string;
    replyId?: string;
    reporterId: string;
  }) {
    if (!input.commentId && !input.replyId) {
      throw new ValidationAppError("Either commentId or replyId must be provided.");
    }

    const file = await this.fileRepository.findById(input.fileId);
    if (!file) {
      throw new NotFoundAppError("File not found.");
    }

    const existing = await db
      .select()
      .from(revisionCommentReports)
      .where(
        and(
          input.commentId
            ? eq(revisionCommentReports.commentId, input.commentId)
            : isNull(revisionCommentReports.commentId),
          input.replyId
            ? eq(revisionCommentReports.replyId, input.replyId)
            : isNull(revisionCommentReports.replyId),
          eq(revisionCommentReports.reporterId, input.reporterId),
        ),
      );

    if (existing.length > 0) {
      throw new ValidationAppError("You have already reported this comment.");
    }

    await db.insert(revisionCommentReports).values({
      commentId: input.commentId ?? null,
      fileVersionId: input.fileVersionId,
      message: input.message ?? null,
      projectId: file.projectId,
      reason: input.reason,
      replyId: input.replyId ?? null,
      reporterId: input.reporterId,
    });
  }

  private assertFileIsNotApproved(approvalStatus: string) {
    if (approvalStatus === FileApprovalStatus.Approved) {
      throw new AppError(
        "Action not allowed: File has already been approved.",
        400,
        "file_approved",
      );
    }
  }

  private async createClientMessageNotification(input: {
    fileId: string;
    projectId: string;
  }) {
    try {
      await notificationService.createNotification({
        category: "system",
        descriptionKey: "notification.clientRevisionMessageDescription",
        fileId: input.fileId,
        projectId: input.projectId,
        titleKey: "notification.clientRevisionMessageTitle",
      });
    } catch {
      // Notifications should never block revision-note creation.
    }
  }
}

export const fileRevisionNoteService = new FileRevisionNoteService(
  new DrizzleFileRepository(),
  new DrizzleProjectRepository(),
  new DrizzleFileRevisionNoteRepository(),
  fileRevisionNoteEmailService,
);
