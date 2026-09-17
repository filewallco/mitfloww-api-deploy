import puppeteer, { type Browser } from "puppeteer";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "node:fs";
import { generateInvoiceHtml, type InvoiceLineItem, type InvoiceRenderData } from "./invoice-html-renderer.js";
import { INVOICE_PAPER_CONFIG, type InvoicePaperSize } from "../invoices/invoice-layout-schema.js";

export { type InvoiceLineItem };

export interface InvoicePdfData {
  isSample?: boolean;
  lineItems?: InvoiceLineItem[];
  subtotal?: number;
  advancePaymentPaid?: number;
  balanceAmount?: number;
  gatewayFee?: number;
  invoiceNumber: string;
  paymentReference?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  paymentMethod: string;
  paymentStatus: string;
  currency: string;
  amount: number;
  clientName: string;
  clientEmail?: string | null;
  clientCompany?: string | null;
  clientAddress?: string | null;
  clientPhone?: string | null;
  projectTitle: string;
  deliverables?: Array<{ name: string; size?: string }>;
  company: {
    name: string;
    tagline?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    address?: string | null;
    taxNumber?: string | null;
    logoBuffer?: Buffer | null;
    logoUrl?: string | null;
  };
  user: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };
  settings: {
    templateId: string;
    logoAlignment: "left" | "center" | "right";
    nameAlignment: "left" | "center" | "right";
    accentColor: string;
    showLogo: boolean;
    showTaxNumber: boolean;
    taxNumber?: string | null;
    showNotes: boolean;
    notes?: string | null;
    terms?: string | null;
    paperSize?: string;
    fontFamily?: string | null;
    fontWeight?: string | null;
    fontStyle?: string | null;
    logoSize?: "sm" | "md" | "lg" | "xl" | null;
    customElements?: string[] | null;
    customElementStyles?: string | null;
    customElementOffsets?: string | null;
  };
}

