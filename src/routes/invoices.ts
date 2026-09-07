import { Router } from "express";
import { z } from "zod";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { invoiceService } from "@/lib/services/invoice-service";
import { asyncHandler } from "@/lib/api/route";

export const invoicesRouter = Router();

const updateInvoiceSettingsSchema = z.object({
  templateId: z.string().trim().min(1).max(64).optional(),
  logoAlignment: z.enum(["left", "center", "right"]).optional(),
  nameAlignment: z.enum(["left", "center", "right"]).optional(),
  accentColor: z.string().trim().max(32).optional(),
  showLogo: z.boolean().optional(),
  showTaxNumber: z.boolean().optional(),
  taxNumber: z.string().trim().max(50).nullable().optional(),
  showNotes: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  terms: z.string().trim().max(2000).nullable().optional(),
  paperSize: z.enum(["a4", "a5", "letter"]).optional(),
  fontFamily: z.string().trim().max(64).nullable().optional(),
  fontWeight: z.string().trim().max(32).nullable().optional(),
  fontStyle: z.string().trim().max(32).nullable().optional(),
  customTemplateName: z.string().trim().max(100).nullable().optional(),
  customElements: z.array(z.string()).nullable().optional(),
  customLayoutDirection: z.enum(["column", "row"]).nullable().optional(),
  customElementOffsets: z.string().nullable().optional(),
  customElementStyles: z.string().nullable().optional(),
});

invoicesRouter.get("/settings", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const settings = await invoiceService.getInvoiceSettings(actor.id);
  return res.json({ settings });
}));

invoicesRouter.patch("/settings", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const parsed = updateInvoiceSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid invoice settings input", details: parsed.error.issues });
  }

  const updated = await invoiceService.updateInvoiceSettings(actor.id, parsed.data as any);
  return res.json({ settings: updated });
}));

invoicesRouter.get("/sample-pdf", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const overrides: any = {};
  if (req.query.templateId) overrides.templateId = String(req.query.templateId);
  if (req.query.logoAlignment) overrides.logoAlignment = String(req.query.logoAlignment);
  if (req.query.nameAlignment) overrides.nameAlignment = String(req.query.nameAlignment);
  if (req.query.accentColor) overrides.accentColor = String(req.query.accentColor);
  if (req.query.showLogo != null) overrides.showLogo = req.query.showLogo === "true";
  if (req.query.showTaxNumber != null) overrides.showTaxNumber = req.query.showTaxNumber === "true";
  if (req.query.taxNumber != null) overrides.taxNumber = String(req.query.taxNumber);
  if (req.query.showNotes != null) overrides.showNotes = req.query.showNotes === "true";
  if (req.query.notes != null) overrides.notes = String(req.query.notes);
  if (req.query.terms != null) overrides.terms = String(req.query.terms);
  if (req.query.paperSize != null) overrides.paperSize = String(req.query.paperSize);
  if (req.query.customElements != null) {
    overrides.customElements = Array.isArray(req.query.customElements)
      ? req.query.customElements
      : String(req.query.customElements).split(",").map((s: string) => s.trim()).filter(Boolean);
  }
  if (req.query.customElementStyles != null) overrides.customElementStyles = String(req.query.customElementStyles);
  if (req.query.customElementOffsets != null) overrides.customElementOffsets = String(req.query.customElementOffsets);

  const { pdfBuffer, filename } = await invoiceService.generateSampleInvoicePdf(actor.id, overrides);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", String(pdfBuffer.length));
  return res.send(pdfBuffer);
}));
