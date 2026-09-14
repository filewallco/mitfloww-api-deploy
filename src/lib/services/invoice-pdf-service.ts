import puppeteer, { type Browser } from "puppeteer";
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
        email: data.company.email,
        phone: data.user.phone,
        website: data.company.website,
        address: data.user.address,
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
      await page.evaluate("Boolean(document.fonts && document.fonts.ready)");

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
  }
}

export const invoicePdfService = new InvoicePdfService();
