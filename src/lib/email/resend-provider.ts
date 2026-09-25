import type { EmailProvider, SendEmailOptions, SendEmailResult } from "./email-provider";

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  private apiKey: string;
  private defaultFrom: string;

  constructor(apiKey?: string, defaultFrom?: string) {
    this.apiKey = apiKey || process.env.RESEND_API_KEY || "";
    this.defaultFrom =
      defaultFrom ||
      process.env.EMAIL_FROM ||
      process.env.RESEND_FROM_EMAIL ||
      "MitFloww <notifications@mitfloww.com>";
  }

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const to = Array.isArray(options.to) ? options.to : [options.to];
    const from = options.from || this.defaultFrom;

    // Local / development mock fallback if no API key is provided
    if (!this.apiKey) {
      if (process.env.NODE_ENV !== "production") {
        console.info(
          `[EmailProvider:Resend (Dev Mock)] -> To: ${to.join(", ")} | Subject: ${options.subject}`,
        );
        return {
          success: true,
          messageId: `dev-mock-${Date.now()}`,
        };
      }

      return {
        success: false,
        error: "RESEND_API_KEY is not configured.",
      };
    }

    const attachments = options.attachments?.map((att) => ({
      filename: att.filename,
      content: Buffer.isBuffer(att.content) ? att.content.toString("base64") : att.content,
      content_id: att.content_id || att.contentId,
      contentId: att.contentId || att.content_id,
      contentType: att.contentType,
    }));

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to,
          subject: options.subject,
          html: options.html,
          text: options.text,
          reply_to: options.replyTo,
          tags: options.tags,
          ...(attachments && attachments.length > 0 ? { attachments } : {}),
        }),
      });

      const data = (await response.json()) as any;

      if (!response.ok) {
        const errorMsg = data?.message || `HTTP error ${response.status} from Resend`;
        console.error("[EmailProvider:Resend] Error sending email:", errorMsg);
        return {
          success: false,
          error: errorMsg,
        };
      }

      return {
        success: true,
        messageId: data.id,
      };
    } catch (err: any) {
      console.error("[EmailProvider:Resend] Network error:", err?.message || err);
      return {
        success: false,
        error: err?.message || "Failed to dispatch email via Resend API",
      };
    }
  }
}
