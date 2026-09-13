import {
  PDFDocument,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  StandardFonts,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import sharp from "sharp";

export interface InvoiceLineItem {
  description: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface InvoicePdfData {
  isSample?: boolean;
  lineItems?: InvoiceLineItem[];
  subtotal?: number;
  advancePaymentPaid?: number;
  balanceAmount?: number;
  invoiceNumber: string;
  paymentReference?: string | null;
  invoiceDate: string;
  paymentMethod: string;
  paymentStatus: string;
  currency: string;
  amount: number;
  clientName: string;
  clientEmail?: string | null;
  projectTitle: string;
  deliverables?: Array<{ name: string; size?: string }>;
  company: {
    name: string;
    tagline?: string | null;
    email?: string | null;
    website?: string | null;
    logoBuffer?: Buffer | null;
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
    customElements?: string[] | null;
    customElementStyles?: string | null;
    customElementOffsets?: string | null;
  };
}

const ACCENT_COLORS: Record<string, { r: number; g: number; b: number }> = {
  primary: { r: 99 / 255, g: 102 / 255, b: 241 / 255 }, // #6366f1
  violet: { r: 124 / 255, g: 58 / 255, b: 237 / 255 }, // #7c3aed
  indigo: { r: 79 / 255, g: 70 / 255, b: 229 / 255 }, // #4f46e5
  emerald: { r: 5 / 255, g: 150 / 255, b: 105 / 255 }, // #059669
  amber: { r: 217 / 255, g: 119 / 255, b: 6 / 255 }, // #d97706
  slate: { r: 51 / 255, g: 65 / 255, b: 85 / 255 }, // #334155
};

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  if (!hex || typeof hex !== "string") return null;
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return { r, g, b };
  } else if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return { r, g, b };
  }
  return null;
}

function getLineItems(data: InvoicePdfData): InvoiceLineItem[] {
  if (data.lineItems && data.lineItems.length > 0) {
    return data.lineItems;
  }
  return [
    {
      description: data.projectTitle || "Project Deliverables & Assets",
      qty: 1,
      rate: data.amount,
      amount: data.amount,
    },
  ];
}

function resolveRgbColor(colorKey: string) {
  if (!colorKey) return rgb(0 / 255, 91 / 255, 221 / 255);
  const hex = parseHexColor(colorKey);
  if (hex) {
    return rgb(hex.r, hex.g, hex.b);
  }
  const normalized = colorKey?.toLowerCase() || "primary";
  const found = ACCENT_COLORS[normalized];
  if (found) {
    return rgb(found.r, found.g, found.b);
  }
  return rgb(0 / 255, 91 / 255, 221 / 255);
}

function formatCurrencyString(currency: string, amount: number): string {
  const curr = (currency || "INR").toUpperCase();
  const formatted = amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (curr === "INR") {
    return `INR ${formatted}`;
  }
  if (curr === "USD") {
    return `$ ${formatted}`;
  }
  if (curr === "EUR") {
    return `EUR ${formatted}`;
  }
  if (curr === "GBP") {
    return `GBP ${formatted}`;
  }
  return `${curr} ${formatted}`;
}

export class InvoicePdfService {
  async generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
    const doc = await PDFDocument.create();

    const size = data.settings.paperSize?.toLowerCase();
    let pageDimensions: [number, number] = [595.28, 841.89]; // default A4
    if (size === "a5") {
      pageDimensions = [419.53, 595.28];
    } else if (size === "letter") {
      pageDimensions = [612.0, 792.0];
    }

    const page = doc.addPage(pageDimensions);
    const basePageWidth = 595.28;
    const basePageHeight = 841.89;
    const pageScale = Math.min(
      pageDimensions[0] / basePageWidth,
      pageDimensions[1] / basePageHeight,
    );
    const pageOffsetX = (pageDimensions[0] - basePageWidth * pageScale) / 2;
    const pageOffsetY = (pageDimensions[1] - basePageHeight * pageScale) / 2;

