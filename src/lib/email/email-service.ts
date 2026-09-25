import type { EmailProvider, SendEmailOptions, SendEmailResult } from "./email-provider";
import { ResendEmailProvider } from "./resend-provider";

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
    Promise.resolve()
      .then(() => this.provider.sendEmail(options))
      .then((res) => {
        if (!res.success) {
          console.warn(`[EmailService] Failed sending to ${options.to}:`, res.error);
        }
      })
      .catch((err) => {
        console.error(`[EmailService] Unexpected error sending to ${options.to}:`, err);
      });
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

  async sendPasswordResetOtpEmail(email: string, otp: string): Promise<void> {
    const subject = `${otp} is your password reset code`;
    const html = this.buildOtpEmailHtml({
      title: "Reset your password",
      subtitle: "We received a request to reset the password for your MitFloww account.",
      otp,
      hint: "This code expires in 5 minutes. If you did not request a password reset, you can safely ignore this email.",
    });
    const text = `Your MitFloww password reset code is: ${otp}. It expires in 5 minutes.`;

    await this.sendAsync({ to: email, subject, html, text });
  }

  async sendWelcomeEmail(email: string, name?: string): Promise<void> {
    const displayName = name ? ` ${name}` : "";
    const subject = "Welcome to MitFloww!";
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 20px; font-weight: 700; color: #005bdd; letter-spacing: -0.5px;">MitFloww</span>
        </div>
        <h1 style="font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px;">Welcome to MitFloww${displayName}!</h1>
        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px;">
          Your account has been set up successfully. You're ready to share deliverables, manage project revisions, and streamline creative workflows.
        </p>
        <div style="margin-bottom: 28px;">
          <a href="${process.env.APP_URL || "https://mitfloww.com"}/projects" style="display: inline-block; background-color: #005bdd; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 600;">Go to Dashboard</a>
        </div>
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
          © ${new Date().getFullYear()} MitFloww. All rights reserved.
        </p>
      </div>
    `;
    const text = `Welcome to MitFloww${displayName}! Your account is now active.`;

    await this.sendAsync({ to: email, subject, html, text });
  }

  async sendSecurityAlertEmail(email: string, title: string, details: string): Promise<void> {
    const subject = `Security Alert: ${title}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 20px; font-weight: 700; color: #005bdd; letter-spacing: -0.5px;">MitFloww</span>
        </div>
        <h1 style="font-size: 20px; font-weight: 700; color: #dc2626; margin-top: 0; margin-bottom: 12px;">${title}</h1>
        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 16px;">
          ${details}
        </p>
        <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin-bottom: 24px;">
          If this was not you, please log in immediately and change your password, or use the "Log out of all devices" option in your account settings.
        </p>
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
          © ${new Date().getFullYear()} MitFloww. All rights reserved.
        </p>
      </div>
    `;
    const text = `Security Alert: ${title}\n\n${details}`;

    await this.sendAsync({ to: email, subject, html, text });
  }

  async sendAssetPurchaseDeliveryEmail(params: {
    buyerEmail: string;
    buyerName?: string;
    assetTitle: string;
    amountFormatted: string;
    downloadUrl: string;
    creatorName: string;
  }): Promise<void> {
    const subject = `Your Download Link for "${params.assetTitle}"`;
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="margin: 0; padding: 24px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 520px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 36px 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                  <tr>
                    <td>
                      <!-- Brand Logo / Header -->
                      <div style="margin-bottom: 24px; text-align: left;">
                        <span style="font-size: 22px; font-weight: 800; color: #005bdd; letter-spacing: -0.5px;">MitFloww</span>
                      </div>

                      <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 10px 0; line-height: 1.3;">
                        Payment Successful! Access Your Download
                      </h1>
                      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
                        Thank you for purchasing <strong>${params.assetTitle}</strong> created by <strong>${params.creatorName}</strong>.
                      </p>

                      <div style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px 20px; margin-bottom: 24px;">
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

                      <p style="font-size: 12px; line-height: 1.6; color: #94a3b8; margin: 0 0 16px 0; text-align: center;">
                        Bookmark this link or keep this email safe. You can access your files anytime using this link.
                      </p>

                      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
                      <p style="font-size: 11px; color: #94a3b8; margin: 0; text-align: center;">
                        © ${new Date().getFullYear()} MitFloww. Professional Creative Operations.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
    const text = `Your download link for "${params.assetTitle}" is ready:\n${params.downloadUrl}\n\nAmount: ${params.amountFormatted}\nCreator: ${params.creatorName}`;

    await this.sendAsync({ to: params.buyerEmail, subject, html, text });
  }

  async sendInvoicePaymentSuccessEmail(params: {
    clientEmail: string;
    clientName: string;
    projectName: string;
    amountFormatted: string;
    invoiceNumber: string;
    pdfBuffer?: Buffer;
  }): Promise<void> {
    const subject = `Payment Receipt & Invoice #${params.invoiceNumber} for "${params.projectName}"`;
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="margin: 0; padding: 24px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 520px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 36px 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                  <tr>
                    <td>
                      <div style="margin-bottom: 24px; text-align: left;">
                        <span style="font-size: 22px; font-weight: 800; color: #005bdd; letter-spacing: -0.5px;">MitFloww</span>
                      </div>

                      <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0; line-height: 1.3;">
                        Payment Successful
                      </h1>
                      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
                        Hello ${params.clientName || "Client"}, your payment for <strong>${params.projectName}</strong> has been successfully received.
                      </p>

                      <div style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px 20px; margin-bottom: 24px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="font-size: 13px; color: #64748b;">Invoice #:</td>
                            <td align="right" style="font-size: 13px; font-weight: 600; color: #0f172a;">${params.invoiceNumber}</td>
                          </tr>
                          <tr>
                            <td style="font-size: 13px; color: #64748b; padding-top: 8px;">Project:</td>
                            <td align="right" style="font-size: 13px; font-weight: 600; color: #0f172a; padding-top: 8px;">${params.projectName}</td>
                          </tr>
                          <tr>
                            <td style="font-size: 13px; color: #64748b; padding-top: 8px;">Total Paid:</td>
                            <td align="right" style="font-size: 13px; font-weight: 700; color: #005bdd; padding-top: 8px;">${params.amountFormatted}</td>
                          </tr>
                        </table>
                      </div>

                      <p style="font-size: 13px; line-height: 1.6; color: #64748b; margin: 0 0 20px 0;">
                        Your official invoice PDF is attached to this email for your accounting records.
                      </p>

                      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
                      <p style="font-size: 11px; color: #94a3b8; margin: 0; text-align: center;">
                        © ${new Date().getFullYear()} MitFloww. Professional Creative Operations.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
    const text = `Payment received for ${params.projectName}.\nInvoice #${params.invoiceNumber}\nAmount: ${params.amountFormatted}\nYour PDF invoice is attached.`;

    const options: any = {
      to: params.clientEmail,
      subject,
      html,
      text,
    };

    if (params.pdfBuffer) {
      options.attachments = [
        {
          filename: `Invoice-${params.invoiceNumber}.pdf`,
          content: params.pdfBuffer,
          contentType: "application/pdf",
        },
      ];
    }

    await this.sendAsync(options);
  }

  async sendCreatorPaymentReceivedEmail(params: {
    creatorEmail: string;
    creatorName: string;
    clientName: string;
    projectName: string;
    amountFormatted: string;
    invoiceNumber: string;
  }): Promise<void> {
    const subject = `Payment Received: ${params.amountFormatted} for "${params.projectName}"`;
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="margin: 0; padding: 24px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 520px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 36px 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                  <tr>
                    <td>
                      <div style="margin-bottom: 24px; text-align: left;">
                        <span style="font-size: 22px; font-weight: 800; color: #005bdd; letter-spacing: -0.5px;">MitFloww</span>
                      </div>

                      <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0; line-height: 1.3;">
                        Payment Received!
                      </h1>
                      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
                        Great news, ${params.creatorName}! <strong>${params.clientName}</strong> has completed their payment for <strong>${params.projectName}</strong>.
                      </p>

                      <div style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px 20px; margin-bottom: 24px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="font-size: 13px; color: #64748b;">Invoice #:</td>
                            <td align="right" style="font-size: 13px; font-weight: 600; color: #0f172a;">${params.invoiceNumber}</td>
                          </tr>
                          <tr>
                            <td style="font-size: 13px; color: #64748b; padding-top: 8px;">Client:</td>
                            <td align="right" style="font-size: 13px; font-weight: 600; color: #0f172a; padding-top: 8px;">${params.clientName}</td>
                          </tr>
                          <tr>
                            <td style="font-size: 13px; color: #64748b; padding-top: 8px;">Net Amount:</td>
                            <td align="right" style="font-size: 13px; font-weight: 700; color: #16a34a; padding-top: 8px;">${params.amountFormatted}</td>
                          </tr>
                        </table>
                      </div>

                      <div style="text-align: center; margin: 24px 0;">
                        <a href="${process.env.APP_URL || "https://mitfloww.com"}/projects" style="display: inline-block; background-color: #005bdd; color: #ffffff; text-decoration: none; padding: 13px 28px; border-radius: 12px; font-size: 14px; font-weight: 600;">
                          View in Dashboard &rarr;
                        </a>
                      </div>

                      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
                      <p style="font-size: 11px; color: #94a3b8; margin: 0; text-align: center;">
                        © ${new Date().getFullYear()} MitFloww. Professional Creative Operations.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
    const text = `You received payment for ${params.projectName} from ${params.clientName}. Net Amount: ${params.amountFormatted}. Invoice #${params.invoiceNumber}.`;

    await this.sendAsync({ to: params.creatorEmail, subject, html, text });
  }

  private buildOtpEmailHtml(params: {
    title: string;
    subtitle: string;
    otp: string;
    hint: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="margin: 0; padding: 24px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 480px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 36px 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                  <tr>
                    <td>
                      <!-- Brand Logo / Header -->
                      <div style="margin-bottom: 24px; text-align: left;">
                        <span style="font-size: 22px; font-weight: 800; color: #005bdd; letter-spacing: -0.5px;">MitFloww</span>
                      </div>

                      <!-- Heading -->
                      <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0; line-height: 1.3;">
                        ${params.title}
                      </h1>
                      <p style="font-size: 14px; line-height: 1.5; color: #64748b; margin: 0 0 24px 0;">
                        ${params.subtitle}
                      </p>

                      <!-- OTP Box -->
                      <div style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; text-align: center; margin-bottom: 24px;">
                        <span style="font-family: 'Courier New', Courier, monospace, monospace; font-size: 32px; font-weight: 800; letter-spacing: 0.25em; color: #005bdd; display: inline-block; padding-left: 0.25em;">
                          ${params.otp}
                        </span>
                      </div>

                      <!-- Expiry & Disclaimer -->
                      <p style="font-size: 12px; line-height: 1.6; color: #94a3b8; margin: 0 0 24px 0;">
                        ${params.hint}
                      </p>

                      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />

                      <!-- Footer -->
                      <p style="font-size: 11px; color: #cbd5e1; margin: 0; text-align: center;">
                        © ${new Date().getFullYear()} MitFloww. Professional Creative Operations.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }
}

export const emailService = new EmailService();
