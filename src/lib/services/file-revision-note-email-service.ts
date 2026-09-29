import { FileRevisionNoteReplyEmailStatus, projects, users } from "@/lib/db/schema";
import { emailService } from "@/lib/email/email-service";
import { db } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { createScopedLogger } from "@/lib/logger";

const scopedLogger = createScopedLogger("file-revision-note-email-service");

export type SendRevisionNoteReplyEmailInput = {
  fileId: string;
  fileName: string;
  noteId: string;
  projectId: string;
  projectTitle: string;
  reply: string;
  authorRole?: "client" | "creator";
};

export type SendRevisionNoteCommentEmailInput = {
  fileId: string;
  fileName: string;
  noteId: string;
  projectId: string;
  projectTitle: string;
  comment: string;
  authorRole: "client" | "creator";
  hasMarkers?: boolean;
};

export type SendRevisionNoteReplyEmailResult = {
  error: string | null;
  status: (typeof FileRevisionNoteReplyEmailStatus)[keyof typeof FileRevisionNoteReplyEmailStatus];
};

export class FileRevisionNoteEmailService {
  async sendRevisionNoteCommentEmail(
    input: SendRevisionNoteCommentEmailInput,
  ): Promise<SendRevisionNoteReplyEmailResult> {
    try {
      const [project] = await db
        .select({
          id: projects.id,
          shareClientEmail: projects.shareClientEmail,
          clientEmail: projects.clientEmail,
          clientName: projects.clientName,
          shareUrl: projects.shareUrl,
          userId: projects.userId,
        })
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);

      if (!project) {
        scopedLogger.warn("Project not found for revision note comment email", {
          projectId: input.projectId,
        });
        return {
          error: "Project not found",
          status: FileRevisionNoteReplyEmailStatus.Failed,
        };
      }

      let creatorEmail: string | null = null;
      let creatorName = "Creator";

      if (project.userId) {
        const [creator] = await db
          .select({
            email: users.email,
            displayName: users.displayName,
            firstName: users.firstName,
          })
          .from(users)
          .where(eq(users.id, project.userId))
          .limit(1);

        if (creator) {
          creatorEmail = creator.email;
          creatorName =
            creator.displayName?.trim() ||
            creator.firstName?.trim() ||
            "Creator";
        }
      }

      const isClientAuthor = input.authorRole === "client";
      const recipientEmail = isClientAuthor
        ? creatorEmail
        : project.shareClientEmail || project.clientEmail;

      if (!recipientEmail) {
        scopedLogger.info("Recipient email not configured for comment notification", {
          projectId: input.projectId,
          authorRole: input.authorRole,
        });
        return {
          error: null,
          status: FileRevisionNoteReplyEmailStatus.NotConfigured,
        };
      }

      const senderName = isClientAuthor
        ? project.clientName?.trim() || "Client"
        : creatorName;

      const recipientName = isClientAuthor
        ? creatorName
        : project.clientName?.trim() || undefined;

      const appUrl = process.env.APP_URL || "https://mitfloww.com";
      const reviewUrl = isClientAuthor
        ? `${appUrl}/projects/${input.projectId}`
        : project.shareUrl || `${appUrl}/projects/${input.projectId}`;

      const commentText =
        input.comment.trim().length > 0
          ? input.comment
          : input.hasMarkers
            ? "Added review markers and visual feedback."
            : "Added a new review comment.";

      await emailService.sendRevisionCommentEmail({
        recipientEmail,
        recipientName,
        senderName,
        projectTitle: input.projectTitle,
        fileName: input.fileName,
        commentText,
        isReply: false,
        reviewUrl,
      });

      scopedLogger.info("Revision note comment email sent", {
        projectId: input.projectId,
        recipientEmail,
        authorRole: input.authorRole,
      });

      return {
        error: null,
        status: FileRevisionNoteReplyEmailStatus.Sent,
      };
    } catch (err: any) {
      scopedLogger.error("Failed to send revision comment email", {
        error: err?.message || String(err),
        projectId: input.projectId,
        fileId: input.fileId,
        authorRole: input.authorRole,
      });
      return {
        error: err?.message || "Failed to send revision comment email",
        status: FileRevisionNoteReplyEmailStatus.Failed,
      };
    }
  }

  async sendRevisionNoteReplyEmail(
    input: SendRevisionNoteReplyEmailInput,
  ): Promise<SendRevisionNoteReplyEmailResult> {
    try {
      const [project] = await db
        .select({
          id: projects.id,
          shareClientEmail: projects.shareClientEmail,
          clientEmail: projects.clientEmail,
          clientName: projects.clientName,
          shareUrl: projects.shareUrl,
          userId: projects.userId,
        })
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);

      if (!project) {
        scopedLogger.warn("Project not found for revision note reply email", {
          projectId: input.projectId,
        });
        return {
          error: "Project not found",
          status: FileRevisionNoteReplyEmailStatus.Failed,
        };
      }

      let creatorEmail: string | null = null;
      let creatorName = "Creator";

      if (project.userId) {
        const [creator] = await db
          .select({
            email: users.email,
            displayName: users.displayName,
            firstName: users.firstName,
          })
          .from(users)
          .where(eq(users.id, project.userId))
          .limit(1);

        if (creator) {
          creatorEmail = creator.email;
          creatorName =
            creator.displayName?.trim() ||
            creator.firstName?.trim() ||
            "Creator";
        }
      }

      // Default to "creator" author if not explicitly specified
      const isClientAuthor = input.authorRole === "client";
      const recipientEmail = isClientAuthor
        ? creatorEmail
        : project.shareClientEmail || project.clientEmail;

      if (!recipientEmail) {
        scopedLogger.info("Recipient email not configured for reply notification", {
          projectId: input.projectId,
          authorRole: input.authorRole,
        });
        return {
          error: null,
          status: FileRevisionNoteReplyEmailStatus.NotConfigured,
        };
      }

      const senderName = isClientAuthor
        ? project.clientName?.trim() || "Client"
        : creatorName;

      const recipientName = isClientAuthor
        ? creatorName
        : project.clientName?.trim() || undefined;

      const appUrl = process.env.APP_URL || "https://mitfloww.com";
      const reviewUrl = isClientAuthor
        ? `${appUrl}/projects/${input.projectId}`
        : project.shareUrl || `${appUrl}/projects/${input.projectId}`;

      await emailService.sendRevisionCommentEmail({
        recipientEmail,
        recipientName,
        senderName,
        projectTitle: input.projectTitle,
        fileName: input.fileName,
        commentText: input.reply,
        isReply: true,
        reviewUrl,
      });

      scopedLogger.info("Revision note reply email sent", {
        projectId: input.projectId,
        recipientEmail,
        authorRole: input.authorRole,
      });

      return {
        error: null,
        status: FileRevisionNoteReplyEmailStatus.Sent,
      };
    } catch (err: any) {
      scopedLogger.error("Failed to send revision reply email", {
        error: err?.message || String(err),
        projectId: input.projectId,
        fileId: input.fileId,
        authorRole: input.authorRole,
      });
      return {
        error: err?.message || "Failed to send revision reply email",
        status: FileRevisionNoteReplyEmailStatus.Failed,
      };
    }
  }
}

export const fileRevisionNoteEmailService = new FileRevisionNoteEmailService();