    // Template renderers use A4 points as their design coordinate system.
    // Scale that coordinate system to the selected paper size so A5/Letter
    // invoices stay inside the page instead of being clipped off-canvas.
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(
        pageScale,
        0,
        0,
        pageScale,
        pageOffsetX,
        pageOffsetY,
      ),
    );
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

    let logoImage: any = null;
    if (data.settings.showLogo && data.company.logoBuffer) {
      try {
        const pngBuffer = await sharp(data.company.logoBuffer)
          .resize({ width: 240, height: 120, fit: "inside" })
          .png()
          .toBuffer();
        logoImage = await doc.embedPng(pngBuffer);
      } catch (err) {
        console.warn("Failed to embed invoice logo:", err);
      }
    }

    const templateId = data.settings.templateId || "modern";
    const createTemplatePage = () => {
      const nextPage = doc.addPage(pageDimensions);
      nextPage.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(
          pageScale,
          0,
          0,
          pageScale,
          pageOffsetX,
          pageOffsetY,
        ),
      );
      return nextPage;
    };
    // The editor preview and the old PDF renderer had two separate designs.
    // Keep one renderer for sample and project PDFs so the selected editor
    // template (including its elements, styles and offsets) is the source of
    // truth for both downloads.
    this.renderEditorTemplate({
      page,
      createPage: createTemplatePage,
      data,
      helvetica,
      helveticaBold,
      helveticaOblique,
      logoImage,
      templateId,
    });

    const pdfBytes = await doc.save();
    return Buffer.from(pdfBytes);
  }

  private renderEditorTemplate(ctx: {
    page: PDFPage;
    createPage: () => PDFPage;
    data: InvoicePdfData;
    helvetica: PDFFont;
    helveticaBold: PDFFont;
    helveticaOblique: PDFFont;
    logoImage: any;
    templateId: string;
  }) {
    const { data, helvetica, helveticaBold, helveticaOblique, logoImage, templateId, createPage } = ctx;
    let page = ctx.page;
    const width = 595.28;
    const left = 50;
    const right = width - 50;
    const contentWidth = right - left;
    const accent = resolveRgbColor(data.settings.accentColor);
    const dark = rgb(0.08, 0.1, 0.14);
    const muted = rgb(0.36, 0.4, 0.46);
    const border = rgb(0.82, 0.84, 0.87);
    const light = rgb(0.96, 0.97, 0.98);
    const white = rgb(1, 1, 1);

    const parseJson = (value: unknown): Record<string, any> => {
      if (!value) return {};
      if (typeof value === "object") return value as Record<string, any>;
      try {
        const parsed = JSON.parse(String(value));
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    };
    const styles = parseJson(data.settings.customElementStyles);
    const offsets = parseJson(data.settings.customElementOffsets);
    const elements = data.settings.customElements;
    const visible = (id: string) =>
      !elements || elements.length === 0
        ? templateId !== "custom"
        : elements.includes(id);
    const styleFor = (id: string) => styles[id] || {};
    const offsetFor = (id: string) => {
      const value = offsets[id] || {};
      return { x: Number(value.x) || 0, y: Number(value.y) || 0 };
    };
    const colorFor = (value: unknown, fallback: ReturnType<typeof rgb>) => {
      if (typeof value !== "string" || !value.trim()) return fallback;
      return resolveRgbColor(value);
    };
    const fontFor = (style: Record<string, any>, fallback: PDFFont) => {
      if (style.fontStyle === "italic") return helveticaOblique;
      if (style.fontWeight === "bold" || Number(style.fontWeight) >= 600) return helveticaBold;
      if (style.fontWeight) return helvetica;
      return fallback;
    };
    const sizeFor = (style: Record<string, any>, fallback: number) => {
      const value = Number(style.fontSize);
      return Number.isFinite(value) && value > 0 ? Math.max(6, Math.min(26, value * 0.75)) : fallback;
    };
    const textLines = (
      value: unknown,
      maxChars: number,
      font: PDFFont,
      size: number,
      maxWidth?: number,
    ) => {
      const source = String(value ?? "");
      const lines: string[] = [];
      const widthLimit = maxWidth && Number.isFinite(maxWidth) ? maxWidth : undefined;
      const fits = (text: string) =>
        !widthLimit || font.widthOfTextAtSize(text, size) <= widthLimit;

      // Preserve explicit newlines and wrap by measured font width. This keeps
      // long client names, addresses and deliverable names inside their
      // element instead of relying on a character-count approximation.
      for (const paragraph of source.split(/\r?\n/)) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        let line = "";
        for (const word of words.length > 0 ? words : [""]) {
          // Break a single unbroken token (URLs, IDs and filenames) when it
          // cannot fit on one line.
          let remaining = word;
          while (remaining && !fits(remaining) && remaining.length > 1) {
            let cut = remaining.length - 1;
            while (cut > 1 && !fits(remaining.slice(0, cut))) cut -= 1;
            const chunk = remaining.slice(0, cut);
            if (line) {
              lines.push(line);
              line = "";
            }
            lines.push(chunk);
            remaining = remaining.slice(cut);
          }
          const candidate = line ? `${line} ${remaining}` : remaining;
          if (line && (!fits(candidate) || candidate.length > maxChars)) {
            lines.push(line);
            line = remaining;
          } else {
            line = candidate;
          }
        }
        if (line || words.length === 0) lines.push(line);
      }
      return lines.length > 0 ? lines : [""];
    };
    const drawText = (
      value: unknown,
      x: number,
      y: number,
      options: {
        size?: number;
        font?: PDFFont;
        color?: ReturnType<typeof rgb>;
        maxChars?: number;
        lineGap?: number;
        align?: "left" | "center" | "right";
        maxWidth?: number;
      } = {},
    ) => {
      const size = options.size ?? 9;
      const font = options.font ?? helvetica;
      const color = options.color ?? dark;
      const maxChars = options.maxChars ?? 90;
      const lineGap = options.lineGap ?? size + 3;
      const lines = textLines(value, maxChars, font, size, options.maxWidth);
      lines.forEach((line, index) => {
        const lineWidth = font.widthOfTextAtSize(line, size);
        let lineX = x;
        if (options.align === "center") lineX = x - lineWidth / 2;
        if (options.align === "right") lineX = x - lineWidth;
        page.drawText(line, { x: lineX, y: y - index * lineGap, size, font, color });
      });
      return y - lines.length * lineGap;
    };
    const elementFrame = (
      id: string,
      x: number,
      y: number,
      elementWidth: number,
      elementHeight: number,
    ) => {
      const offset = offsetFor(id);
      const style = styleFor(id);
      const frameX = x + offset.x;
      // The editor's CSS y offset grows downwards; PDF coordinates grow upwards.
      const frameY = y - offset.y;
      if (style.fillColor) {
        page.drawRectangle({
          x: frameX,
          y: frameY - elementHeight,
          width: elementWidth,
          height: elementHeight,
          color: colorFor(style.fillColor, white),
          opacity: typeof style.opacity === "number" ? style.opacity : 1,
        });
      }
      if (style.showBorder || style.borderColor) {
        page.drawRectangle({
          x: frameX,
          y: frameY - elementHeight,
          width: elementWidth,
          height: elementHeight,
          borderColor: colorFor(style.borderColor, border),
          borderWidth: Number(style.borderWidth) || 0.75,
        });
      }
      return { x: frameX, y: frameY, style };
    };
    const drawElementText = (
      id: string,
      value: unknown,
      x: number,
      y: number,
      options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; maxChars?: number; maxWidth?: number; align?: "left" | "center" | "right" } = {},
    ) => {
      const style = styleFor(id);
      const offset = offsetFor(id);
      const font = style.fontWeight || style.fontStyle
        ? fontFor(style, options.font || helvetica)
        : options.font || fontFor(style, helvetica);
      const size = style.fontSize ? sizeFor(style, options.size || 9) : options.size || sizeFor(style, 9);
      const color = options.color || colorFor(style.fontColor, dark);
      return drawText(value, x + offset.x, y - offset.y, { ...options, font, size, color });
    };
    const drawLogo = (id: string, x: number, y: number, maxWidth: number) => {
      if (!logoImage || !visible(id) || !data.settings.showLogo) return;
      const offset = offsetFor(id);
      const logoWidth = Math.min(maxWidth, logoImage.width);
      const logoHeight = (logoWidth / logoImage.width) * logoImage.height;
      page.drawImage(logoImage, {
        x: x + offset.x,
        y: y - offset.y - logoHeight,
        width: logoWidth,
        height: logoHeight,
      });
      elementFrame(id, x, y, logoWidth, logoHeight);
    };

    const items = getLineItems(data);
    const sampleValue = (realValue: string, placeholder: string) => data.isSample ? placeholder : realValue;
    const moneyValue = (value: number, placeholder: string) => data.isSample ? placeholder : formatCurrencyString(data.currency, value);
    const subtotal = data.subtotal ?? items.reduce((sum, item) => sum + item.amount, 0);
    const total = data.amount ?? subtotal;
    const isPaid = String(data.paymentStatus).toLowerCase() === "paid";
    const invoiceStatus = isPaid ? "PAID IN FULL" : String(data.paymentStatus || "PENDING").toUpperCase();
    const companyName = data.company.name || data.user.name || "Invoice";
    const clientName = data.clientName || data.clientEmail || "Valued Client";
    // Browser preview sizes are CSS pixels; the PDF renderer works in points
    // (1 CSS px = 0.75 pt). Keeping this conversion here prevents titles and
    // metadata from growing disproportionately in downloaded invoices.
    const titleSize = templateId === "agency" ? 22.5 : templateId === "compact" ? 13.5 : 18;
    const headerStyle = styleFor("header");
    const headerOffset = offsetFor("header");

    // These header treatments mirror the six editor templates. The content
    // blocks below are shared so all templates use the same real invoice data.
    if (templateId === "agency") {
      page.drawRectangle({ x: 0, y: 0, width: 12, height: 841.89, color: accent });
      page.drawRectangle({ x: left, y: 770, width: contentWidth, height: 2.5, color: dark });
    } else if (templateId === "compact") {
      const headerTop = 809;
      page.drawRectangle({
        x: left + headerOffset.x,
        y: headerTop - 60 - headerOffset.y,
        width: contentWidth,
        height: 60,
        color: colorFor(headerStyle.fillColor, accent),
        opacity: typeof headerStyle.opacity === "number" ? headerStyle.opacity : 1,
      });
      if (headerStyle.showBorder || headerStyle.borderColor) {
        page.drawRectangle({
          x: left + headerOffset.x,
          y: headerTop - 60 - headerOffset.y,
          width: contentWidth,
          height: 60,
          borderColor: colorFor(headerStyle.borderColor, border),
          borderWidth: Number(headerStyle.borderWidth) || 0.75,
        });
      }
    } else if (templateId === "modern") {
      page.drawLine({ start: { x: left, y: 755 }, end: { x: right, y: 755 }, thickness: 2, color: accent });
    } else if (templateId === "minimal") {
      page.drawLine({ start: { x: left, y: 790 }, end: { x: right, y: 790 }, thickness: 0.75, color: border });
    } else if (templateId === "custom") {
      page.drawLine({ start: { x: left, y: 770 }, end: { x: right, y: 770 }, thickness: 1, color: accent });
    } else {
      // Corporate editor: white paper, thin dark header divider, no legacy banner.
      page.drawLine({ start: { x: left, y: 738 }, end: { x: right, y: 738 }, thickness: 1.5, color: dark });
    }

    const headerTop = templateId === "corporate" ? 720 : templateId === "compact" ? 770 : 760;
    const headerContentTop = headerTop - (templateId === "compact" ? headerOffset.y : 0);
    const headerContentX = templateId === "compact" ? headerOffset.x : 0;
    const logoX = (data.settings.logoAlignment === "right" ? right - 80 : left) + headerContentX;
    // In the editor the logo sits above the company name (except Compact,
    // where it shares the header row). The previous PDF placement put it
    // below the sender block and caused visible overlap.
    const logoTop = templateId === "compact" ? headerContentTop + 27 : headerContentTop + 28;
    drawLogo("logo", logoX, logoTop, templateId === "compact" ? 36 : 50);
    const titleBaseY = templateId === "compact"
      ? headerContentTop
      : logoImage && data.settings.showLogo
        ? headerContentTop - 30
        : headerContentTop;
    const titleX = (data.settings.nameAlignment === "center" ? width / 2 : data.settings.nameAlignment === "right" ? right : left) + headerContentX;
    const titleAlign = data.settings.nameAlignment || "left";
    let senderBottomY: number | null = null;
    if (visible("title")) {
      elementFrame("title", left + headerContentX, titleBaseY, contentWidth, 32);
      drawElementText("title", companyName, titleX, titleBaseY, {
        size: titleSize,
        font: helveticaBold,
        color: templateId === "compact" ? white : undefined,
        align: titleAlign,
        maxChars: 38,
        maxWidth: contentWidth,
      });
    }
    if (visible("sender") && templateId !== "compact") {
      const senderX = titleAlign === "center" ? left : titleAlign === "right" ? right - 230 : left;
      const senderTextX = titleAlign === "center" ? width / 2 : titleAlign === "right" ? right : senderX;
      const senderTextAlign = titleAlign as "left" | "center" | "right";
      const senderY = titleBaseY - 25;
      const senderAddress = data.user.address || data.company.email || "";
      const senderContact = `${data.company.email || data.user.email || ""}${data.user.phone ? ` • ${data.user.phone}` : ""}`;
      const senderAddressLines = textLines(senderAddress, 42, helvetica, 8, 172);
      const senderContactLines = textLines(senderContact, 42, helvetica, 8, 172);
      const senderTaxLines = data.settings.showTaxNumber && data.settings.taxNumber
        ? textLines(`Tax ID: ${data.settings.taxNumber}`, 42, helvetica, 7.5, 172)
        : [];
      const senderHeight = Math.max(38, 10 + (senderAddressLines.length + senderContactLines.length + senderTaxLines.length) * 11);
      elementFrame("sender", senderX, senderY + 8, 230, senderHeight);
      const addressEndY = drawElementText("sender", senderAddress, senderTextX, senderY, { size: 8, maxChars: 42, maxWidth: 172, align: senderTextAlign });
      const contactEndY = drawElementText("sender", senderContact, senderTextX, addressEndY - 2, { size: 8, maxChars: 42, maxWidth: 172, align: senderTextAlign });
      senderBottomY = contactEndY;
      if (data.settings.showTaxNumber && data.settings.taxNumber) {
        senderBottomY = drawElementText("sender", `Tax ID: ${data.settings.taxNumber}`, senderTextX, contactEndY - 2, { size: 7.5, maxChars: 42, maxWidth: 172, align: senderTextAlign });
      }
    }
    if (visible("meta")) {
      const metaX = right + headerContentX;
      const metaY = headerContentTop + (templateId === "corporate" ? 4 : 0);
      elementFrame("meta", right - 150 + headerContentX, metaY + 8, 150, 58);
      const metaColor = colorFor(styleFor("meta").fontColor, dark);
      if (templateId === "corporate") {
        drawElementText("meta", "INVOICE", metaX, metaY, { size: 22.5, font: helveticaBold, color: metaColor, align: "right", maxChars: 20, maxWidth: 170 });
        drawElementText("meta", `#${sampleValue(data.invoiceNumber, "<invoice_number>")}`, metaX, metaY - 20, { size: 9, align: "right", maxChars: 24, maxWidth: 170 });
        drawElementText("meta", `Issue Date: ${sampleValue(data.invoiceDate, "<date>")}`, metaX, metaY - 33, { size: 8, align: "right", maxChars: 32, maxWidth: 170 });
        drawElementText("meta", `Payment: ${invoiceStatus}`, metaX, metaY - 45, { size: 8, font: helveticaBold, color: isPaid ? rgb(0.05, 0.48, 0.25) : muted, align: "right", maxChars: 32, maxWidth: 170 });
      } else if (templateId === "agency") {
        drawElementText("meta", "STATEMENT / INVOICE", metaX, metaY, { size: 8.25, font: helveticaBold, color: colorFor(styleFor("meta").accentColor, accent), align: "right", maxChars: 30, maxWidth: 170 });
        drawElementText("meta", `#${sampleValue(data.invoiceNumber, "<invoice_number>")}`, metaX, metaY - 17, { size: 13.5, font: helveticaBold, color: metaColor, align: "right", maxChars: 24, maxWidth: 170 });
        drawElementText("meta", sampleValue(data.invoiceDate, "<date>"), metaX, metaY - 33, { size: 8, align: "right", maxChars: 32, maxWidth: 170 });
      } else if (templateId === "compact") {
        drawElementText("meta", `#${sampleValue(data.invoiceNumber, "<invoice_number>")}`, metaX, metaY, { size: 10.5, font: helveticaBold, color: white, align: "right", maxChars: 24, maxWidth: 170 });
        drawElementText("meta", sampleValue(data.invoiceDate, "<date>"), metaX, metaY - 15, { size: 8, color: rgb(1, 1, 1), align: "right", maxChars: 32, maxWidth: 170 });
      } else if (templateId === "minimal") {
        drawElementText("meta", "INVOICE", metaX, metaY, { size: 7.5, font: helvetica, color: colorFor(styleFor("meta").fontColor, muted), align: "right", maxChars: 20, maxWidth: 170 });
        drawElementText("meta", `#${sampleValue(data.invoiceNumber, "<invoice_number>")}`, metaX, metaY - 14, { size: 10.5, align: "right", maxChars: 24, maxWidth: 170 });
        drawElementText("meta", sampleValue(data.invoiceDate, "<date>"), metaX, metaY - 28, { size: 8, align: "right", maxChars: 32, maxWidth: 170 });
      } else {
        drawElementText("meta", "INVOICE", metaX, metaY, { size: 8.25, font: helveticaBold, color: colorFor(styleFor("meta").accentColor, accent), align: "right", maxChars: 20, maxWidth: 170 });
        drawElementText("meta", `#${sampleValue(data.invoiceNumber, "<invoice_number>")}`, metaX, metaY - 17, { size: 12, font: helveticaBold, color: metaColor, align: "right", maxChars: 24, maxWidth: 170 });
        drawElementText("meta", `Date: ${sampleValue(data.invoiceDate, "<date>")}`, metaX, metaY - 32, { size: 8, align: "right", maxChars: 32, maxWidth: 170 });
        drawElementText("meta", `Payment: ${invoiceStatus}`, metaX, metaY - 44, { size: 7.5, font: helveticaBold, color: isPaid ? rgb(0.05, 0.48, 0.25) : muted, align: "right", maxChars: 32, maxWidth: 170 });
      }
    }

    let currentY = templateId === "corporate" ? 625 : templateId === "compact" ? 739 : 650;
    if (senderBottomY !== null) {
      // The browser preview grows the sender block when an address wraps.
      // Reserve the same space before placing the client strip.
      currentY = Math.min(currentY, senderBottomY - 20);
    }
    if (visible("client")) {
      const boxY = currentY;
      const clientStyle = styleFor("client");
      const clientNameValue = sampleValue(clientName, "<client_name>");
      const clientEmailValue = sampleValue(data.clientEmail || "", "<client_email>");
      const clientTextWidth = templateId === "compact" ? contentWidth / 3 - 8 : 220;
      const clientNameLines = textLines(clientNameValue, 28, helveticaBold, templateId === "compact" ? 9 : 10, clientTextWidth);
      const clientEmailLines = textLines(clientEmailValue, 30, helvetica, templateId === "compact" ? 7.5 : 8, clientTextWidth);
      const clientBoxHeight = templateId === "compact"
        ? Math.max(64, 31 + Math.max(clientNameLines.length, clientEmailLines.length + 1) * 13)
        : Math.max(64, 39 + clientNameLines.length * 13 + Math.max(0, clientEmailLines.length - 1) * 11);
      const compactColumnWidth = contentWidth / 3 - 8;
      const compactClientX = left + contentWidth / 3;
      const compactStatusX = left + (contentWidth / 3) * 2;
      const clientOffset = offsetFor("client");
      page.drawRectangle({
        x: templateId === "compact" ? left : left + clientOffset.x,
        y: templateId === "compact" ? boxY - clientBoxHeight : boxY - clientBoxHeight - clientOffset.y,
        width: contentWidth,
        height: clientBoxHeight,
        color: templateId === "compact" ? light : colorFor(clientStyle.fillColor, templateId === "corporate" ? light : white),
        borderColor: templateId === "compact" || clientStyle.showBorder ? colorFor(clientStyle.borderColor, border) : undefined,
        borderWidth: templateId === "compact" || clientStyle.showBorder ? Number(clientStyle.borderWidth) || 0.75 : 0,
      });
      if (templateId === "compact") {
        elementFrame("sender", left, boxY, compactColumnWidth, clientBoxHeight);
        elementFrame("client", compactClientX, boxY, compactColumnWidth, clientBoxHeight);
        elementFrame("status", compactStatusX, boxY, compactColumnWidth, clientBoxHeight);
      } else {
        elementFrame("client", left, boxY, contentWidth, clientBoxHeight);
      }
      const clientBaseY = boxY - 16;
      if (templateId === "compact") {
        // Compact uses a real three-column strip in the editor. Keep the
        // status as its own element so its saved offset/style is respected.
        const columnWidth = compactColumnWidth;
        const clientX = compactClientX;
        const statusX = compactStatusX;
        const senderStyle = styleFor("sender");
        const statusStyle = styleFor("status");
        const statusOffset = offsetFor("status");
        drawElementText("sender", "FROM", left + 8, clientBaseY, { size: 7.5, font: helveticaBold, maxChars: 10, maxWidth: columnWidth });
        drawElementText("sender", sampleValue(data.user.name || data.company.name, "<owner_name>"), left + 8, clientBaseY - 13, { size: 9, font: helveticaBold, color: colorFor(senderStyle.fontColor, dark), maxChars: 28, maxWidth: columnWidth });
        if (data.settings.showTaxNumber && data.settings.taxNumber) {
          drawElementText("sender", `Tax: ${data.settings.taxNumber}`, left + 8, clientBaseY - 26, { size: 7.5, color: colorFor(senderStyle.fontColor, muted), maxChars: 24, maxWidth: columnWidth });
        }
        drawElementText("client", "TO", clientX + 8, clientBaseY, { size: 7.5, font: helveticaBold, maxChars: 10, maxWidth: columnWidth });
        const clientNameEnd = drawElementText("client", clientNameValue, clientX + 8, clientBaseY - 13, { size: 9, font: helveticaBold, maxChars: 28, maxWidth: columnWidth });
        drawElementText("client", clientEmailValue, clientX + 8, clientNameEnd - 2, { size: 7.5, maxChars: 30, maxWidth: columnWidth });
        drawElementText("status", "STATUS", statusX + 8, boxY - 16, { size: 7.5, font: helveticaBold, color: colorFor(statusStyle.fontColor, dark), maxChars: 10, maxWidth: columnWidth });
        drawElementText("status", isPaid ? "PAID" : invoiceStatus, statusX + 8, boxY - 29, { size: 8.5, font: helveticaBold, color: colorFor(statusStyle.accentColor || statusStyle.fontColor, isPaid ? rgb(0.05, 0.48, 0.25) : muted), maxChars: 20, maxWidth: columnWidth });
        drawElementText("status", sampleValue(data.paymentReference || data.invoiceNumber, "<payment_reference>"), statusX + 8, boxY - 42, { size: 7.5, color: colorFor(statusStyle.fontColor, muted), maxChars: 24, maxWidth: columnWidth });
      } else {
        const split = left + contentWidth / 2 + 10;
        drawElementText("client", "CLIENT DETAILS", left + 12, clientBaseY, { size: 7.5, font: helveticaBold, maxChars: 22, maxWidth: 220 });
        const clientNameEnd = drawElementText("client", clientNameValue, left + 12, clientBaseY - 13, { size: 10, font: helveticaBold, maxChars: 28, maxWidth: 220 });
        drawElementText("client", clientEmailValue, left + 12, clientNameEnd - 2, { size: 8, maxChars: 30, maxWidth: 220 });
        drawElementText("client", "PAYMENT SUMMARY", split, clientBaseY, { size: 7.5, font: helveticaBold, maxChars: 22, maxWidth: 220 });
        drawElementText("client", `Ref: ${sampleValue(data.paymentReference || data.invoiceNumber, "<payment_reference>")}`, split, clientBaseY - 13, { size: 8, maxChars: 30, maxWidth: 220 });
        drawElementText("client", `Status: ${invoiceStatus}`, split, clientBaseY - 27, { size: 8, font: helveticaBold, color: isPaid ? rgb(0.05, 0.48, 0.25) : muted, maxChars: 30, maxWidth: 220 });
      }
      currentY = boxY - clientBoxHeight - 18;
    }

    if (visible("items")) {
      const itemStyle = styleFor("items");
      const tableX = left;
      const tableWidth = contentWidth;
      const headerHeight = templateId === "compact" ? 22 : 25;
      const estimateRowHeight = (item: InvoiceLineItem) => {
        const description = item.description;
        const lines = textLines(description, 42, helveticaBold, 8, 300);
        return Math.max(25, lines.length * 10 + 9);
      };
      const drawItemsTable = (rows: InvoiceLineItem[], tableTop: number) => {
        const rowHeights = rows.map(estimateRowHeight);
        const tableHeight = headerHeight + rowHeights.reduce((sum, height) => sum + height, 0);
        elementFrame("items", tableX, tableTop, tableWidth, tableHeight);
        const itemOffset = offsetFor("items");
        const renderedTableX = tableX + itemOffset.x;
        const renderedTableTop = tableTop - itemOffset.y;
        const defaultHeaderFill = templateId === "modern" || templateId === "agency"
          ? accent
          : templateId === "compact"
            ? light
            : white;
        const defaultHeaderText = templateId === "modern" || templateId === "agency" ? white : dark;
        page.drawRectangle({ x: renderedTableX, y: renderedTableTop - headerHeight, width: tableWidth, height: headerHeight, color: colorFor(itemStyle.tableHeaderFill, defaultHeaderFill), borderColor: border, borderWidth: 0.6 });
        const headerColor = colorFor(itemStyle.tableHeaderTextColor, defaultHeaderText);
        drawText(templateId === "corporate" ? "ITEM & DESCRIPTION" : templateId === "compact" ? "ITEM" : "DESCRIPTION", renderedTableX + 10, renderedTableTop - 16, { size: 7.5, font: helveticaBold, color: headerColor, maxChars: 28 });
        drawText("QTY", renderedTableX + 320, renderedTableTop - 16, { size: 7.5, font: helveticaBold, color: headerColor, align: "center", maxChars: 8 });
        drawText(templateId === "compact" ? "PRICE" : "UNIT PRICE", renderedTableX + 412, renderedTableTop - 16, { size: 7.5, font: helveticaBold, color: headerColor, align: "right", maxChars: 12 });
        drawText(templateId === "compact" ? "TOTAL" : "AMOUNT", renderedTableX + tableWidth - 10, renderedTableTop - 16, { size: 7.5, font: helveticaBold, color: headerColor, align: "right", maxChars: 10 });
        let rowOffset = 0;
        rows.forEach((item, index) => {
          const rowHeight = rowHeights[index] || 25;
          const rowTop = renderedTableTop - headerHeight - rowOffset;
          const baseRowTop = tableTop - headerHeight - rowOffset;
          page.drawRectangle({ x: renderedTableX, y: rowTop - rowHeight, width: tableWidth, height: rowHeight, color: white, borderColor: border, borderWidth: itemStyle.tableRowLines === false ? 0 : 0.45 });
          drawElementText("items", item.description, tableX + 10, baseRowTop - 16, { size: 8, font: helveticaBold, maxChars: 42, maxWidth: 300 });
          drawElementText("items", data.isSample ? "<qty>" : item.qty, tableX + 320, baseRowTop - 16, { size: 8, align: "center", maxChars: 8 });
          drawElementText("items", moneyValue(item.rate, "<price>"), tableX + 412, baseRowTop - 16, { size: 8, align: "right", maxChars: 16 });
          drawElementText("items", moneyValue(item.amount, "<total>"), tableX + tableWidth - 10, baseRowTop - 16, { size: 8, font: helveticaBold, align: "right", maxChars: 16 });
          rowOffset += rowHeight;
        });
        return renderedTableTop - tableHeight - (templateId === "compact" ? 8 : 22);
      };

      // Leave room for totals and notes on the first page. Any remaining
      // rows are moved to continuation pages with the same table geometry.
      const availableRowsHeight = Math.max(25, currentY - 225 - headerHeight);
      let firstPageRows = 0;
      let usedRowsHeight = 0;
      for (const item of items) {
        const rowHeight = estimateRowHeight(item);
        if (firstPageRows > 0 && usedRowsHeight + rowHeight > availableRowsHeight) break;
        usedRowsHeight += rowHeight;
        firstPageRows += 1;
      }
      firstPageRows = Math.max(1, Math.min(items.length, firstPageRows));
      currentY = drawItemsTable(items.slice(0, firstPageRows), currentY);
      let nextItemIndex = firstPageRows;
      while (nextItemIndex < items.length) {
        page.pushOperators(popGraphicsState());
        page = createPage();
        drawText(`${companyName} — ${data.invoiceNumber} (continued)`, left, 800, { size: 11, font: helveticaBold, color: dark, maxChars: 70 });
        page.drawLine({ start: { x: left, y: 785 }, end: { x: right, y: 785 }, thickness: 1, color: accent });
        const pageRows = items.slice(nextItemIndex, nextItemIndex + 20);
        currentY = drawItemsTable(pageRows, 755);
        nextItemIndex += pageRows.length;
      }
    }

    if (visible("totals")) {
      const totalsStyle = styleFor("totals");
      const totalsX = right - 205;
      const totalsY = currentY;
      elementFrame("totals", totalsX, totalsY + 8, 205, 70);
      const totalsOffset = offsetFor("totals");
      const renderedTotalsX = totalsX + totalsOffset.x;
      const renderedTotalsY = totalsY - totalsOffset.y;
      page.drawLine({ start: { x: renderedTotalsX, y: renderedTotalsY }, end: { x: right + totalsOffset.x, y: renderedTotalsY }, thickness: 1.2, color: colorFor(totalsStyle.borderColor, dark) });
      drawElementText("totals", "Subtotal:", totalsX, totalsY - 15, { size: 8.5, maxChars: 18 });
      drawElementText("totals", moneyValue(subtotal, "<subtotal>"), right, totalsY - 15, { size: 8.5, align: "right", maxChars: 18 });
      if (data.advancePaymentPaid && data.advancePaymentPaid > 0) {
        drawElementText("totals", "Advance Paid:", totalsX, totalsY - 29, { size: 8.5, maxChars: 18 });
        drawElementText("totals", `-${formatCurrencyString(data.currency, data.advancePaymentPaid)}`, right, totalsY - 29, { size: 8.5, align: "right", maxChars: 18 });
      }
      drawElementText("totals", isPaid ? "Amount Paid:" : "Amount Due:", totalsX, totalsY - 47, { size: 10, font: helveticaBold, maxChars: 18 });
      drawElementText("totals", moneyValue(total, "<total>"), right, totalsY - 47, { size: 10, font: helveticaBold, color: accent, align: "right", maxChars: 18 });
      currentY = totalsY - 72;
    }

    if (visible("customText")) {
      const customStyle = styleFor("customText");
      const customContent = customStyle.customContent;
      if (customContent) {
        const customLines = textLines(customContent, 100, fontFor(customStyle, helvetica), sizeFor(customStyle, 8), contentWidth);
        const customHeight = Math.max(28, 12 + customLines.length * 11);
        elementFrame("customText", left, currentY, contentWidth, customHeight);
        drawElementText("customText", customContent, left, currentY - 13, { size: 8, maxChars: 100, maxWidth: contentWidth });
        currentY -= customHeight + 7;
      }
    }
    if (visible("notes") && data.settings.showNotes && (data.settings.notes || data.settings.terms)) {
      const notesY = Math.max(65, currentY - 5);
      const notesFont = fontFor(styleFor("notes"), helvetica);
      const notesSize = sizeFor(styleFor("notes"), 8);
      const noteLines = textLines(data.settings.notes || "", 100, notesFont, notesSize, contentWidth);
      const termLines = textLines(data.settings.terms || "", 100, notesFont, notesSize, contentWidth);
      const notesHeight = Math.max(48, 10 + (noteLines.length + termLines.length) * 11);
      elementFrame("notes", left, notesY, contentWidth, notesHeight);
      const notesEndY = drawElementText("notes", data.settings.notes || "", left, notesY - 13, { size: 8, maxChars: 100, maxWidth: contentWidth });
      drawElementText("notes", data.settings.terms || "", left, notesEndY - 2, { size: 8, color: muted, maxChars: 100, maxWidth: contentWidth });
    }
    page.drawText(`${companyName} • ${data.invoiceNumber}`, { x: left, y: 28, size: 7, font: helvetica, color: rgb(0.55, 0.58, 0.62) });
    page.pushOperators(popGraphicsState());
  }

  // 1. MODERN MINIMAL TEMPLATE
  private renderModernTemplate(ctx: {
    doc: PDFDocument;
    page: PDFPage;
    data: InvoicePdfData;
    helvetica: PDFFont;
    helveticaBold: PDFFont;
    helveticaOblique: PDFFont;
    logoImage: any;
  }) {
    const { page, data, helvetica, helveticaBold, logoImage } = ctx;
    const accent = resolveRgbColor(data.settings.accentColor);
    const primaryText = rgb(0.1, 0.12, 0.14);
    const secondaryText = rgb(0.38, 0.42, 0.48);
    const lightBg = rgb(0.96, 0.97, 0.98);
    const borderCol = rgb(0.88, 0.9, 0.92);

    let currentY = 780;

    // Logo & Header
    if (logoImage) {
      const logoW = Math.min(100, logoImage.width);
      const logoH = (logoW / logoImage.width) * logoImage.height;
      let logoX = 50;
      if (data.settings.logoAlignment === "center") logoX = (595.28 - logoW) / 2;
      if (data.settings.logoAlignment === "right") logoX = 545.28 - logoW;

      page.drawImage(logoImage, {
        x: logoX,
        y: currentY - logoH + 15,
        width: logoW,
        height: logoH,
      });
      if (data.settings.logoAlignment !== "right") {
        currentY -= logoH + 10;
      }
    }

    // Company & Document Title
    const companyTitle = data.company.name || data.user.name || "Invoice";
    let nameX = 50;
    if (data.settings.nameAlignment === "center") {
      const w = helveticaBold.widthOfTextAtSize(companyTitle, 20);
      nameX = (595.28 - w) / 2;
    } else if (data.settings.nameAlignment === "right") {
      const w = helveticaBold.widthOfTextAtSize(companyTitle, 20);
      nameX = 545.28 - w;
    }

    page.drawText(companyTitle, {
      x: nameX,
      y: currentY,
      size: 20,
      font: helveticaBold,
      color: primaryText,
    });
    currentY -= 16;

    if (data.company.tagline) {
      page.drawText(data.company.tagline, {
        x: nameX,
        y: currentY,
        size: 9,
        font: helvetica,
        color: secondaryText,
      });
      currentY -= 14;
    }

    // Right-aligned "INVOICE" badge
    page.drawText("TAX INVOICE", {
      x: 445,
      y: 780,
      size: 16,
      font: helveticaBold,
      color: accent,
    });
    page.drawText(`#${data.invoiceNumber}`, {
      x: 445,
      y: 764,
      size: 10,
      font: helvetica,
      color: secondaryText,
    });

    currentY = Math.min(currentY, 715);

    // Accent line
    page.drawLine({
      start: { x: 50, y: currentY },
      end: { x: 545.28, y: currentY },
      thickness: 1.5,
      color: accent,
    });
    currentY -= 25;

    // Metadata cards (Date, Method, Status, Amount)
    const cardW = 115;
    const cardH = 46;
    const cardGap = 12;
    const cards = [
      { label: "ISSUE DATE", val: data.invoiceDate },
      { label: "PAYMENT METHOD", val: data.paymentMethod || "UPI" },
      { label: "STATUS", val: (data.paymentStatus || "PAID").toUpperCase() },
      { label: "TOTAL PAID", val: formatCurrencyString(data.currency, data.amount) },
    ];

    cards.forEach((c, i) => {
      const cx = 50 + i * (cardW + cardGap);
      page.drawRectangle({
        x: cx,
        y: currentY - cardH,
        width: cardW,
        height: cardH,
        color: lightBg,
        borderColor: borderCol,
        borderWidth: 0.5,
      });
      page.drawText(c.label, {
        x: cx + 10,
        y: currentY - 16,
        size: 7,
        font: helveticaBold,
        color: secondaryText,
      });
      page.drawText(c.val, {
        x: cx + 10,
        y: currentY - 34,
        size: i === 3 ? 9.5 : 9,
        font: helveticaBold,
        color: i === 3 ? accent : primaryText,
      });
    });

    currentY -= cardH + 30;

    // Billed To & Issued By Grid
    page.drawText("BILLED TO", {
      x: 50,
      y: currentY,
      size: 8,
      font: helveticaBold,
      color: secondaryText,
    });
    page.drawText("ISSUED BY", {
      x: 310,
      y: currentY,
      size: 8,
      font: helveticaBold,
      color: secondaryText,
    });
    currentY -= 15;

    page.drawText(data.clientName || "Valued Client", {
      x: 50,
      y: currentY,
      size: 11,
      font: helveticaBold,
      color: primaryText,
    });
    page.drawText(data.user.name, {
      x: 310,
      y: currentY,
      size: 11,
      font: helveticaBold,
      color: primaryText,
    });
    currentY -= 14;

    if (data.clientEmail) {
      page.drawText(data.clientEmail, {
        x: 50,
        y: currentY,
        size: 9,
        font: helvetica,
        color: secondaryText,
      });
    }

    const sellerContact = data.company.email || data.user.email || "";
    page.drawText(sellerContact, {
      x: 310,
      y: currentY,
      size: 9,
      font: helvetica,
      color: secondaryText,
    });
    currentY -= 14;

    if (data.user.address) {
      page.drawText(data.user.address, {
        x: 310,
        y: currentY,
        size: 8.5,
        font: helvetica,
        color: secondaryText,
      });
      currentY -= 13;
    }

    if (data.settings.showTaxNumber && data.settings.taxNumber) {
      page.drawText(`GSTIN/TAX: ${data.settings.taxNumber}`, {
        x: 310,
        y: currentY,
        size: 8.5,
        font: helveticaBold,
        color: primaryText,
      });
      currentY -= 13;
    }

    currentY -= 20;

    // Items Table Header
    page.drawRectangle({
      x: 50,
      y: currentY - 24,
      width: 495.28,
      height: 24,
      color: lightBg,
      borderColor: borderCol,
      borderWidth: 0.5,
    });
    page.drawText("DESCRIPTION", {
      x: 65,
      y: currentY - 16,
      size: 8,
      font: helveticaBold,
      color: secondaryText,
    });
    page.drawText("QTY", {
      x: 330,
      y: currentY - 16,
      size: 8,
      font: helveticaBold,
      color: secondaryText,
    });
    page.drawText("RATE", {
      x: 395,
      y: currentY - 16,
      size: 8,
      font: helveticaBold,
      color: secondaryText,
    });
    page.drawText("AMOUNT", {
      x: 480,
      y: currentY - 16,
      size: 8,
      font: helveticaBold,
      color: secondaryText,
    });
    currentY -= 24;

    // Items Rows
    const items = getLineItems(data);
    for (const item of items) {
      page.drawRectangle({
        x: 50,
        y: currentY - 32,
        width: 495.28,
        height: 32,
        color: rgb(1, 1, 1),
        borderColor: borderCol,
        borderWidth: 0.5,
      });
      page.drawText(item.description.slice(0, 48), {
        x: 65,
        y: currentY - 20,
        size: 9,
        font: helveticaBold,
        color: primaryText,
      });
      page.drawText(String(item.qty), {
        x: 335,
        y: currentY - 20,
        size: 9,
        font: helvetica,
        color: primaryText,
      });
      page.drawText(formatCurrencyString(data.currency, item.rate), {
        x: 380,
        y: currentY - 20,
        size: 9,
        font: helvetica,
        color: primaryText,
      });
      page.drawText(formatCurrencyString(data.currency, item.amount), {
        x: 465,
        y: currentY - 20,
        size: 9,
        font: helveticaBold,
        color: primaryText,
      });
      currentY -= 32;
    }

    // Summary Box
    currentY -= 15;
    const summaryX = 330;
    const subtotal = data.subtotal ?? items.reduce((s, i) => s + i.amount, 0);
    page.drawText("Subtotal:", {
      x: summaryX,
      y: currentY,
      size: 9,
      font: helvetica,
      color: secondaryText,
    });
    page.drawText(formatCurrencyString(data.currency, subtotal), {
      x: 465,
      y: currentY,
      size: 9,
      font: helvetica,
      color: primaryText,
    });
    currentY -= 16;

    if (data.advancePaymentPaid && data.advancePaymentPaid > 0) {
      page.drawText("Less Advance Paid:", {
        x: summaryX,
        y: currentY,
        size: 9,
        font: helveticaBold,
        color: rgb(0.1, 0.5, 0.2),
      });
      page.drawText(`-${formatCurrencyString(data.currency, data.advancePaymentPaid)}`, {
        x: 465,
        y: currentY,
        size: 9,
        font: helveticaBold,
        color: rgb(0.1, 0.5, 0.2),
      });
      currentY -= 16;

      page.drawText("Balance Paid:", {
        x: summaryX,
        y: currentY,
        size: 9,
        font: helvetica,
        color: secondaryText,
      });
      page.drawText(formatCurrencyString(data.currency, data.balanceAmount ?? Math.max(0, subtotal - data.advancePaymentPaid)), {
        x: 465,
        y: currentY,
        size: 9,
        font: helvetica,
        color: primaryText,
      });
      currentY -= 16;
    }

    page.drawText("Tax / Fees (0%):", {
      x: summaryX,
      y: currentY,
      size: 9,
      font: helvetica,
      color: secondaryText,
    });
    page.drawText(formatCurrencyString(data.currency, 0), {
      x: 465,
      y: currentY,
      size: 9,
      font: helvetica,
      color: primaryText,
    });
    currentY -= 22;

    page.drawLine({
      start: { x: summaryX, y: currentY + 5 },
      end: { x: 545.28, y: currentY + 5 },
      thickness: 1,
      color: borderCol,
    });

    page.drawText("Total Paid:", {
      x: summaryX,
      y: currentY - 10,
      size: 11,
      font: helveticaBold,
      color: primaryText,
    });
    const totalFormatted = formatCurrencyString(data.currency, data.amount);
    page.drawText(totalFormatted, {
      x: 450,
      y: currentY - 10,
      size: 12,
      font: helveticaBold,
      color: accent,
    });
    currentY -= 40;

    // Custom Text Area / Block
    let parsedCustomStyles: any = {};
    if (data.settings.customElementStyles) {
      try {
        parsedCustomStyles = typeof data.settings.customElementStyles === "string" 
          ? JSON.parse(data.settings.customElementStyles) 
          : data.settings.customElementStyles;
      } catch {}
    }
    const customTextContent = parsedCustomStyles?.customText?.customContent;
    if (customTextContent && (!data.settings.customElements || data.settings.customElements.includes("customText"))) {
      const customTextColor = parsedCustomStyles.customText.fontColor ? resolveRgbColor(parsedCustomStyles.customText.fontColor) : secondaryText;
      page.drawLine({
        start: { x: 50, y: currentY },
        end: { x: 545.28, y: currentY },
        thickness: 0.5,
        color: borderCol,
      });
      currentY -= 18;
      page.drawText(String(customTextContent).slice(0, 180), {
        x: 50,
        y: currentY,
        size: 8.5,
        font: helvetica,
        color: customTextColor,
      });
      currentY -= 20;
    }

    // Notes & Terms
    if (data.settings.showNotes && (data.settings.notes || data.settings.terms)) {
      page.drawLine({
        start: { x: 50, y: currentY },
        end: { x: 545.28, y: currentY },
        thickness: 0.5,
        color: borderCol,
      });
      currentY -= 18;

      if (data.settings.notes) {
        page.drawText("NOTES", {
          x: 50,
          y: currentY,
          size: 7.5,
          font: helveticaBold,
          color: secondaryText,
        });
        currentY -= 12;
        page.drawText(data.settings.notes, {
          x: 50,
          y: currentY,
          size: 8.5,
          font: helvetica,
          color: secondaryText,
        });
        currentY -= 18;
      }

      if (data.settings.terms) {
        page.drawText("TERMS & CONDITIONS", {
          x: 50,
          y: currentY,
          size: 7.5,
          font: helveticaBold,
          color: secondaryText,
        });
        currentY -= 12;
        page.drawText(data.settings.terms, {
          x: 50,
          y: currentY,
          size: 8.5,
          font: helvetica,
          color: secondaryText,
        });
      }
    }

    // Bottom Footer
    page.drawText("Powered by MitFloww • Verified Payment Receipt", {
      x: 180,
      y: 35,
      size: 7.5,
      font: helvetica,
      color: rgb(0.6, 0.65, 0.7),
    });
  }

  // 2. CLASSIC CORPORATE TEMPLATE
  private renderCorporateTemplate(ctx: {
    doc: PDFDocument;
    page: PDFPage;
    data: InvoicePdfData;
    helvetica: PDFFont;
    helveticaBold: PDFFont;
    helveticaOblique: PDFFont;
    logoImage: any;
  }) {
    const { page, data, helvetica, helveticaBold, logoImage } = ctx;
    const accent = resolveRgbColor(data.settings.accentColor);
    const borderCol = rgb(0.8, 0.83, 0.86);

    // Top Full-Width Banner
    page.drawRectangle({
      x: 0,
      y: 770,
      width: 595.28,
      height: 71.89,
      color: accent,
    });

    page.drawText("OFFICIAL INVOICE", {
      x: 50,
      y: 800,
      size: 20,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });
    page.drawText(`Ref: ${data.invoiceNumber}`, {
      x: 50,
      y: 785,
      size: 9,
      font: helvetica,
      color: rgb(0.9, 0.95, 1),
    });

    if (logoImage) {
      const logoW = Math.min(80, logoImage.width);
      const logoH = (logoW / logoImage.width) * logoImage.height;
      page.drawImage(logoImage, {
        x: 545.28 - logoW,
        y: 780 + (50 - logoH) / 2,
        width: logoW,
        height: logoH,
      });
    }

    let currentY = 740;

    // Corporate 2-column Boxed Section
    const colW = 240;
    const colH = 80;

    // Left Box: Supplier
    page.drawRectangle({
      x: 50,
      y: currentY - colH,
      width: colW,
      height: colH,
      color: rgb(0.98, 0.99, 1),
      borderColor: borderCol,
      borderWidth: 1,
    });
    page.drawText("ISSUED BY:", {
      x: 60,
      y: currentY - 16,
      size: 7.5,
      font: helveticaBold,
      color: accent,
    });
    page.drawText(data.company.name || data.user.name, {
      x: 60,
      y: currentY - 32,
      size: 10,
      font: helveticaBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(data.company.email || data.user.email || "", {
      x: 60,
      y: currentY - 46,
      size: 8.5,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawText(data.user.address || "Digital Provider", {
      x: 60,
      y: currentY - 58,
      size: 8,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Right Box: Customer
    page.drawRectangle({
      x: 305,
      y: currentY - colH,
      width: colW,
      height: colH,
      color: rgb(0.98, 0.99, 1),
      borderColor: borderCol,
      borderWidth: 1,
    });
    page.drawText("CUSTOMER:", {
      x: 315,
      y: currentY - 16,
      size: 7.5,
      font: helveticaBold,
      color: accent,
    });
    page.drawText(data.clientName || "Valued Client", {
      x: 315,
      y: currentY - 32,
      size: 10,
      font: helveticaBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(data.clientEmail || "Verified Buyer", {
      x: 315,
      y: currentY - 46,
      size: 8.5,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawText(`Date: ${data.invoiceDate}`, {
      x: 315,
      y: currentY - 58,
      size: 8,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });

    currentY -= colH + 30;

    // Formal Table
    const tableW = 495;
    page.drawRectangle({
      x: 50,
      y: currentY - 24,
      width: tableW,
      height: 24,
      color: rgb(0.92, 0.94, 0.96),
      borderColor: borderCol,
      borderWidth: 1,
    });
    page.drawText("#", { x: 60, y: currentY - 16, size: 8, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText("ITEM DESCRIPTION", { x: 90, y: currentY - 16, size: 8, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText("QTY", { x: 340, y: currentY - 16, size: 8, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText("AMOUNT", { x: 440, y: currentY - 16, size: 8, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
    currentY -= 24;

    const corpItems = getLineItems(data);
    let idx = 1;
    for (const item of corpItems) {
      page.drawRectangle({
        x: 50,
        y: currentY - 32,
        width: tableW,
        height: 32,
        color: rgb(1, 1, 1),
        borderColor: borderCol,
        borderWidth: 1,
      });
      page.drawText(String(idx++), { x: 60, y: currentY - 20, size: 9, font: helvetica, color: rgb(0.1, 0.1, 0.1) });
      page.drawText(item.description.slice(0, 42), { x: 90, y: currentY - 20, size: 9, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
      page.drawText(String(item.qty), { x: 345, y: currentY - 20, size: 9, font: helvetica, color: rgb(0.1, 0.1, 0.1) });
      page.drawText(formatCurrencyString(data.currency, item.amount), { x: 430, y: currentY - 20, size: 9, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
      currentY -= 32;
    }
    currentY -= 20;

    // Total Calculation Box
    const totalBoxW = 220;
    const boxH = (data.advancePaymentPaid && data.advancePaymentPaid > 0) ? 68 : 50;
    page.drawRectangle({
      x: 325,
      y: currentY - boxH,
      width: totalBoxW,
      height: boxH,
      color: rgb(0.95, 0.97, 1),
      borderColor: accent,
      borderWidth: 1.5,
    });
    if (data.advancePaymentPaid && data.advancePaymentPaid > 0) {
      page.drawText(`Subtotal: ${formatCurrencyString(data.currency, data.subtotal ?? data.amount)}`, { x: 335, y: currentY - 16, size: 8, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
      page.drawText(`Advance Paid: -${formatCurrencyString(data.currency, data.advancePaymentPaid)}`, { x: 335, y: currentY - 28, size: 8, font: helveticaBold, color: rgb(0.1, 0.5, 0.2) });
      page.drawText("BALANCE PAID:", { x: 335, y: currentY - 42, size: 7.5, font: helveticaBold, color: accent });
      page.drawText(formatCurrencyString(data.currency, data.balanceAmount ?? data.amount), { x: 335, y: currentY - 58, size: 12, font: helveticaBold, color: rgb(0.05, 0.1, 0.2) });
    } else {
      page.drawText("NET AMOUNT PAID:", { x: 335, y: currentY - 20, size: 8, font: helveticaBold, color: accent });
      page.drawText(formatCurrencyString(data.currency, data.amount), { x: 335, y: currentY - 38, size: 14, font: helveticaBold, color: rgb(0.05, 0.1, 0.2) });
    }
    currentY -= boxH + 20;

    if (data.settings.showTaxNumber && data.settings.taxNumber) {
      page.drawText(`Company Tax Identifier: ${data.settings.taxNumber}`, {
        x: 50,
        y: currentY,
        size: 9,
        font: helveticaBold,
        color: rgb(0.2, 0.2, 0.2),
      });
      currentY -= 20;
    }

    if (data.settings.showNotes && (data.settings.notes || data.settings.terms)) {
      page.drawText(data.settings.notes || data.settings.terms || "", {
        x: 50,
        y: currentY,
        size: 8.5,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
      });
    }

    page.drawText("Certified Commercial Receipt", {
      x: 230,
      y: 35,
      size: 7.5,
      font: helvetica,
      color: rgb(0.6, 0.6, 0.6),
    });
  }

  // 3. CREATIVE AGENCY TEMPLATE
  private renderAgencyTemplate(ctx: {
    doc: PDFDocument;
    page: PDFPage;
    data: InvoicePdfData;
    helvetica: PDFFont;
    helveticaBold: PDFFont;
    helveticaOblique: PDFFont;
    logoImage: any;
  }) {
    const { page, data, helvetica, helveticaBold, logoImage } = ctx;
    const accent = resolveRgbColor(data.settings.accentColor);

    let currentY = 780;

    // Bold Giant "INVOICE"
    page.drawText("INVOICE", {
      x: 50,
      y: currentY,
      size: 32,
      font: helveticaBold,
      color: accent,
    });

    if (logoImage) {
      const logoW = Math.min(90, logoImage.width);
      const logoH = (logoW / logoImage.width) * logoImage.height;
      page.drawImage(logoImage, {
        x: 545.28 - logoW,
        y: currentY - 10,
        width: logoW,
        height: logoH,
      });
    }

    currentY -= 35;
    page.drawText(`Project: ${data.projectTitle}`, {
      x: 50,
      y: currentY,
      size: 12,
      font: helveticaBold,
      color: rgb(0.15, 0.15, 0.2),
    });
    currentY -= 15;
    page.drawText(`Invoice #${data.invoiceNumber}  •  Date: ${data.invoiceDate}`, {
      x: 50,
      y: currentY,
      size: 9,
      font: helvetica,
      color: rgb(0.4, 0.45, 0.5),
    });
    currentY -= 30;

    // Thick Colored Accent Bar on Table
    page.drawRectangle({
      x: 50,
      y: currentY - 140,
      width: 5,
      height: 140,
      color: accent,
    });

    page.drawText("CLIENT / BILL TO", { x: 70, y: currentY - 10, size: 8, font: helveticaBold, color: accent });
    page.drawText(data.clientName, { x: 70, y: currentY - 26, size: 11, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
    if (data.clientEmail) {
      page.drawText(data.clientEmail, { x: 70, y: currentY - 40, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });
    }

    page.drawText("AGENCY / STUDIO", { x: 320, y: currentY - 10, size: 8, font: helveticaBold, color: accent });
    page.drawText(data.company.name || data.user.name, { x: 320, y: currentY - 26, size: 11, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(data.company.email || data.user.email || "", { x: 320, y: currentY - 40, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

    currentY -= 70;

    // Total Callout
    const formatted = formatCurrencyString(data.currency, data.amount);
    page.drawRectangle({
      x: 70,
      y: currentY - 55,
      width: 470,
      height: 50,
      color: rgb(0.96, 0.97, 1),
    });
    page.drawText("TOTAL AMOUNT SETTLED", { x: 90, y: currentY - 22, size: 8, font: helveticaBold, color: accent });
    page.drawText(formatted, { x: 90, y: currentY - 44, size: 16, font: helveticaBold, color: rgb(0.1, 0.1, 0.2) });

    currentY -= 80;

    if (data.settings.showNotes && data.settings.notes) {
      page.drawText("CLIENT NOTE", { x: 50, y: currentY, size: 8, font: helveticaBold, color: accent });
      currentY -= 15;
      page.drawText(data.settings.notes, { x: 50, y: currentY, size: 9, font: helvetica, color: rgb(0.3, 0.3, 0.3) });
      currentY -= 25;
    }

    page.drawText("Thank you for choosing our creative studio!", {
      x: 195,
      y: 40,
      size: 8.5,
      font: helveticaBold,
      color: accent,
    });
  }

  // 4. MINIMALIST SLEEK TEMPLATE
  private renderMinimalTemplate(ctx: {
    doc: PDFDocument;
    page: PDFPage;
    data: InvoicePdfData;
    helvetica: PDFFont;
    helveticaBold: PDFFont;
    helveticaOblique: PDFFont;
    logoImage: any;
  }) {
    const { page, data, helvetica, helveticaBold, logoImage } = ctx;
    const dark = rgb(0.08, 0.08, 0.08);
    const muted = rgb(0.45, 0.45, 0.45);
    const hairline = rgb(0.85, 0.85, 0.85);

    let currentY = 780;

    if (logoImage) {
      const logoW = Math.min(80, logoImage.width);
      const logoH = (logoW / logoImage.width) * logoImage.height;
      page.drawImage(logoImage, {
        x: 50,
        y: currentY - logoH + 15,
        width: logoW,
        height: logoH,
      });
      currentY -= logoH + 15;
    }

    page.drawText(data.company.name || data.user.name, {
      x: 50,
      y: currentY,
      size: 14,
      font: helveticaBold,
      color: dark,
    });
    currentY -= 14;
    page.drawText(data.company.email || data.user.email || "", {
      x: 50,
      y: currentY,
      size: 8.5,
      font: helvetica,
      color: muted,
    });

    page.drawText("INVOICE", {
      x: 480,
      y: currentY + 14,
      size: 14,
      font: helveticaBold,
      color: dark,
    });
    page.drawText(`#${data.invoiceNumber}`, {
      x: 480,
      y: currentY,
      size: 8.5,
      font: helvetica,
      color: muted,
    });

    currentY -= 35;
    page.drawLine({ start: { x: 50, y: currentY }, end: { x: 545.28, y: currentY }, thickness: 0.5, color: hairline });
    currentY -= 25;

    page.drawText("BILLED TO", { x: 50, y: currentY, size: 7.5, font: helveticaBold, color: muted });
    page.drawText("DATE", { x: 380, y: currentY, size: 7.5, font: helveticaBold, color: muted });
    page.drawText("STATUS", { x: 470, y: currentY, size: 7.5, font: helveticaBold, color: muted });
    currentY -= 15;

    page.drawText(data.clientName, { x: 50, y: currentY, size: 9.5, font: helveticaBold, color: dark });
    page.drawText(data.invoiceDate, { x: 380, y: currentY, size: 9, font: helvetica, color: dark });
    page.drawText(data.paymentStatus || "PAID", { x: 470, y: currentY, size: 9, font: helveticaBold, color: dark });
    currentY -= 35;

    page.drawLine({ start: { x: 50, y: currentY }, end: { x: 545.28, y: currentY }, thickness: 0.5, color: hairline });
    currentY -= 20;

    page.drawText(data.projectTitle, { x: 50, y: currentY, size: 9.5, font: helveticaBold, color: dark });
    const formatted = formatCurrencyString(data.currency, data.amount);
    page.drawText(formatted, { x: 460, y: currentY, size: 9.5, font: helveticaBold, color: dark });
    currentY -= 25;

    page.drawLine({ start: { x: 50, y: currentY }, end: { x: 545.28, y: currentY }, thickness: 0.5, color: hairline });
    currentY -= 25;

    page.drawText("TOTAL PAID", { x: 370, y: currentY, size: 9.5, font: helveticaBold, color: dark });
    page.drawText(formatted, { x: 450, y: currentY, size: 12, font: helveticaBold, color: dark });
  }

  // 5. COMPACT TECH TEMPLATE
  private renderCompactTemplate(ctx: {
    doc: PDFDocument;
    page: PDFPage;
    data: InvoicePdfData;
    helvetica: PDFFont;
    helveticaBold: PDFFont;
    helveticaOblique: PDFFont;
    logoImage: any;
  }) {
    const { page, data, helvetica, helveticaBold, logoImage } = ctx;
    const accent = resolveRgbColor(data.settings.accentColor);

    let currentY = 780;

    // Header strip
    page.drawRectangle({
      x: 50,
      y: currentY - 50,
      width: 495.28,
      height: 50,
      color: rgb(0.96, 0.97, 0.99),
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1,
    });

    page.drawText(`INVOICE: ${data.invoiceNumber}`, {
      x: 65,
      y: currentY - 24,
      size: 12,
      font: helveticaBold,
      color: accent,
    });
    page.drawText(`Date: ${data.invoiceDate}  •  Status: PAID`, {
      x: 65,
      y: currentY - 38,
      size: 8.5,
      font: helvetica,
      color: rgb(0.35, 0.4, 0.45),
    });

    if (logoImage) {
      const logoW = Math.min(70, logoImage.width);
      const logoH = (logoW / logoImage.width) * logoImage.height;
      page.drawImage(logoImage, {
        x: 525 - logoW,
        y: currentY - 45 + (40 - logoH) / 2,
        width: logoW,
        height: logoH,
      });
    }

    currentY -= 75;

    page.drawText("PROJECT & DELIVERABLE", { x: 50, y: currentY, size: 8, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) });
    currentY -= 15;
    page.drawText(data.projectTitle, { x: 50, y: currentY, size: 10, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
    currentY -= 15;

    const formatted = formatCurrencyString(data.currency, data.amount);
    page.drawText(`Amount Settled: ${formatted}`, {
      x: 50,
      y: currentY,
      size: 11,
      font: helveticaBold,
      color: accent,
    });
    currentY -= 30;

    page.drawText(`Customer: ${data.clientName} (${data.clientEmail || "Online Customer"})`, {
      x: 50,
      y: currentY,
      size: 9,
      font: helvetica,
      color: rgb(0.2, 0.2, 0.2),
    });
    currentY -= 15;
    page.drawText(`Provider: ${data.company.name || data.user.name} (${data.company.email || data.user.email || ""})`, {
      x: 50,
      y: currentY,
      size: 9,
      font: helvetica,
      color: rgb(0.2, 0.2, 0.2),
    });
  }
}

export const invoicePdfService = new InvoicePdfService();
