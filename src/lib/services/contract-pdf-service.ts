import { createScopedLogger } from "@/lib/logger";
import puppeteer, { type Browser } from "puppeteer";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "node:fs";
import {
  generateContractHtml,
  formatContractCurrency,
  type ContractPdfData,
} from "./contract-html-renderer.js";
import { resolveChromeExecutablePath } from "./invoice-pdf-service.js";

export { type ContractPdfData };

const scopedLogger = createScopedLogger("contract-pdf-service");

export class ContractPdfService {
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

  async generatePdfLibFallback(data: ContractPdfData): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();
    const margin = 40;
    let currentY = height - margin;

    // Header
    page.drawText("MitFloww Project Agreement", {
      x: margin,
      y: currentY - 20,
      size: 18,
      font: fontBold,
      color: rgb(0.09, 0.11, 0.15),
    });

    const isAccepted = data.status === "accepted";
    const statusText = isAccepted ? `ACTIVE (v${data.version})` : `PROPOSED (v${data.version})`;
    page.drawText(statusText, {
      x: width - margin - 120,
      y: currentY - 18,
      size: 11,
      font: fontBold,
      color: isAccepted ? rgb(0.06, 0.72, 0.5) : rgb(0.96, 0.62, 0.07),
    });

    currentY -= 45;

    // Project Name
    page.drawText(`Project: ${data.projectTitle}`, {
      x: margin,
      y: currentY,
      size: 13,
      font: fontBold,
      color: rgb(0.12, 0.15, 0.2),
    });
    currentY -= 18;

    page.drawText(`Date: ${data.date} | ID: ${data.projectId.slice(0, 8)}`, {
      x: margin,
      y: currentY,
      size: 9,
      font: fontRegular,
      color: rgb(0.4, 0.45, 0.5),
    });
    currentY -= 30;

    // Parties
    page.drawText("Parties:", {
      x: margin,
      y: currentY,
      size: 10,
      font: fontBold,
      color: rgb(0.3, 0.35, 0.4),
    });
    currentY -= 16;
    page.drawText(`Creator: ${data.creatorName} (${data.creatorEmail})`, {
      x: margin + 10,
      y: currentY,
      size: 9,
      font: fontRegular,
      color: rgb(0.15, 0.18, 0.2),
    });
    currentY -= 14;
    page.drawText(`Client: ${data.clientName} (${data.clientEmail || "Pending Confirmation"})`, {
      x: margin + 10,
      y: currentY,
      size: 9,
      font: fontRegular,
      color: rgb(0.15, 0.18, 0.2),
    });
    currentY -= 30;

    // Financial terms
    page.drawText("Commercial Terms:", {
      x: margin,
      y: currentY,
      size: 10,
      font: fontBold,
      color: rgb(0.3, 0.35, 0.4),
    });
    currentY -= 16;
    const formattedTotal = formatContractCurrency(data.amountCents, data.currency);
    page.drawText(`Total Project Amount: ${formattedTotal}`, {
      x: margin + 10,
      y: currentY,
      size: 9,
      font: fontRegular,
      color: rgb(0.15, 0.18, 0.2),
    });
    currentY -= 14;

    if (data.advancePaymentEnabled) {
      const formattedAdv = formatContractCurrency(data.advanceAmountCents, data.currency);
      const formattedRem = formatContractCurrency(data.remainingAmountCents, data.currency);
      page.drawText(`Advance Payment: ${formattedAdv} | Remaining: ${formattedRem}`, {
        x: margin + 10,
        y: currentY,
        size: 9,
        font: fontRegular,
        color: rgb(0.15, 0.18, 0.2),
      });
      currentY -= 14;
    }

    page.drawText(`Included Revisions: ${data.revisionLimit} | Extra Revision Cost: ${formatContractCurrency(data.extraRevisionCostCents, data.currency)}`, {
      x: margin + 10,
      y: currentY,
      size: 9,
      font: fontRegular,
      color: rgb(0.15, 0.18, 0.2),
    });
    currentY -= 35;

    // Digital Acceptance
    page.drawText("Digital Acceptance & Record:", {
      x: margin,
      y: currentY,
      size: 10,
      font: fontBold,
      color: rgb(0.3, 0.35, 0.4),
    });
    currentY -= 16;
    const acceptMsg = isAccepted
      ? `Digitally accepted by ${data.acceptedBy || data.clientEmail} on ${data.acceptedAt || data.date} (Version ${data.version})`
      : `Pending digital acceptance by client on MitFloww platform (Proposed Version ${data.version})`;
    page.drawText(acceptMsg, {
      x: margin + 10,
      y: currentY,
      size: 9,
      font: fontRegular,
      color: isAccepted ? rgb(0.04, 0.47, 0.34) : rgb(0.4, 0.45, 0.5),
    });

    // Footer
    page.drawText("Generated securely via MitFloww Contract Infrastructure", {
      x: margin,
      y: margin,
      size: 8,
      font: fontRegular,
      color: rgb(0.6, 0.65, 0.7),
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  async generateContractPdf(data: ContractPdfData): Promise<Buffer> {
    const html = generateContractHtml(data);

    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();

      try {
        await page.setContent(html, {
          waitUntil: "load",
        });

        const pdfBuffer = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: {
            top: "14mm",
            bottom: "14mm",
            left: "14mm",
            right: "14mm",
          },
        });

        return Buffer.from(pdfBuffer);
      } finally {
        await page.close().catch(() => {});
      }
    } catch (puppeteerError) {
      scopedLogger.warn(
        "Puppeteer contract PDF generation failed, falling back to pdf-lib",
        { error: puppeteerError instanceof Error ? puppeteerError.message : String(puppeteerError) },
      );
      return this.generatePdfLibFallback(data);
    }
  }
}

export const contractPdfService = new ContractPdfService();
