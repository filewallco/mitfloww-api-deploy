import { createScopedLogger } from "@/lib/logger";
import type { EmailProvider, SendEmailOptions, SendEmailResult } from "./email-provider";
import { ResendEmailProvider } from "./resend-provider";
import {
  getEmailBrandHeaderHtml,
  getEmailBrandFooterHtml,
  getEmailLogoAttachment,
  getEmailIconAttachment,
} from "./email-logo";

export { getEmailBrandHeaderHtml, getEmailBrandFooterHtml };

/**
 * Wraps content in a full-width, responsive, dark-mode safe email document.
 * Eliminates the narrow rounded container box, using 100% full width with centered content.
 */
function wrapEmailHtml(contentHtml: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <style>
      :root {
        color-scheme: light;
        supported-color-schemes: light;
      }
      body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
      body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; min-width: 100%; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }

      /* Force logo strip to always be 100% white, never inverting across any theme or dark mode */
      .logo-strip, .logo-strip td {
        background-color: #ffffff !important;
        background: #ffffff !important;
        background-image: linear-gradient(#ffffff, #ffffff) !important;
      }
      @media (prefers-color-scheme: dark) {
        .logo-strip, .logo-strip td {
          background-color: #ffffff !important;
          background: #ffffff !important;
          background-image: linear-gradient(#ffffff, #ffffff) !important;
        }
      }
      /* Gmail app dark mode override */
      u + .body .logo-strip, u + .body .logo-strip td {
        background-color: #ffffff !important;
        background: #ffffff !important;
        background-image: linear-gradient(#ffffff, #ffffff) !important;
      }
      /* Outlook dark mode override */
      [data-ogsc] .logo-strip, [data-ogsc] .logo-strip td,
      [data-ogsb] .logo-strip, [data-ogsb] .logo-strip td {
        background-color: #ffffff !important;
        background: #ffffff !important;
        background-image: linear-gradient(#ffffff, #ffffff) !important;
      }
    </style>
  </head>
  <body class="body" style="margin: 0; padding: 0; width: 100% !important; min-width: 100%; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <!-- Main Content Container with width-fitting Brand Header Strip -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width: 100%; min-width: 100%; background-color: #ffffff; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding: 24px 16px 0 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; margin: 0 auto; border-collapse: collapse;">
            <!-- Width-fitting White Brand Header Strip -->
            <tr>
              <td style="padding: 0 0 24px 0;">
                ${getEmailBrandHeaderHtml()}
              </td>
            </tr>
            <!-- Email Body Content -->
            <tr>
              <td style="color: #0f172a; font-size: 15px; line-height: 1.6; text-align: left;">
                ${contentHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Footer with MitFloww icon logo, copyright and year -->
    ${getEmailBrandFooterHtml()}
  </body>
</html>
  `.trim();
}

const scopedLogger = createScopedLogger("email-service");

export class EmailService {
  private provider: EmailProvider;

  constructor(provider?: EmailProvider) {
    this.provider = provider || new ResendEmailProvider();
  }

  setProvider(provider: EmailProvider): void {
    this.provider = provider;
  }

  getProviderName(): string {
    return this.provider.name;
  }

  async sendAsync(options: SendEmailOptions): Promise<void> {
    try {
      const attachments = [...(options.attachments || [])];

      // Automatically attach dark-mode safe MitFloww logo if referenced as CID
      if (
        options.html.includes("cid:mitfloww-logo") &&
        !attachments.some(
          (a) => (a as any).contentId === "mitfloww-logo" || (a as any).content_id === "mitfloww-logo",
        )
      ) {
        attachments.push(getEmailLogoAttachment());
      }

      // Automatically attach MitFloww icon mark if referenced as CID
      if (
        options.html.includes("cid:mitfloww-icon") &&
        !attachments.some(
          (a) => (a as any).contentId === "mitfloww-icon" || (a as any).content_id === "mitfloww-icon",
        )
      ) {
        attachments.push(getEmailIconAttachment());
      }

      const res = await this.provider.sendEmail({
        ...options,
        attachments,
      });
      if (!res.success) {
        scopedLogger.warn("Failed sending email", { to: options.to, error: res.error, subject: options.subject });
      }
    } catch (err) {
      scopedLogger.error("Unexpected error sending email", { to: options.to, err, subject: options.subject });
    }
  }

  async sendSignupOtpEmail(email: string, otp: string): Promise<void> {
    const subject = `${otp} is your MitFloww verification code`;
    const html = this.buildOtpEmailHtml({
      title: "Verify your email address",
      subtitle: "Welcome to MitFloww. Use the verification code below to complete your registration.",
      otp,
      hint: "This code expires in 5 minutes. If you did not create a MitFloww account, please ignore this email.",
    });
    const text = `Your MitFloww verification code is: ${otp}. It expires in 5 minutes.`;

    await this.sendAsync({ to: email, subject, html, text });
  }

  async sendLoginOtpEmail(email: string, otp: string): Promise<void> {
    const subject = `${otp} is your MitFloww login code`;
    const html = this.buildOtpEmailHtml({
      title: "Your login code",
      subtitle: "Use the single-use code below to sign in to your MitFloww account.",
      otp,
      hint: "This code expires in 5 minutes. Never share this code with anyone.",
    });
    const text = `Your MitFloww login code is: ${otp}. It expires in 5 minutes.`;

    await this.sendAsync({ to: email, subject, html, text });
  }

  async sendPasswordResetEmail(params: {
    email: string;
    resetUrl: string;
    name?: string;
  }): Promise<void> {
    const greetingName = params.name ? ` ${params.name}` : "";
    const subject = "Reset your MitFloww password";
    const content = `
      <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0;">Reset your password</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">Hello${greetingName}, we received a request to reset your MitFloww password.</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${params.resetUrl}" style="display: inline-block; background-color: #005bdd; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-size: 14px; font-weight: 600;">Reset Password &rarr;</a>
      </div>
      <p style="font-size: 12px; line-height: 1.6; color: #94a3b8; margin: 0;">This link expires in 30 minutes and can only be used after opening it from this email. If you did not request this, you can safely ignore this message.</p>
    `;
    const html = wrapEmailHtml(content);
    const text = `Hello${greetingName},\n\nReset your MitFloww password using this link (valid for 30 minutes):\n${params.resetUrl}\n\nIf you did not request this, you can safely ignore this message.`;

    await this.sendAsync({ to: params.email, subject, html, text });
  }

  async sendAssetAccessOtpEmail(email: string, otp: string, assetTitle: string): Promise<void> {
    const subject = `${otp} is your MitFloww download access code`;
    const html = this.buildOtpEmailHtml({
      title: "Access your purchased downloads",
      subtitle: `Use the verification code below to access and download your files for "${assetTitle}".`,
      otp,
      hint: "This code expires in 5 minutes. Never share this code with anyone.",
    });
    const text = `Your MitFloww download access code for "${assetTitle}" is: ${otp}. It expires in 5 minutes.`;

    await this.sendAsync({ to: email, subject, html, text });
  }

  async sendWelcomeEmail(email: string, name?: string): Promise<void> {
    const displayName = name ? ` ${name}` : "";
    const subject = "Welcome to MitFloww!";
    const content = `
      <h1 style="font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px;">Welcome to MitFloww${displayName}!</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px;">
        Your account has been set up successfully. You're ready to share deliverables, manage project revisions, and streamline creative workflows.
      </p>
      <div style="margin-bottom: 28px;">
        <a href="${process.env.APP_URL || "https://mitfloww.com"}/projects" style="display: inline-block; background-color: #005bdd; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 600;">Go to Dashboard</a>
      </div>
    `;
    const html = wrapEmailHtml(content);
    const text = `Welcome to MitFloww${displayName}! Your account is now active.`;

    await this.sendAsync({ to: email, subject, html, text });
  }

  async sendSecurityAlertEmail(email: string, title: string, details: string): Promise<void> {
    const subject = `Security Alert: ${title}`;
    const content = `
      <h1 style="font-size: 20px; font-weight: 700; color: #dc2626; margin-top: 0; margin-bottom: 12px;">${title}</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 16px;">
        ${details}
      </p>
      <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin-bottom: 24px;">
        If this was not you, please log in immediately and change your password, or use the "Log out of all devices" option in your account settings.
      </p>
    `;
    const html = wrapEmailHtml(content);
    const text = `Security Alert: ${title}\n\n${details}\n\nIf this was not you, please log in immediately and change your password, or use the "Log out of all devices" option in your account settings.`;

    await this.sendAsync({ to: email, subject, html, text });
  }

  async sendAccountDeactivatedEmail(params: {
    email: string;
    name?: string;
  }): Promise<void> {
    const greetingName = params.name ? ` ${params.name}` : "";
    const subject = "Your MitFloww account has been deactivated";
    const appUrl = process.env.APP_URL || "https://mitfloww.com";
    const loginUrl = `${appUrl}/login`;

    const content = `
      <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px;">Account Deactivated</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 16px;">
        Hello${greetingName},
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 20px;">
        Your MitFloww account has been deactivated as requested. Your public links and profile are temporarily hidden, and all active sessions have been signed out.
      </p>

      <div style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;">
        <p style="font-size: 13px; line-height: 1.5; color: #334155; margin: 0;">
          <strong>Want to reactivate?</strong> You can easily reactivate your account at any time. Simply sign back in using your credentials.
        </p>
      </div>

      <div style="margin-bottom: 28px;">
        <a href="${loginUrl}" style="display: inline-block; background-color: #005bdd; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 600;">Sign in to Reactivate</a>
      </div>

      <p style="font-size: 12px; line-height: 1.6; color: #94a3b8; margin: 0;">
        If you did not perform this deactivation, please contact our support team immediately.
      </p>
    `;
    const html = wrapEmailHtml(content);
    const text = `Hello${greetingName},\n\nYour MitFloww account has been deactivated. You can reactivate anytime by logging in at ${loginUrl}.\n\nIf you did not perform this action, please contact support.`;

    await this.sendAsync({ to: params.email, subject, html, text });
  }

  async sendAccountScheduledForDeletionEmail(params: {
    email: string;
    name?: string;
    deletionScheduledFor?: Date;
    deletionDeadline?: Date;
  }): Promise<void> {
    const greetingName = params.name ? ` ${params.name}` : "";
    const subject = "Important: Your MitFloww account is scheduled for deletion";
    const appUrl = process.env.APP_URL || "https://mitfloww.com";
    const loginUrl = `${appUrl}/login`;
    const targetDate = params.deletionScheduledFor || params.deletionDeadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const formattedDeadline = targetDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const content = `
      <h1 style="font-size: 20px; font-weight: 700; color: #dc2626; margin-top: 0; margin-bottom: 12px;">Account Scheduled for Deletion</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 16px;">
        Hello${greetingName},
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 20px;">
        As requested, your MitFloww account has been scheduled for permanent deletion.
      </p>

      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;">
        <p style="font-size: 13px; line-height: 1.5; color: #991b1b; margin: 0 0 8px 0;">
          <strong>30-Day Recovery Period:</strong>
        </p>
        <p style="font-size: 13px; line-height: 1.5; color: #7f1d1d; margin: 0;">
          Your account data will be permanently and irreversibly purged on <strong>${formattedDeadline}</strong>. Until that time, you can cancel this request simply by signing back into your account.
        </p>
      </div>

      <div style="margin-bottom: 28px;">
        <a href="${loginUrl}" style="display: inline-block; background-color: #005bdd; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 600;">Sign in to Restore Account</a>
      </div>

      <p style="font-size: 12px; line-height: 1.6; color: #94a3b8; margin: 0;">
        If you did not request this deletion, please log in immediately to restore and secure your account.
      </p>
    `;
    const html = wrapEmailHtml(content);
    const text = `Hello${greetingName},\n\nYour MitFloww account has been scheduled for deletion. You have a 30-day grace period until ${formattedDeadline} to recover it.\n\nTo restore your account and projects, log in at ${loginUrl} before ${formattedDeadline}.\n\nAfter this date, your data will be permanently purged.`;

    await this.sendAsync({ to: params.email, subject, html, text });
  }

  async sendAccountReactivatedEmail(params: {
    email: string;
    name?: string;
  }): Promise<void> {
    const greetingName = params.name ? ` ${params.name}` : "";
    const subject = "Your MitFloww account has been reactivated";
    const appUrl = process.env.APP_URL || "https://mitfloww.com";
    const dashboardUrl = `${appUrl}/projects`;

    const content = `
      <h1 style="font-size: 20px; font-weight: 700; color: #16a34a; margin-top: 0; margin-bottom: 12px;">Welcome Back!</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 16px;">
        Hello${greetingName},
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px;">
        Your MitFloww account has been reactivated successfully. All your projects, files, and links are active once again.
      </p>

      <div style="margin-bottom: 28px;">
        <a href="${dashboardUrl}" style="display: inline-block; background-color: #005bdd; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 600;">Go to Projects</a>
      </div>
    `;
    const html = wrapEmailHtml(content);
    const text = `Hello${greetingName},\n\nYour MitFloww account has been reactivated! Your workspace and projects have been restored.\n\nGo to your projects: ${dashboardUrl}`;

    await this.sendAsync({ to: params.email, subject, html, text });
  }

  async sendAssetPurchaseDeliveryEmail(params: {
    buyerEmail: string;
    assetTitle: string;
    amountFormatted: string;
    downloadUrl: string;
    creatorName: string;
  }): Promise<void> {
    const subject = `Your Download Link for "${params.assetTitle}"`;
    const content = `
      <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 10px 0; line-height: 1.3;">
        Payment Successful! Access Your Download
      </h1>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
        Thank you for purchasing <strong>${params.assetTitle}</strong> created by <strong>${params.creatorName}</strong>.
      </p>

      <div style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size: 13px; color: #64748b;">Asset:</td>
            <td align="right" style="font-size: 13px; font-weight: 600; color: #0f172a;">${params.assetTitle}</td>
          </tr>
          <tr>
            <td style="font-size: 13px; color: #64748b; padding-top: 8px;">Total Paid:</td>
            <td align="right" style="font-size: 13px; font-weight: 700; color: #005bdd; padding-top: 8px;">${params.amountFormatted}</td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${params.downloadUrl}" style="display: inline-block; background-color: #005bdd; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 14px; font-weight: 600; box-shadow: 0 2px 4px rgba(0, 91, 221, 0.2);">
          Download Your Files &rarr;
        </a>
      </div>

      <p style="font-size: 12px; line-height: 1.6; color: #94a3b8; margin: 0; text-align: center;">
        This download link is valid for 24 hours. You can access and download your purchased files within this period.
      </p>
    `;
    const html = wrapEmailHtml(content);
    const text = `Your download link for "${params.assetTitle}" is ready (valid for 24 hours):\n${params.downloadUrl}\n\nAmount: ${params.amountFormatted}\nCreator: ${params.creatorName}\n\nPlease download your files within 24 hours.`;

    await this.sendAsync({ to: params.buyerEmail, subject, html, text });
  }

  async sendInvoicePaymentSuccessEmail(params: {
    clientEmail: string;
    clientName?: string;
    projectTitle: string;
    invoiceNumber: string;
    amountFormatted: string;
    galleryUrl?: string;
    pdfBuffer?: Buffer;
  }): Promise<void> {
    const greetingName = params.clientName ? ` ${params.clientName}` : "";
    const subject = `Payment Receipt: ${params.projectTitle} (${params.invoiceNumber})`;

    const content = `
      <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 10px 0; line-height: 1.3;">
        Payment Receipt
      </h1>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
        Hello${greetingName}, your payment has been successfully received and confirmed.
      </p>

      <div style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size: 13px; color: #64748b;">Invoice #:</td>
            <td align="right" style="font-size: 13px; font-weight: 600; color: #0f172a;">${params.invoiceNumber}</td>
          </tr>
          <tr>
            <td style="font-size: 13px; color: #64748b; padding-top: 8px;">Project:</td>
            <td align="right" style="font-size: 13px; font-weight: 600; color: #0f172a; padding-top: 8px;">${params.projectTitle}</td>
          </tr>
          <tr>
            <td style="font-size: 13px; color: #64748b; padding-top: 8px;">Amount Paid:</td>
            <td align="right" style="font-size: 13px; font-weight: 700; color: #005bdd; padding-top: 8px;">${params.amountFormatted}</td>
          </tr>
        </table>
      </div>

      ${
        params.galleryUrl
          ? `
            <div style="text-align: center; margin: 28px 0;">
              <a href="${params.galleryUrl}" style="display: inline-block; background-color: #005bdd; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 14px; font-weight: 600;">
                Access Deliverables &rarr;
              </a>
            </div>
          `
          : ""
      }

      <p style="font-size: 12px; line-height: 1.6; color: #94a3b8; margin: 0; text-align: center;">
        Your official invoice PDF is attached to this email for your accounting records.
      </p>
    `;
    const html = wrapEmailHtml(content);
    const text = `Hello${greetingName},\n\nPayment confirmed for ${params.projectTitle}.\nInvoice: ${params.invoiceNumber}\nAmount: ${params.amountFormatted}${params.galleryUrl ? `\n\nAccess deliverables: ${params.galleryUrl}` : ""}\n\nYour invoice PDF is attached.`;

    const options: SendEmailOptions = {
      to: params.clientEmail,
      subject,
      html,
      text,
    };

    if (params.pdfBuffer) {
      options.attachments = [
        {
          filename: `invoice-${params.invoiceNumber}.pdf`,
          content: params.pdfBuffer,
          contentType: "application/pdf",
        },
      ];
    }

    await this.sendAsync(options);
  }

  async sendCreatorPaymentReceivedEmail(params: {
    creatorEmail: string;
    creatorName?: string;
    projectTitle: string;
    payerName: string;
    amountFormatted: string;
    invoiceNumber: string;
    projectId: string;
  }): Promise<void> {
    const greetingName = params.creatorName ? ` ${params.creatorName}` : "";
    const subject = `Payment Received: ${params.amountFormatted} for "${params.projectTitle}"`;
    const appUrl = process.env.APP_URL || "https://mitfloww.com";
    const dashboardUrl = `${appUrl}/projects/${params.projectId}`;

    const content = `
      <h1 style="font-size: 20px; font-weight: 700; color: #16a34a; margin: 0 0 10px 0; line-height: 1.3;">
        You Received a Payment!
      </h1>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
        Hello${greetingName}, great news! <strong>${params.payerName}</strong> has paid for <strong>${params.projectTitle}</strong>.
      </p>

      <div style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size: 13px; color: #64748b;">Amount:</td>
            <td align="right" style="font-size: 13px; font-weight: 700; color: #16a34a;">${params.amountFormatted}</td>
          </tr>
          <tr>
            <td style="font-size: 13px; color: #64748b; padding-top: 8px;">Invoice #:</td>
            <td align="right" style="font-size: 13px; font-weight: 600; color: #0f172a; padding-top: 8px;">${params.invoiceNumber}</td>
          </tr>
          <tr>
            <td style="font-size: 13px; color: #64748b; padding-top: 8px;">Client:</td>
            <td align="right" style="font-size: 13px; font-weight: 600; color: #0f172a; padding-top: 8px;">${params.payerName}</td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${dashboardUrl}" style="display: inline-block; background-color: #005bdd; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 14px; font-weight: 600;">
          View in Dashboard &rarr;
        </a>
      </div>
    `;
    const html = wrapEmailHtml(content);
    const text = `Hello${greetingName},\n\nGreat news! ${params.payerName} has completed payment for "${params.projectTitle}".\n\nAmount: ${params.amountFormatted}\nInvoice: ${params.invoiceNumber}\n\nView project: ${dashboardUrl}`;

    await this.sendAsync({ to: params.creatorEmail, subject, html, text });
  }

  private buildOtpEmailHtml(params: {
    title: string;
    subtitle: string;
    otp: string;
    hint: string;
  }): string {
    const content = `
      <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0; line-height: 1.3;">
        ${params.title}
      </h1>
      <p style="font-size: 14px; line-height: 1.5; color: #64748b; margin: 0 0 24px 0;">
        ${params.subtitle}
      </p>

      <div style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 0.25em; color: #005bdd; display: inline-block; padding-left: 0.25em;">
          ${params.otp}
        </span>
      </div>

      <p style="font-size: 12px; line-height: 1.6; color: #94a3b8; margin: 0 0 8px 0;">
        ${params.hint}
      </p>
    `;
    return wrapEmailHtml(content);
  }
}

export const emailService = new EmailService();
