import { FileRevisionNoteReplyEmailStatus } from "@/lib/db/schema";
import { emailService } from "@/lib/email/email-service";
import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type SendRevisionNoteReplyEmailInput = {
  fileId: string;
  fileName: string;
  noteId: string;
  projectId: string;
  projectTitle: string;
  reply: string;
};

export type SendRevisionNoteReplyEmailResult = {
  error: string | null;
  status: (typeof FileRevisionNoteReplyEmailStatus)[keyof typeof FileRevisionNoteReplyEmailStatus];
};

export class FileRevisionNoteEmailService {
  async sendRevisionNoteReplyEmail(
    input: SendRevisionNoteReplyEmailInput,
  ): Promise<SendRevisionNoteReplyEmailResult> {
    try {
      const [project] = await db
        .select({
          shareClientEmail: projects.shareClientEmail,
          clientEmail: projects.clientEmail,
          clientName: projects.clientName,
          shareUrl: projects.shareUrl,
        })
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);

      const recipientEmail = project?.shareClientEmail || project?.clientEmail;
      if (!recipientEmail) {
        return {
          error: null,
          status: FileRevisionNoteReplyEmailStatus.NotConfigured,
        };
      }

      const reviewUrl = project?.shareUrl || `${process.env.APP_URL || "https://mitfloww.com"}/projects/${input.projectId}`;

      await emailService.sendRevisionCommentEmail({
        recipientEmail,
        recipientName: project?.clientName || undefined,
        senderName: "Creator",
        projectTitle: input.projectTitle,
        fileName: input.fileName,
        commentText: input.reply,
        isReply: true,
        reviewUrl,
      });

      return {
        error: null,
        status: FileRevisionNoteReplyEmailStatus.Sent,
      };
    } catch (err: any) {
      return {
        error: err?.message || "Failed to send revision reply email",
        status: FileRevisionNoteReplyEmailStatus.Failed,
      };
    }
  }
}

export const fileRevisionNoteEmailService = new FileRevisionNoteEmailService();
