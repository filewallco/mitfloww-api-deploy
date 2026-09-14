export type InvoiceTemplateId =
  | "modern"
  | "corporate"
  | "agency"
  | "minimal"
  | "compact"
  | "custom"
  | string;

export type InvoicePaperSize = "a4" | "a5" | "letter";
export type InvoiceAlignment = "left" | "center" | "right";

export interface InvoicePaperDimension {
  id: InvoicePaperSize;
  name: string;
  width: number;
  height: number;
  pdfFormat: "A4" | "A5" | "Letter";
  padding: number;
}

export const INVOICE_PAPER_CONFIG: Record<InvoicePaperSize, InvoicePaperDimension> = {
  a4: {
    id: "a4",
    name: "A4",
    width: 794,
    height: 1123,
    pdfFormat: "A4",
    padding: 44,
  },
  a5: {
    id: "a5",
    name: "A5",
    width: 560,
    height: 794,
    pdfFormat: "A5",
    padding: 32,
  },
  letter: {
    id: "letter",
    name: "Letter",
    width: 816,
    height: 1056,
    pdfFormat: "Letter",
    padding: 44,
  },
};

export const INVOICE_ACCENT_COLORS: Record<string, string> = {
  primary: "#6366f1",
  sky: "#0284c7",
  emerald: "#059669",
  slate: "#334155",
  rose: "#e11d48",
  amber: "#d97706",
  violet: "#7c3aed",
};

export function resolveAccentColor(value: string | null | undefined, fallback = "#6366f1"): string {
  if (!value) return fallback;
  const clean = value.trim().toLowerCase();
  return INVOICE_ACCENT_COLORS[clean] || value;
}

export interface InvoiceElementStyle {
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  fontSize?: string;
  width?: string;
  alignment?: InvoiceAlignment;
  fontColor?: string;
  fillColor?: string;
  accentColor?: string;
  opacity?: number;
  customContent?: string;
  showBorder?: boolean;
  borderStyle?: "solid" | "dashed" | "dotted" | "double";
  borderWidth?: number;
  borderColor?: string;
  tableOuterBorder?: boolean;
  tableRowLines?: boolean;
  tableColLines?: boolean;
  tableHeaderFill?: string;
  tableHeaderTextColor?: string;
  tableCellAlignment?: InvoiceAlignment;
}

export interface NormalizedElementConfig {
  id: string;
  label: string;
  visible: boolean;
  offset: { x: number; y: number };
  transformCss: string;
  style: InvoiceElementStyle;
  styleCss: string;
  alignment: InvoiceAlignment;
}

export interface NormalizedTableConfig {
  columns: Array<{
    key: "description" | "quantity" | "unitPrice" | "total";
    label: string;
    width: string;
    align: InvoiceAlignment;
  }>;
  outerBorder: boolean;
  rowLines: boolean;
  colLines: boolean;
  headerFill: string;
  headerTextColor: string;
  cellAlignment: InvoiceAlignment;
  fontColor?: string;
}

export interface NormalizedInvoiceLayout {
  templateId: InvoiceTemplateId;
  paper: InvoicePaperDimension;
  accentColor: string;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  elements: Record<string, NormalizedElementConfig>;
  table: NormalizedTableConfig;
  showNotes: boolean;
  notes: string;
  terms: string;
  showLogo: boolean;
  showTaxNumber: boolean;
  taxNumber: string;
  logoSize: "sm" | "md" | "lg" | "xl";
}

export interface LayoutInput {
  templateId?: InvoiceTemplateId;
  paperSize?: InvoicePaperSize | string | null;
  accentColor?: string | null;
  fontFamily?: string | null;
  fontWeight?: string | null;
  fontStyle?: string | null;
  logoAlignment?: InvoiceAlignment | null;
  nameAlignment?: InvoiceAlignment | null;
  showLogo?: boolean | null;
  showTaxNumber?: boolean | null;
  taxNumber?: string | null;
  showNotes?: boolean | null;
  notes?: string | null;
  terms?: string | null;
  logoSize?: "sm" | "md" | "lg" | "xl" | null;
  customElements?: string[] | null;
  customElementStyles?: Record<string, InvoiceElementStyle> | string | null;
  customElementOffsets?: Record<string, { x: number; y: number }> | string | null;
}

function parseJsonField<T>(val: T | string | null | undefined): T {
  if (!val) return {} as T;
  if (typeof val === "object") return val as T;
  try {
    const parsed = JSON.parse(val as string);
    return (parsed && typeof parsed === "object" ? parsed : {}) as T;
  } catch {
    return {} as T;
  }
}