export function resolveChromeExecutablePath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }

  const candidates = [
    // Windows Chrome
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    // Windows Edge
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    // Linux
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export class InvoicePdfService {
  private browserPromise: Promise<Browser> | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      const executablePath = resolveChromeExecutablePath();
      this.browserPromise = puppeteer
        .launch({
          headless: true,
          executablePath,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--font-render-hinting=none",
          ],
        })
        .then((browser) => {
          browser.on("disconnected", () => {
            this.browserPromise = null;
          });
          return browser;
        })
        .catch((err) => {
          this.browserPromise = null;
          throw err;
        });
    }
    return this.browserPromise;
  }

  async generatePdfLibFallback(
    data: InvoicePdfData,
    lineItems: InvoiceLineItem[],
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();
    const margin = 40;
    let currentY = height - margin;

    // Header: Company Name & INVOICE
    const companyName = (data.company.name || data.user.name || "MitFloww Deliverables").slice(0, 45);
    page.drawText(companyName, {
      x: margin,
      y: currentY - 20,
      size: 18,
      font: fontBold,
      color: rgb(0.09, 0.11, 0.15),
    });

    page.drawText("INVOICE", {
      x: width - margin - 110,
      y: currentY - 20,
      size: 24,
      font: fontBold,
      color: rgb(0.0, 0.36, 0.87), // #005bdd
    });

    currentY -= 45;

    // Subtag / invoice meta
    if (data.company.tagline) {
      page.drawText(data.company.tagline.slice(0, 60), {
        x: margin,
        y: currentY,
        size: 9,
        font: fontRegular,
        color: rgb(0.4, 0.45, 0.5),
      });
    }

    page.drawText(`Invoice #: ${data.invoiceNumber}`, {
      x: width - margin - 150,
      y: currentY,
      size: 10,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    currentY -= 16;
    page.drawText(`Date: ${data.invoiceDate}`, {
      x: width - margin - 150,
      y: currentY,
      size: 9,
      font: fontRegular,
      color: rgb(0.35, 0.4, 0.45),
    });

    currentY -= 14;
    page.drawText(`Payment Status: ${data.paymentStatus.toUpperCase()}`, {
      x: width - margin - 150,
      y: currentY,
      size: 9,
      font: fontBold,
      color: rgb(0.08, 0.55, 0.25),
    });

    currentY -= 30;

    // Bill To & From Box
    page.drawRectangle({
      x: margin,
      y: currentY - 70,
      width: width - margin * 2,
      height: 70,
      color: rgb(0.97, 0.98, 0.99),
      borderColor: rgb(0.9, 0.92, 0.95),
      borderWidth: 1,
    });

    page.drawText("BILLED TO:", {
      x: margin + 15,
      y: currentY - 18,
      size: 9,
      font: fontBold,
      color: rgb(0.4, 0.45, 0.5),
    });
    page.drawText(data.clientName || "Valued Client", {
      x: margin + 15,
      y: currentY - 34,
      size: 12,
      font: fontBold,
      color: rgb(0.1, 0.12, 0.15),
    });
    if (data.clientEmail) {
      page.drawText(data.clientEmail, {
        x: margin + 15,
        y: currentY - 48,
        size: 9,
        font: fontRegular,
        color: rgb(0.4, 0.45, 0.5),
      });
    }

    page.drawText("PROJECT:", {
      x: width / 2 + 15,
      y: currentY - 18,
      size: 9,
      font: fontBold,
      color: rgb(0.4, 0.45, 0.5),
    });
    page.drawText((data.projectTitle || "Project Deliverables").slice(0, 35), {
      x: width / 2 + 15,
      y: currentY - 34,
      size: 11,
      font: fontBold,
      color: rgb(0.1, 0.12, 0.15),
    });
    if (data.paymentMethod) {
      page.drawText(`Payment Method: ${data.paymentMethod}`, {
        x: width / 2 + 15,
        y: currentY - 48,
        size: 9,
        font: fontRegular,
        color: rgb(0.4, 0.45, 0.5),
      });
    }

    currentY -= 95;

    // Line items table header
    page.drawRectangle({
      x: margin,
      y: currentY - 24,
      width: width - margin * 2,
      height: 24,
      color: rgb(0.94, 0.95, 0.97),
    });

    page.drawText("DESCRIPTION", {
      x: margin + 12,
      y: currentY - 16,
      size: 9,
      font: fontBold,
      color: rgb(0.3, 0.35, 0.4),
    });
    page.drawText("QTY", {
      x: width - margin - 220,
      y: currentY - 16,
      size: 9,
      font: fontBold,
      color: rgb(0.3, 0.35, 0.4),
    });
    page.drawText("RATE", {
      x: width - margin - 140,
      y: currentY - 16,
      size: 9,
      font: fontBold,
      color: rgb(0.3, 0.35, 0.4),
    });
    page.drawText("AMOUNT", {
      x: width - margin - 65,
      y: currentY - 16,
      size: 9,
      font: fontBold,
      color: rgb(0.3, 0.35, 0.4),
    });

    currentY -= 28;

    // Table rows
    const currency = data.currency || "INR";
    for (const item of lineItems) {
      page.drawText((item.description || "Project Item").slice(0, 50), {
        x: margin + 12,
        y: currentY - 12,
        size: 9,
        font: fontRegular,
        color: rgb(0.15, 0.18, 0.2),
      });

      page.drawText(String(item.qty || 1), {
        x: width - margin - 215,
        y: currentY - 12,
        size: 9,
        font: fontRegular,
        color: rgb(0.15, 0.18, 0.2),
      });

      page.drawText(`${currency} ${(Number(item.rate) || 0).toFixed(2)}`, {
        x: width - margin - 150,
        y: currentY - 12,
        size: 9,
        font: fontRegular,
        color: rgb(0.15, 0.18, 0.2),
      });

      page.drawText(`${currency} ${(Number(item.amount) || 0).toFixed(2)}`, {
        x: width - margin - 75,
        y: currentY - 12,
        size: 9,
        font: fontBold,
        color: rgb(0.15, 0.18, 0.2),
      });

      currentY -= 24;

      page.drawLine({
        start: { x: margin, y: currentY },
        end: { x: width - margin, y: currentY },
        thickness: 0.5,
        color: rgb(0.9, 0.92, 0.94),
      });

      currentY -= 6;
    }

    currentY -= 15;

    // Deliverables list if any
    if (data.deliverables && data.deliverables.length > 0) {
      page.drawText("Delivered Files:", {
        x: margin,
        y: currentY,
        size: 9,
        font: fontBold,
        color: rgb(0.4, 0.45, 0.5),
      });
      currentY -= 14;

      for (const d of data.deliverables.slice(0, 5)) {
        page.drawText(`• ${d.name} ${d.size ? `(${d.size})` : ""}`.slice(0, 65), {
          x: margin + 10,
          y: currentY,
          size: 8,
          font: fontRegular,
          color: rgb(0.3, 0.35, 0.4),
        });
        currentY -= 12;
      }
      currentY -= 10;
    }

    // Totals Section on the right
    const totalsX = width - margin - 220;
    const totalsValX = width - margin - 75;

    page.drawText("Subtotal:", {
      x: totalsX,
      y: currentY,
      size: 9,
      font: fontRegular,
      color: rgb(0.4, 0.45, 0.5),
    });
    page.drawText(`${currency} ${(data.subtotal ?? data.amount).toFixed(2)}`, {
      x: totalsValX,
      y: currentY,
      size: 9,
      font: fontRegular,
      color: rgb(0.15, 0.18, 0.2),
    });
    currentY -= 18;

    if (data.advancePaymentPaid && data.advancePaymentPaid > 0) {
      page.drawText("Advance Paid:", {
        x: totalsX,
        y: currentY,
        size: 9,
        font: fontRegular,
        color: rgb(0.4, 0.45, 0.5),
      });
      page.drawText(`-${currency} ${data.advancePaymentPaid.toFixed(2)}`, {
        x: totalsValX,
        y: currentY,
        size: 9,
        font: fontRegular,
        color: rgb(0.08, 0.55, 0.25),
      });
      currentY -= 18;

      page.drawText("Balance Paid:", {
        x: totalsX,
        y: currentY,
        size: 9,
        font: fontRegular,
        color: rgb(0.4, 0.45, 0.5),
      });
      page.drawText(`${currency} ${(data.balanceAmount ?? data.amount).toFixed(2)}`, {
        x: totalsValX,
        y: currentY,
        size: 9,
        font: fontRegular,
        color: rgb(0.15, 0.18, 0.2),
      });
      currentY -= 18;
    }

    page.drawLine({
      start: { x: totalsX, y: currentY + 4 },
      end: { x: width - margin, y: currentY + 4 },
      thickness: 1,
      color: rgb(0.8, 0.82, 0.85),
    });

    page.drawText("Total Paid:", {
      x: totalsX,
      y: currentY - 10,
      size: 11,
      font: fontBold,
      color: rgb(0.09, 0.11, 0.15),
    });
    page.drawText(`${currency} ${data.amount.toFixed(2)}`, {
      x: totalsValX,
      y: currentY - 10,
      size: 12,
      font: fontBold,
      color: rgb(0.0, 0.36, 0.87),
    });

    // Notes and terms
    const notesY = Math.max(margin + 50, currentY - 70);
    page.drawText("Terms & Conditions:", {
      x: margin,
      y: notesY,
      size: 9,
      font: fontBold,
      color: rgb(0.4, 0.45, 0.5),
    });
    page.drawText(
      (data.settings.terms || "All deliverables licensed upon full payment completion. Thank you for your business!").slice(0, 100),
      {
        x: margin,
        y: notesY - 14,
        size: 8,
        font: fontRegular,
        color: rgb(0.5, 0.55, 0.6),
      }
    );

    // Footer
    page.drawText("Generated securely via MitFloww", {
      x: margin,
      y: margin,
      size: 8,
      font: fontRegular,
      color: rgb(0.6, 0.65, 0.7),
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }


  async generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
    const lineItems: InvoiceLineItem[] =
      data.lineItems && data.lineItems.length > 0
        ? data.lineItems
        : [
            {
              description: data.projectTitle || "Project Deliverables & Assets",
              qty: 1,
              rate: data.amount,
              amount: data.amount,
            },
          ];

    const renderData: InvoiceRenderData = {
      isSample: data.isSample,
      invoiceNumber: data.invoiceNumber,
      paymentReference: data.paymentReference,
      invoiceDate: data.invoiceDate,
      dueDate: data.dueDate,
      paymentMethod: data.paymentMethod,
      paymentStatus: data.paymentStatus,
      currency: data.currency,
      amount: data.amount,
      subtotal: data.subtotal,
      advancePaymentPaid: data.advancePaymentPaid,
      balanceAmount: data.balanceAmount,
      gatewayFee: data.gatewayFee ?? 0,
      deliverables: data.deliverables,
      taxRate: undefined,
      taxAmount: undefined,
      clientName: data.clientName,
      clientEmail: data.clientEmail,
      clientCompany: data.clientCompany,
      clientAddress: data.clientAddress,
      clientPhone: data.clientPhone,
      company: {
        name: data.company.name,
        tagline: data.company.tagline,
        email: data.company.email || data.user.email,
        phone: data.company.phone || data.user.phone,
        website: data.company.website,
        address: data.company.address || data.user.address,
        taxNumber: data.settings.taxNumber,
        logoBuffer: data.company.logoBuffer,
        logoUrl: undefined,
      },
      user: {
        name: data.user.name,
        email: data.user.email,
        phone: data.user.phone,
        address: data.user.address,
      },
      lineItems,
      settings: {
        templateId: data.settings.templateId,
        paperSize: data.settings.paperSize,
        accentColor: data.settings.accentColor,
        showLogo: data.settings.showLogo,
        showTaxNumber: data.settings.showTaxNumber,
        taxNumber: data.settings.taxNumber,
        showNotes: data.settings.showNotes,
        notes: data.settings.notes,
        terms: data.settings.terms,
        logoAlignment: data.settings.logoAlignment,
        nameAlignment: data.settings.nameAlignment,
        fontFamily: data.settings.fontFamily,
        fontWeight: data.settings.fontWeight,
        fontStyle: data.settings.fontStyle,
        logoSize: data.settings.logoSize,
        customElements: data.settings.customElements,
        customElementStyles: data.settings.customElementStyles,
        customElementOffsets: data.settings.customElementOffsets,
      },
    };

    const html = generateInvoiceHtml(renderData);

    const paperKey = (data.settings.paperSize?.toLowerCase() || "a4") as InvoicePaperSize;
    const paperConfig = INVOICE_PAPER_CONFIG[paperKey] || INVOICE_PAPER_CONFIG.a4;

    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();

      try {
        await page.setViewport({
          width: paperConfig.width,
          height: paperConfig.height,
          deviceScaleFactor: 2, // High resolution crisp text
        });

        await page.setContent(html, {
          waitUntil: "load",
          timeout: 30000,
        });

        // Explicitly wait for Google Fonts to be loaded into Chromium's font cache!
        await page.evaluate(() => { const doc = (globalThis as any).document; return doc?.fonts?.ready ?? Promise.resolve(); });

        const pdfBuffer = await page.pdf({
          format: paperConfig.pdfFormat,
          printBackground: true,
          preferCSSPageSize: true,
          margin: {
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          },
        });

        return Buffer.from(pdfBuffer);
      } finally {
        await page.close().catch(() => {});
      }
    } catch (browserError) {
      console.warn(
        "[InvoicePdfService] Puppeteer launch failed (expected on Vercel/serverless). Generating with pdf-lib fallback:",
        (browserError as any)?.message || String(browserError)
      );
      return await this.generatePdfLibFallback(data, lineItems);
    }
  }
}

export const invoicePdfService = new InvoicePdfService();
