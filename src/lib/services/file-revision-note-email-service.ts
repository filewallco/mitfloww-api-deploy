import { FileRevisionNoteReplyEmailStatus } from "@/lib/db/schema";

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
    void input;
    // TODO: Integrate a real mail provider when revision reply notifications
    // are configured for this workspace.
    return {
      error: null,
      status: FileRevisionNoteReplyEmailStatus.NotConfigured,
    };
  }
}

export const fileRevisionNoteEmailService = new FileRevisionNoteEmailService();
