export type EmailAttachment = {
  filename: string;
  content: string | Buffer;
  contentType?: string;
  contentId?: string;
  content_id?: string;
};

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
  attachments?: EmailAttachment[];
};

export type SendEmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

/**
 * Pluggable email provider interface.
 * Decouples authentication and business logic from specific email delivery services
 * (e.g. Resend, Postmark, Amazon SES, Brevo, SendGrid).
 */
export interface EmailProvider {
  readonly name: string;
  sendEmail(options: SendEmailOptions): Promise<SendEmailResult>;
}
