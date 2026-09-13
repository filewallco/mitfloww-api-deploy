import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoiceSettings, projects, users } from "@/lib/db/schema";
import { ne } from "drizzle-orm";
import { DrizzleFileRepository } from "@/lib/repositories/file-repository";
import type { InvoiceSettingsRecord, NewInvoiceSettingsRecord, CustomInvoiceTemplate } from "@/lib/db/schema";
import { userService } from "./user-service";
import { invoicePdfService, type InvoicePdfData } from "./invoice-pdf-service";
import { r2Storage } from "@/lib/storage/r2";
import { AppError, NotFoundAppError } from "@/lib/errors/app-error";
import { creditService } from "./credit-service";
import { DEFAULT_PROJECT_CURRENCY } from "@/lib/constants/currencies";

export interface SaveCustomTemplateInput {
  id?: string;
  name: string;
  elements?: string[];
  layoutDirection?: "column" | "row" | null;
  elementOffsets?: string | null;
  elementStyles?: string | null;
  accentColor?: string | null;
  paperSize?: "a4" | "a5" | "letter" | null;
  fontFamily?: string | null;
  fontWeight?: string | null;
  fontStyle?: string | null;
  logoAlignment?: "left" | "center" | "right" | null;
  nameAlignment?: "left" | "center" | "right" | null;
  showLogo?: boolean | null;
  showTaxNumber?: boolean | null;
  taxNumber?: string | null;
  showNotes?: boolean | null;
  notes?: string | null;
  terms?: string | null;
}

function getInvoiceCreditMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

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
  fontFamily: null,
  fontWeight: null,
  fontStyle: null,
  customTemplateName: null,
  customElements: null,
  customLayoutDirection: null,
  customElementOffsets: null,
  customElementStyles: null,
  customTemplates: [],
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
    options?: { customizationSessionId?: string | null },
  ): Promise<InvoiceSettingsRecord> {
    const PREMIUM_TEMPLATES = ["corporate", "agency", "minimal", "compact"];
    const currentSettings = patch.templateId
      ? await this.getInvoiceSettings(userId)
      : null;
    const effectiveTemplateId = patch.templateId ?? currentSettings?.templateId;
    if (
      patch.templateId &&
      PREMIUM_TEMPLATES.includes(patch.templateId) &&
      !options?.customizationSessionId
    ) {
      await this.chargePremiumTemplateUsage(userId, patch.templateId);
    }

    if (
      options?.customizationSessionId &&
      effectiveTemplateId &&
      PREMIUM_TEMPLATES.includes(effectiveTemplateId)
    ) {
      const { scope } = await creditService.getOrCreateCreditAccountForScope();
      await creditService.calculateAndDeductFeatureCredits({
        idempotencyKey: `invoice-template-customize:${userId}:${effectiveTemplateId}:${getInvoiceCreditMonthKey()}`,
        featureParams: {
          currency: DEFAULT_PROJECT_CURRENCY,
          featureKey: "invoice_template_customize",
          templateId: effectiveTemplateId,
        },
        scope,
        metadata: {
          templateId: effectiveTemplateId,
          templateName:
            effectiveTemplateId[0].toUpperCase() + effectiveTemplateId.slice(1),
          billingPeriod: getInvoiceCreditMonthKey(),
        },
      });
    }

    const [saved] = await db
      .insert(invoiceSettings)
      .values({
        userId,
        ...DEFAULT_INVOICE_SETTINGS,
        ...patch,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: invoiceSettings.userId,
        set: {
          ...patch,
          updatedAt: new Date(),
        },
      })
      .returning();

    return saved;
  }

  private async chargePremiumTemplateUsage(userId: string, templateId: string) {
    const premiumTemplates = new Set(["corporate", "agency", "minimal", "compact"]);
    if (!premiumTemplates.has(templateId)) return;

    const { scope } = await creditService.getOrCreateCreditAccountForScope();
    await creditService.calculateAndDeductFeatureCredits({
      idempotencyKey: `invoice-template-use:${userId}:${templateId}:${getInvoiceCreditMonthKey()}`,
      featureParams: {
        currency: DEFAULT_PROJECT_CURRENCY,
        featureKey: "invoice_template_use",
        templateId,
      },
      scope,
        metadata: {
          templateId,
          templateName: templateId[0].toUpperCase() + templateId.slice(1),
          billingPeriod: getInvoiceCreditMonthKey(),
        },
    });
  }

  async getCustomTemplates(userId: string): Promise<CustomInvoiceTemplate[]> {
    const settings = await this.getInvoiceSettings(userId);
    return Array.isArray(settings.customTemplates) ? settings.customTemplates : [];
  }

  async saveCustomTemplate(
    userId: string,
    input: SaveCustomTemplateInput,
  ): Promise<{ template: CustomInvoiceTemplate; templates: CustomInvoiceTemplate[] }> {
    const name = input.name?.trim();
    if (!name) {
      throw new AppError("Template name cannot be empty.", 400, "invalid_template_name");
    }

    const settings = await this.getInvoiceSettings(userId);
    const existingTemplates: CustomInvoiceTemplate[] = Array.isArray(settings.customTemplates)
      ? [...settings.customTemplates]
      : [];

    const templateId = input.id?.trim() || `custom_${Date.now()}`;

    // Validate unique template name (case-insensitive) across existing templates for this user
    const isDuplicate = existingTemplates.some(
      (t) => t.id !== templateId && t.name.toLowerCase() === name.toLowerCase(),
    );
    if (isDuplicate) {
      throw new AppError(
        `A custom template with the name "${name}" already exists. Please choose a unique name.`,
        400,
        "duplicate_template_name",
      );
    }

    const now = new Date().toISOString();
    const existingIndex = existingTemplates.findIndex((t) => t.id === templateId);

    if (existingIndex < 0) {
      const { scope } = await creditService.getOrCreateCreditAccountForScope();
      await creditService.calculateAndDeductFeatureCredits({
        idempotencyKey: `invoice-template-create-${userId}-${templateId}`,
        featureParams: {
          currency: DEFAULT_PROJECT_CURRENCY,
          featureKey: "invoice_template_create",
        },
        scope,
        metadata: {
          templateId,
          templateName: name,
        },
      });
    }

    const updatedTemplate: CustomInvoiceTemplate = {
      id: templateId,
      name,
      elements: input.elements || [
        "logo",
        "title",
        "sender",
        "client",
        "meta",
        "items",
        "totals",
        "notes",
      ],
      layoutDirection: input.layoutDirection ?? "column",
      elementOffsets: input.elementOffsets ?? null,
      elementStyles: input.elementStyles ?? null,
      accentColor: input.accentColor ?? null,
      paperSize: input.paperSize ?? "a4",
      fontFamily: input.fontFamily ?? null,
      fontWeight: input.fontWeight ?? null,
      fontStyle: input.fontStyle ?? null,
      logoAlignment: input.logoAlignment ?? "left",
      nameAlignment: input.nameAlignment ?? "left",
      showLogo: input.showLogo ?? true,
      showTaxNumber: input.showTaxNumber ?? false,
      taxNumber: input.taxNumber ?? null,
      showNotes: input.showNotes ?? true,
      notes: input.notes ?? null,
      terms: input.terms ?? null,
      createdAt: existingIndex >= 0 ? existingTemplates[existingIndex].createdAt : now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      existingTemplates[existingIndex] = updatedTemplate;
    } else {
      existingTemplates.push(updatedTemplate);
    }

    await this.updateInvoiceSettings(userId, {
      customTemplates: existingTemplates,
    });

    return { template: updatedTemplate, templates: existingTemplates };
  }

  async deleteCustomTemplate(
    userId: string,
    templateId: string,
  ): Promise<CustomInvoiceTemplate[]> {
    const settings = await this.getInvoiceSettings(userId);
    const existingTemplates: CustomInvoiceTemplate[] = Array.isArray(settings.customTemplates)
      ? [...settings.customTemplates]
      : [];

    const filtered = existingTemplates.filter((t) => t.id !== templateId);
    const patch: Partial<NewInvoiceSettingsRecord> = {
      customTemplates: filtered,
    };

    if (settings.templateId === templateId) {
      patch.templateId = "modern";
    }

    await this.updateInvoiceSettings(userId, patch);
    return filtered;
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

    const userId = project.userId || "default-owner";

    const profile = await userService.getProfile(userId);
    const settings = await this.getInvoiceSettings(userId);

    const customTemplatesList = (settings.customTemplates as CustomInvoiceTemplate[]) || [];
    const matchingCustom = customTemplatesList.find((t) => t.id === settings.templateId);
    if (matchingCustom) {
      if (matchingCustom.elements) settings.customElements = matchingCustom.elements;
      if (matchingCustom.elementStyles) settings.customElementStyles = matchingCustom.elementStyles;
      if (matchingCustom.elementOffsets) settings.customElementOffsets = matchingCustom.elementOffsets;
      if (matchingCustom.accentColor) settings.accentColor = matchingCustom.accentColor;
      if (matchingCustom.paperSize) settings.paperSize = matchingCustom.paperSize;
    }

    await this.chargePremiumTemplateUsage(userId, settings.templateId);

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

    const advancePaymentPaid = (project.advancePaymentEnabled &&
      project.advancePaymentStatus === "paid" &&
      project.advanceAmountCents > 0)
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
      ? project.clientPaymentReference.startsWith("INV-")
        ? project.clientPaymentReference
        : `INV-${project.clientPaymentReference}`
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
        customElements: settings.customElements,
        customElementStyles: settings.customElementStyles,
        customElementOffsets: settings.customElementOffsets,
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

    const customTemplatesList = (settings.customTemplates as CustomInvoiceTemplate[]) || [];
    const matchingCustom = customTemplatesList.find(
      (t) => t.id === effectiveSettings.templateId,
    );
    if (matchingCustom) {
      if (matchingCustom.elements && !overrides?.customElements) {
        effectiveSettings.customElements = matchingCustom.elements;
      }
      if (matchingCustom.elementStyles && !overrides?.customElementStyles) {
        effectiveSettings.customElementStyles = matchingCustom.elementStyles;
      }
      if (matchingCustom.elementOffsets && !overrides?.customElementOffsets) {
        effectiveSettings.customElementOffsets = matchingCustom.elementOffsets;
      }
      if (matchingCustom.accentColor && !overrides?.accentColor) {
        effectiveSettings.accentColor = matchingCustom.accentColor;
      }
      if (matchingCustom.paperSize && !overrides?.paperSize) {
        effectiveSettings.paperSize = matchingCustom.paperSize;
      }
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
        customElements: effectiveSettings.customElements,
        customElementStyles: effectiveSettings.customElementStyles,
        customElementOffsets: effectiveSettings.customElementOffsets,
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
