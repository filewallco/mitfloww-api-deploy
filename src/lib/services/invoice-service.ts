import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoiceSettings, projects, users } from "@/lib/db/schema";
import { ne } from "drizzle-orm";
import { DrizzleFileRepository } from "@/lib/repositories/file-repository";
import type { InvoiceSettingsRecord, NewInvoiceSettingsRecord } from "@/lib/db/schema";
import { userService } from "./user-service";
import { invoicePdfService, type InvoicePdfData } from "./invoice-pdf-service";
import { r2Storage } from "@/lib/storage/r2";
import { ForbiddenAppError, NotFoundAppError } from "@/lib/errors/app-error";

export const DEFAULT_INVOICE_SETTINGS: Omit<InvoiceSettingsRecord, "id" | "userId" | "createdAt" | "updatedAt"> = {
  templateId: "modern",
  logoAlignment: "left",
  nameAlignment: "left",
  accentColor: "primary",
  showLogo: true,
  showTaxNumber: false,
  taxNumber: null,
  showNotes: true,
  notes: "Thank you for your business! All deliverables are approved and licensed for client use.",
  terms: "Payment confirmed in full via UPI. Receipt generated automatically by MitFloww.",
  paperSize: "a4",
};

export class InvoiceService {
  async getInvoiceSettings(userId: string): Promise<InvoiceSettingsRecord> {
    const [existing] = await db
      .select()
      .from(invoiceSettings)
      .where(eq(invoiceSettings.userId, userId))
      .limit(1);

    if (existing) {
      return existing;
    }

    return {
      id: "default",
      userId,
      ...DEFAULT_INVOICE_SETTINGS,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async updateInvoiceSettings(
    userId: string,
    patch: Partial<NewInvoiceSettingsRecord>,
  ): Promise<InvoiceSettingsRecord> {
    if (patch.templateId && patch.templateId !== "modern") {
      const profile = await userService.getProfile(userId);
      const planKey = profile.user.planKey?.toLowerCase();
      if (!planKey || planKey === "free") {
        throw new ForbiddenAppError(
          "The selected template is available exclusively on Pro plans. Upgrade to unlock all premium invoice templates."
        );
      }
    }

    const [existing] = await db
      .select()
      .from(invoiceSettings)
      .where(eq(invoiceSettings.userId, userId))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(invoiceSettings)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(eq(invoiceSettings.userId, userId))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(invoiceSettings)
      .values({
        userId,
        ...DEFAULT_INVOICE_SETTINGS,
        ...patch,
      })
      .returning();
    return created;
  }

  async generateProjectInvoicePdf(projectId: string): Promise<{
    pdfBuffer: Buffer;
    filename: string;
  }> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      throw new NotFoundAppError("Project not found.");
    }

    let userId = project.userId;
    if (!userId || userId === "default-owner") {
      try {
        const [realUser] = await db
          .select()
          .from(users)
          .where(ne(users.id, "default-owner"))
          .limit(1);
        if (realUser) {
          userId = realUser.id;
        }
      } catch {
        // ignore
      }
    }
    if (!userId) {
      userId = "default-owner";
    }

    const profile = await userService.getProfile(userId);
    const settings = await this.getInvoiceSettings(userId);

    // Calculate extra revisions and advance payments
    let totalRevisions = 0;
    try {
      const fileRepo = new DrizzleFileRepository();
      totalRevisions = await fileRepo.countProjectAddedRevisions(project.id);
    } catch {
      // ignore
    }

    const revisionLimit = project.revisionLimit ?? 0;
    const extraRevisionCount = Math.max(0, totalRevisions - revisionLimit);
    const extraRevisionCostCents = project.extraRevisionCostCents ?? 0;
    const extraRevisionAmount = (extraRevisionCount * extraRevisionCostCents) / 100;
    const baseAmount = Number(project.amountCents) / 100 || 0;
    const subtotal = baseAmount + extraRevisionAmount;

    const advancePaymentPaid = (project.advancePaymentEnabled && project.advanceAmountCents > 0)
      ? Number(project.advanceAmountCents) / 100
      : 0;

    const balanceAmount = Math.max(0, subtotal - advancePaymentPaid);

    const lineItems = [
      {
        description: `${project.title || "Project Deliverables"} - Base Project Deliverables`,
        qty: 1,
        rate: baseAmount,
        amount: baseAmount,
      },
    ];

    if (extraRevisionCount > 0 && extraRevisionAmount > 0) {
      lineItems.push({
        description: `Additional Project Revisions (${extraRevisionCount} extra round${extraRevisionCount > 1 ? "s" : ""})`,
        qty: extraRevisionCount,
        rate: extraRevisionCostCents / 100,
        amount: extraRevisionAmount,
      });
    }

    let logoBuffer: Buffer | null = null;
    if (profile.company?.logoStorageKey) {
      try {
        const fileObj = await r2Storage.getFile({ key: profile.company.logoStorageKey });
        if (fileObj && fileObj.body) {
          if (Buffer.isBuffer(fileObj.body)) {
            logoBuffer = fileObj.body;
          } else {
            const chunks: Buffer[] = [];
            for await (const chunk of fileObj.body as any) {
              chunks.push(Buffer.from(chunk));
            }
            logoBuffer = Buffer.concat(chunks);
          }
        }
      } catch (err) {
        console.warn("Could not load company logo from R2 for invoice:", err);
      }
    }

    const completedDate = project.clientPaymentCompletedAt
      ? new Date(project.clientPaymentCompletedAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });

    const invoiceNumber = project.clientPaymentReference
      ? `INV-${project.clientPaymentReference}`
      : `INV-${project.publicId.slice(0, 8).toUpperCase()}`;

    const userName =
      profile.user.displayName ||
      [profile.user.firstName, profile.user.lastName].filter(Boolean).join(" ") ||
      "Freelancer";

    const pdfData: InvoicePdfData = {
      invoiceNumber,
      invoiceDate: completedDate,
      paymentMethod: "UPI",
      paymentStatus: project.paymentStatus === "paid" ? "PAID" : "PENDING",
      currency: project.currency || "INR",
      amount: subtotal,
      lineItems,
      subtotal,
      advancePaymentPaid,
      balanceAmount,
      clientName: project.clientName || "Valued Client",
      clientEmail: project.clientEmail,
      projectTitle: project.title || "Creative Deliverables",
      company: {
        name: profile.company?.name || userName || "Provider",
        tagline: profile.company?.tagline,
        email: profile.company?.email || profile.user.email,
        website: profile.company?.website,
        logoBuffer,
      },
      user: {
        name: userName,
        email: profile.user.email,
        phone: profile.user.phone,
        address: [profile.user.city, profile.user.state, profile.user.country]
          .filter(Boolean)
          .join(", "),
      },
      settings: {
        templateId: settings.templateId,
        logoAlignment: settings.logoAlignment as any,
        nameAlignment: settings.nameAlignment as any,
        accentColor: settings.accentColor,
        showLogo: settings.showLogo,
        showTaxNumber: settings.showTaxNumber,
        taxNumber: settings.taxNumber,
        showNotes: settings.showNotes,
        notes: settings.notes,
        terms: settings.terms,
        paperSize: settings.paperSize || "a4",
      },
    };

    const pdfBuffer = await invoicePdfService.generateInvoicePdf(pdfData);
    const filename = `${invoiceNumber}.pdf`;

    return { pdfBuffer, filename };
  }

  async generateSampleInvoicePdf(
    userId: string,
    overrides?: Partial<NewInvoiceSettingsRecord>,
  ): Promise<{
    pdfBuffer: Buffer;
    filename: string;
  }> {
    const profile = await userService.getProfile(userId);
    const settings = await this.getInvoiceSettings(userId);
    const effectiveSettings = { ...settings, ...overrides };

    let logoBuffer: Buffer | null = null;
    if (profile.company?.logoStorageKey) {
      try {
        const fileObj = await r2Storage.getFile({ key: profile.company.logoStorageKey });
        if (fileObj && fileObj.body) {
          if (Buffer.isBuffer(fileObj.body)) {
            logoBuffer = fileObj.body;
          } else {
            const chunks: Buffer[] = [];
            for await (const chunk of fileObj.body as any) {
              chunks.push(Buffer.from(chunk));
            }
            logoBuffer = Buffer.concat(chunks);
          }
        }
      } catch (err) {
        console.warn("Could not load company logo from R2 for sample invoice:", err);
      }
    }

    const todayStr = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const userName =
      profile.user.displayName ||
      [profile.user.firstName, profile.user.lastName].filter(Boolean).join(" ") ||
      "Freelancer Name";

    const pdfData: InvoicePdfData = {
      invoiceNumber: "INV-SAMPLE-2026",
      invoiceDate: todayStr,
      paymentMethod: "UPI",
      paymentStatus: "PAID",
      currency: "INR",
      amount: 2500,
      clientName: "Sample Client Corp",
      clientEmail: "billing@sampleclient.com",
      projectTitle: "Sample Design & Brand Assets",
      company: {
        name: profile.company?.name || userName || "My Design Company",
        tagline: profile.company?.tagline || "Professional Creative Services",
        email: profile.company?.email || profile.user.email,
        website: profile.company?.website || "www.example.com",
        logoBuffer,
      },
      user: {
        name: userName,
        email: profile.user.email,
        phone: profile.user.phone || "+91 98765 43210",
        address: [profile.user.city || "Bengaluru", profile.user.state || "Karnataka", profile.user.country || "India"]
          .filter(Boolean)
          .join(", "),
      },
      settings: {
        templateId: effectiveSettings.templateId,
        logoAlignment: effectiveSettings.logoAlignment as any,
        nameAlignment: effectiveSettings.nameAlignment as any,
        accentColor: effectiveSettings.accentColor,
        showLogo: effectiveSettings.showLogo,
        showTaxNumber: effectiveSettings.showTaxNumber,
        taxNumber: effectiveSettings.taxNumber,
        showNotes: effectiveSettings.showNotes,
        notes: effectiveSettings.notes,
        terms: effectiveSettings.terms,
        paperSize: effectiveSettings.paperSize || "a4",
      },
    };

    const pdfBuffer = await invoicePdfService.generateInvoicePdf(pdfData);
    return {
      pdfBuffer,
      filename: `Sample-Invoice-${effectiveSettings.templateId}.pdf`,
    };
  }
}

export const invoiceService = new InvoiceService();