export function computeNormalizedInvoiceLayout(input: LayoutInput): NormalizedInvoiceLayout {
  const templateId = (input.templateId || "modern").toLowerCase();
  const paperKey = (input.paperSize?.toLowerCase() || "a4") as InvoicePaperSize;
  const paper = INVOICE_PAPER_CONFIG[paperKey] || INVOICE_PAPER_CONFIG.a4;

  const defaultAccents: Record<string, string> = {
    modern: "#6366f1",
    corporate: "#334155",
    agency: "#0284c7",
    minimal: "#0f172a",
    compact: "#059669",
    custom: "#6366f1",
  };

  const accentColor = resolveAccentColor(
    input.accentColor,
    defaultAccents[templateId] || "#6366f1"
  );

  const rawOffsets = parseJsonField<Record<string, { x: number; y: number }>>(
    input.customElementOffsets
  );
  const rawStyles = parseJsonField<Record<string, InvoiceElementStyle>>(
    input.customElementStyles
  );

  const customElements = Array.isArray(input.customElements)
    ? input.customElements
    : typeof input.customElements === "string"
    ? (input.customElements as string).split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const isVisible = (id: string) => {
    if (!customElements) return true;
    if (customElements.length === 0) return templateId !== "custom";
    return customElements.includes(id);
  };

  const elementIds = [
    "header",
    "logo",
    "title",
    "sender",
    "client",
    "meta",
    "status",
    "items",
    "totals",
    "customText",
    "notes",
  ];

  const elements: Record<string, NormalizedElementConfig> = {};

  for (const id of elementIds) {
    const offsetRaw = rawOffsets[id] || { x: 0, y: 0 };
    const offset = {
      x: Number.isFinite(offsetRaw.x) ? Math.round(offsetRaw.x) : 0,
      y: Number.isFinite(offsetRaw.y) ? Math.round(offsetRaw.y) : 0,
    };
    const style = rawStyles[id] || {};

    let alignment: InvoiceAlignment =
      style.alignment ||
      (id === "logo" ? input.logoAlignment || "left" : "left");
    if (id === "title") alignment = style.alignment || input.nameAlignment || "left";

    // Build style string
    const styleParts: string[] = [];
    if (style.fontFamily) styleParts.push(`font-family: "${style.fontFamily}", sans-serif;`);
    if (style.fontWeight) styleParts.push(`font-weight: ${style.fontWeight};`);
    if (style.fontStyle) styleParts.push(`font-style: ${style.fontStyle};`);
    if (style.fontSize) styleParts.push(`font-size: ${style.fontSize};`);
    if (style.fontColor) styleParts.push(`color: ${style.fontColor};`);
    if (style.fillColor) styleParts.push(`background-color: ${style.fillColor};`);
    if (style.width) styleParts.push(`width: ${style.width}; max-width: ${style.width};`);
    if (typeof style.opacity === "number") styleParts.push(`opacity: ${style.opacity};`);

    if (style.showBorder) {
      const bWidth = style.borderWidth || 1;
      const bStyle = style.borderStyle || "solid";
      const bColor = style.borderColor || style.accentColor || accentColor || "#cbd5e1";
      styleParts.push(`border: ${bWidth}px ${bStyle} ${bColor};`);
    }

    elements[id] = {
      id,
      label: id.toUpperCase(),
      visible: isVisible(id),
      offset,
      transformCss: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
      style,
      styleCss: styleParts.join(" "),
      alignment,
    };
  }

  // Table configuration normalization
  const itemsStyle = elements.items?.style || {};
  let defaultHeaderFill = itemsStyle.accentColor || accentColor;
  let defaultHeaderTextColor = "#ffffff";
  let col1Label = "Description";
  let col4Label = "Amount";

  if (templateId === "compact") {
    defaultHeaderFill = "#f1f5f9";
    defaultHeaderTextColor = "#334155";
    col1Label = "Item";
    col4Label = "Total";
  } else if (templateId === "corporate") {
    defaultHeaderFill = "#f8fafc";
    defaultHeaderTextColor = "#1e293b";
    col1Label = "ITEM & DESCRIPTION";
    col4Label = "TOTAL";
  } else if (templateId === "agency") {
    defaultHeaderFill = "transparent";
    defaultHeaderTextColor = "#0284c7";
    col1Label = "Deliverable";
    col4Label = "Total";
  } else if (templateId === "minimal") {
    defaultHeaderFill = "transparent";
    defaultHeaderTextColor = "#0f172a";
    col1Label = "Description";
    col4Label = "Total";
  }

  const table: NormalizedTableConfig = {
    columns: [
      { key: "description", label: col1Label, width: "48%", align: itemsStyle.tableCellAlignment || "left" },
      { key: "quantity", label: "Qty", width: "14%", align: "center" },
      { key: "unitPrice", label: "Price", width: "18%", align: "right" },
      { key: "total", label: col4Label, width: "20%", align: "right" },
    ],
    outerBorder: itemsStyle.tableOuterBorder ?? itemsStyle.showBorder ?? true,
    rowLines: itemsStyle.tableRowLines ?? true,
    colLines: itemsStyle.tableColLines ?? false,
    headerFill: itemsStyle.tableHeaderFill || itemsStyle.fillColor || defaultHeaderFill,
    headerTextColor: itemsStyle.tableHeaderTextColor || defaultHeaderTextColor,
    cellAlignment: itemsStyle.tableCellAlignment || "left",
    fontColor: itemsStyle.fontColor,
  };

  return {
    templateId,
    paper,
    accentColor,
    fontFamily: input.fontFamily || "Inter",
    fontWeight: input.fontWeight || "normal",
    fontStyle: input.fontStyle || "normal",
    elements,
    table,
    showNotes: input.showNotes ?? true,
    notes: input.notes ?? "Thank you for your business! All deliverables are approved and licensed for client use.",
    terms: input.terms ?? "Payment confirmed in full via UPI. Receipt generated automatically by MitFloww.",
    showLogo: input.showLogo ?? true,
    showTaxNumber: input.showTaxNumber ?? false,
    taxNumber: input.taxNumber ?? "",
    logoSize: input.logoSize || "md",
  };
}
