import {
  computeNormalizedInvoiceLayout,
  type LayoutInput,
  type NormalizedInvoiceLayout,
  type NormalizedElementConfig,
} from "../invoices/invoice-layout-schema.js";

export interface InvoiceLineItem {
  description: string;
  qty: number | string;
  rate: number | string;
  amount: number | string;
}

export interface InvoiceRenderData {
  isSample?: boolean;
  invoiceNumber: string;
  paymentReference?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  paymentMethod?: string;
  paymentStatus?: string;
  currency?: string;
  amount?: number | string;
  subtotal?: number | string;
  taxRate?: number | string;
  taxAmount?: number | string;
  clientName?: string;
  clientEmail?: string | null;
  clientCompany?: string | null;
  clientAddress?: string | null;
  clientPhone?: string | null;
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
  lineItems: InvoiceLineItem[];
  settings: LayoutInput;
}

function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCurrency(amount: number | string, currency = "INR"): string {
  if (typeof amount === "string") return amount;
  if (!Number.isFinite(amount)) return "0.00";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function generateInvoiceHtml(data: InvoiceRenderData): string {
  const layout = computeNormalizedInvoiceLayout({
    ...data.settings,
    paperSize: data.settings.paperSize,
  });

  const { paper, elements, table, accentColor } = layout;
  const currency = data.currency || "INR";
  const isPaid = String(data.paymentStatus || "PAID").toUpperCase() === "PAID";
  const statusLabel = isPaid ? "PAID" : String(data.paymentStatus || "PENDING").toUpperCase();

  const companyName = data.company.name || data.user.name || "My Design Company";
  const clientName = data.clientName || "Valued Client";
  const invoiceNumber = data.invoiceNumber && data.invoiceNumber !== "<invoice_number>" ? data.invoiceNumber : "INV-2026-0001";
  const invoiceDate = data.invoiceDate || "<date>";
  const dueDate = data.dueDate || data.invoiceDate || "<due_date>";
  const paymentRef = data.paymentReference || data.invoiceNumber || "UPI";

  // Calculate totals
  const subtotal = data.subtotal !== undefined
    ? data.subtotal
    : data.lineItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
  const totalAmount = data.amount !== undefined ? data.amount : subtotal;

  // Resolve company logo
  let logoSrc: string | null = null;
  if (data.company.logoBuffer) {
    logoSrc = `data:image/png;base64,${data.company.logoBuffer.toString("base64")}`;
  } else if (data.company.logoUrl) {
    logoSrc = data.company.logoUrl;
  }

  const logoInitial = escapeHtml(companyName.charAt(0).toUpperCase() || "M");
  const logoSizePx = {
    sm: 40,
    md: 56,
    lg: 72,
    xl: 88,
  }[layout.logoSize] || 56;

  const renderLogoHtml = (customAccent?: string) => {
    if (!layout.showLogo) return "";
    const effectiveAccent = customAccent || accentColor;
    if (logoSrc) {
      return `<img src="${logoSrc}" alt="Logo" class="logo-img" style="height: ${logoSizePx}px; max-width: 180px; object-fit: contain; border-radius: 8px;" />`;
    }
    return `<div class="logo-placeholder" style="width: ${logoSizePx}px; height: ${logoSizePx}px; background-color: ${effectiveAccent}; color: #ffffff; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: ${Math.round(logoSizePx * 0.4)}px; box-shadow: 0 1px 2px rgba(0,0,0,0.08);">${logoInitial}</div>`;
  };

  const renderElement = (id: string, innerHtml: string, extraClasses = "", extraStyle = "") => {
    const el = elements[id];
    if (!el || !el.visible) return "";
    const hasExplicitWidth = Boolean(el.style?.width);
    const classes = hasExplicitWidth ? extraClasses.replace(/\bw-full\b/g, "").trim() : extraClasses;
    return `<div id="invoice-el-${id}" class="invoice-element ${classes}" style="transform: ${el.transformCss}; ${el.styleCss} ${extraStyle}">${innerHtml}</div>`;
  };

  // Render Table Rows
  const tableRowsHtml = data.lineItems.map((item, idx) => {
    const desc = escapeHtml(item.description);
    const qty = typeof item.qty === "number" ? item.qty : escapeHtml(item.qty);
    const rate = typeof item.rate === "number" ? formatCurrency(item.rate, currency) : escapeHtml(item.rate);
    const amount = typeof item.amount === "number" ? formatCurrency(item.amount, currency) : escapeHtml(item.amount);
    const rowBorderClass = table.rowLines ? "border-b border-slate-100" : "";
    const colBorderClass = table.colLines ? "border-r border-slate-100" : "";

    return `
      <tr class="${rowBorderClass}">
        <td class="py-2.5 px-3 font-medium text-slate-800 ${colBorderClass}" style="text-align: ${table.cellAlignment}; ${table.fontColor ? `color: ${table.fontColor};` : ''}">${desc}</td>
        <td class="py-2.5 px-3 text-center text-slate-500 ${colBorderClass}">${qty}</td>
        <td class="py-2.5 px-3 text-right text-slate-500 ${colBorderClass}">${rate}</td>
        <td class="py-2.5 px-3 text-right font-semibold text-slate-900">${amount}</td>
      </tr>
    `;
  }).join("");

  const tableHtml = `
    <div class="${table.outerBorder ? 'border border-slate-200' : ''} rounded-lg overflow-hidden" style="page-break-inside: auto; border-color: ${elements.items?.style?.borderColor || '#e2e8f0'};">
      <table class="w-full text-left border-collapse" style="page-break-inside: auto;">
        <thead>
          <tr style="background-color: ${table.headerFill} !important; color: ${table.headerTextColor} !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;" class="${table.rowLines ? 'border-b border-slate-200' : ''}">
            ${table.columns.map((col) => `
              <th class="py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider ${table.colLines ? 'border-r border-slate-200' : ''}" style="width: ${col.width}; text-align: ${col.align}; color: ${table.headerTextColor} !important; background-color: ${table.headerFill} !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">${escapeHtml(col.label)}</th>
            `).join("")}
          </tr>
        </thead>
        <tbody class="text-xs">
          ${tableRowsHtml}
        </tbody>
      </table>
    </div>
  `;

  // Template Body Construction
  let templateBodyHtml = "";

  const isCustom = layout.templateId === "custom" || layout.templateId.startsWith("custom") || !["compact", "corporate", "agency", "minimal", "modern"].includes(layout.templateId);

  if (isCustom) {
    // -------------------------------------------------------------
    // TEMPLATE: CUSTOM
    // Mirrors invoice-template-view.tsx Custom Template structure
    // -------------------------------------------------------------
    const isCustomElVisible = (id: string) => {
      const el = elements[id];
      return el && el.visible;
    };

    const logoHtml = isCustomElVisible("logo") ? renderElement("logo", renderLogoHtml(elements.logo?.style.accentColor || accentColor), "w-full overflow-visible") : "";

    const titleHtml = isCustomElVisible("title") ? renderElement("title", `
      <div class="space-y-1">
        <h2 class="text-2xl font-black tracking-tight" style="${elements.title?.style.fontColor ? `color: ${elements.title.style.fontColor};` : ''}">${escapeHtml(companyName)}</h2>
        ${data.company.tagline ? `<p class="text-xs text-slate-500 font-medium tracking-wide uppercase mt-1" style="${elements.title?.style.fontColor ? `color: ${elements.title.style.fontColor}b3;` : ''}">${escapeHtml(data.company.tagline)}</p>` : ''}
      </div>
    `, "w-full overflow-visible") : "";

    const senderHtml = isCustomElVisible("sender") ? renderElement("sender", `
      <div class="space-y-0.5 text-xs text-slate-600">
        <p class="font-semibold text-slate-400 text-[10px] uppercase tracking-wider mb-1">From</p>
        ${data.user.name ? `<p class="font-bold text-slate-800">${escapeHtml(data.user.name)}</p>` : ''}
        ${data.company.email ? `<p>${escapeHtml(data.company.email)}</p>` : ''}
        ${data.company.phone ? `<p>${escapeHtml(data.company.phone)}</p>` : ''}
        ${data.company.address ? `<p class="max-w-xs">${escapeHtml(data.company.address)}</p>` : ''}
        ${layout.showTaxNumber && layout.taxNumber ? `<p class="font-mono text-slate-700 text-[11px] mt-1">Tax / GST: ${escapeHtml(layout.taxNumber)}</p>` : ''}
      </div>
    `, "w-full overflow-visible") : "";

    const clientHtml = isCustomElVisible("client") ? renderElement("client", `
      <div class="bg-slate-50/80 rounded-lg p-3.5 border border-slate-100 text-xs">
        <p class="font-semibold text-slate-400 text-[10px] uppercase tracking-wider mb-1">Billed To</p>
        <p class="font-bold text-slate-800 text-sm">${escapeHtml(clientName)}</p>
        ${data.clientCompany ? `<p class="font-medium text-slate-700">${escapeHtml(data.clientCompany)}</p>` : ''}
        ${data.clientEmail ? `<p class="text-slate-500">${escapeHtml(data.clientEmail)}</p>` : ''}
        ${data.clientAddress ? `<p class="max-w-xs text-slate-500">${escapeHtml(data.clientAddress)}</p>` : ''}
      </div>
    `, "w-full overflow-visible") : "";

    const metaHtml = isCustomElVisible("meta") ? renderElement("meta", `
      <div class="flex flex-wrap gap-6 text-xs rounded-xl p-3.5 bg-slate-50 border border-slate-100">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Invoice #</p>
          <p class="font-bold text-slate-800 font-mono mt-0.5">#${escapeHtml(invoiceNumber)}</p>
        </div>
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Date</p>
          <p class="font-medium text-slate-700 mt-0.5">${escapeHtml(invoiceDate)}</p>
        </div>
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Due</p>
          <p class="font-medium text-slate-700 mt-0.5">${escapeHtml(dueDate)}</p>
        </div>
      </div>
    `, "w-full overflow-visible") : "";

    const itemsHtml = isCustomElVisible("items") ? renderElement("items", tableHtml, "w-full my-4 overflow-visible") : "";

    const totalsInner = `
      <div class="w-56 space-y-1.5 text-xs text-slate-600">
        <div class="flex justify-between">
          <span>Subtotal</span>
          <span class="font-medium text-slate-900">${formatCurrency(subtotal, currency)}</span>
        </div>
        ${data.taxAmount ? `
          <div class="flex justify-between text-slate-500">
            <span>GST / Tax</span>
            <span>${formatCurrency(data.taxAmount, currency)}</span>
          </div>
        ` : ''}
        <div class="flex justify-between font-bold text-sm text-slate-900 border-t border-slate-200 pt-1.5" style="border-color: ${accentColor};">
          <span>Total Due</span>
          <span style="color: ${accentColor};">${formatCurrency(totalAmount, currency)}</span>
        </div>
      </div>
    `;
    const totalsHtml = isCustomElVisible("totals") ? renderElement("totals", totalsInner, "flex flex-col w-full items-end overflow-visible avoid-break") : "";

    const customTextContent = elements.customText?.style?.customContent || "Enter custom notes, terms, bank details, or instructions here...";
    const customTextInner = `
      <div class="text-xs whitespace-pre-wrap ${elements.customText?.style?.fillColor || elements.customText?.style?.showBorder ? 'p-3 rounded-lg' : 'py-2'}">
        <p style="${elements.customText?.style?.fontColor ? `color: ${elements.customText.style.fontColor};` : ''}">${escapeHtml(customTextContent)}</p>
      </div>
    `;
    const customTextHtml = isCustomElVisible("customText") ? renderElement("customText", customTextInner, "w-full overflow-visible avoid-break") : "";

    const notesHtml = (isCustomElVisible("notes") && layout.showNotes && (layout.notes || layout.terms)) ? renderElement("notes", `
      <div class="pt-4 border-t border-slate-100 text-xs text-slate-500 mt-6 avoid-break">
        <p class="font-medium text-slate-700">${escapeHtml(layout.notes)}</p>
        ${layout.terms ? `<p class="text-slate-400 mt-1">${escapeHtml(layout.terms)}</p>` : ''}
      </div>
    `, "w-full overflow-visible avoid-break") : "";

    templateBodyHtml = `
      <div class="flex flex-col w-full h-full justify-between gap-6">
        <div class="flex flex-col flex-1 w-full gap-5">
          ${logoHtml}
          ${titleHtml}
          ${senderHtml}
          ${clientHtml}
          ${metaHtml}
          ${itemsHtml}
          ${totalsHtml}
          ${customTextHtml}
        </div>
        ${notesHtml}
      </div>
    `;

  } else if (layout.templateId === "compact") {
    // -------------------------------------------------------------
    // TEMPLATE: COMPACT
    // -------------------------------------------------------------
    const headerStyle = elements.header?.style || {};
    const headerBg = headerStyle.fillColor || accentColor;

    const headerInner = `
      <div class="flex items-center justify-between gap-4 p-3.5 rounded-md text-white" style="background-color: ${headerBg};">
        <div class="flex items-center gap-3">
          ${renderElement("logo", renderLogoHtml(elements.logo?.style.accentColor || "#ffffff"))}
          ${renderElement("title", `<h1 class="font-bold text-lg leading-tight" style="${elements.title?.style.fontColor ? `color: ${elements.title.style.fontColor};` : ''}">${escapeHtml(companyName)}</h1>`)}
        </div>
        ${renderElement("meta", `
          <div class="text-right">
            <span class="font-black text-sm uppercase tracking-wider block">#${escapeHtml(invoiceNumber)}</span>
            <span class="text-white/80 text-xs block mt-0.5">${escapeHtml(invoiceDate)}</span>
          </div>
        `)}
      </div>
    `;

    const infoStripInner = `
      <div class="grid grid-cols-3 gap-2.5 p-3 bg-slate-50 rounded border border-slate-100 mb-3.5 text-xs">
        ${renderElement("sender", `
          <p class="font-bold text-slate-400 uppercase text-[9px] tracking-wider mb-0.5">From</p>
          <p class="font-semibold text-slate-800 wrap-break-word" style="${elements.sender?.style.fontColor ? `color: ${elements.sender.style.fontColor};` : ''}">${escapeHtml(data.user.name || companyName)}</p>
          ${layout.showTaxNumber && layout.taxNumber ? `<p class="text-slate-500 text-[11px] mt-0.5">Tax: ${escapeHtml(layout.taxNumber)}</p>` : ''}
        `)}
        ${renderElement("client", `
          <p class="font-bold text-slate-400 uppercase text-[9px] tracking-wider mb-0.5">To</p>
          <p class="font-semibold text-slate-800 wrap-break-word" style="${elements.client?.style.fontColor ? `color: ${elements.client.style.fontColor};` : ''}">${escapeHtml(clientName)}</p>
          ${data.clientEmail ? `<p class="text-slate-500 text-[11px] truncate mt-0.5">${escapeHtml(data.clientEmail)}</p>` : ''}
        `)}
        ${renderElement("status", `
          <p class="font-bold text-slate-400 uppercase text-[9px] tracking-wider mb-0.5">Status</p>
          <p class="font-bold text-emerald-600 text-sm" style="${elements.status?.style.accentColor ? `color: ${elements.status.style.accentColor};` : ''}">${escapeHtml(statusLabel)}</p>
          <p class="text-slate-500 text-[11px] truncate mt-0.5">${escapeHtml(paymentRef)}</p>
        `)}
      </div>
    `;

    const totalsInner = `
      <div class="flex justify-between items-center mt-3 pt-2.5 border-t border-slate-200">
        <div class="text-xs text-slate-500 font-medium">Receipt Confirmed</div>
        <div class="text-right flex items-center gap-3">
          <span class="text-xs text-slate-500">Total:</span>
          <span class="font-bold text-slate-900 text-base">${formatCurrency(totalAmount, currency)}</span>
        </div>
      </div>
    `;

    const customTextInner = elements.customText?.visible ? `
      <div class="whitespace-pre-wrap text-xs text-slate-600 my-3 p-2.5 rounded bg-slate-50 border border-slate-100">
        ${escapeHtml(elements.customText.style.customContent || "Custom note")}
      </div>
    ` : "";

    const footerInner = layout.showNotes && (layout.notes || layout.terms) ? `
      <div class="pt-3 border-t border-slate-100 text-slate-500 text-[11px] mt-auto flex justify-between">
        <span>${escapeHtml(layout.notes)}</span>
        <span class="text-slate-400">${escapeHtml(layout.terms)}</span>
      </div>
    ` : "";

    templateBodyHtml = `
      <div class="flex flex-col w-full h-full justify-between">
        <div>
          ${renderElement("header", headerInner, "mb-3 w-full")}
          ${infoStripInner}
          ${renderElement("items", tableHtml, "mb-3")}
          ${renderElement("totals", totalsInner, "avoid-break")}
          ${renderElement("customText", customTextInner, "avoid-break")}
        </div>
        ${renderElement("notes", footerInner, "avoid-break mt-6")}
      </div>
    `;

  } else if (layout.templateId === "corporate") {
    // -------------------------------------------------------------
    // TEMPLATE: CORPORATE
    // -------------------------------------------------------------
    const headerInner = `
      <div class="border-t-2 border-slate-800 pt-5 pb-6 mb-4 flex justify-between items-start">
        <div class="space-y-1">
          ${renderElement("title", `
            <h1 class="text-2xl font-black tracking-tight text-slate-900 uppercase">${escapeHtml(companyName)}</h1>
            ${data.company.tagline ? `<p class="text-xs text-slate-500 font-medium">${escapeHtml(data.company.tagline)}</p>` : ''}
          `)}
          ${renderElement("sender", `
            <div class="text-xs text-slate-600 space-y-0.5 pt-2">
              <p class="font-semibold text-slate-800">${escapeHtml(data.user.name || companyName)}</p>
              ${data.company.email ? `<p>${escapeHtml(data.company.email)}</p>` : ''}
              ${data.company.phone ? `<p>${escapeHtml(data.company.phone)}</p>` : ''}
              ${data.company.address ? `<p class="max-w-xs">${escapeHtml(data.company.address)}</p>` : ''}
              ${layout.showTaxNumber && layout.taxNumber ? `<p class="font-mono text-[11px] mt-1">Tax: ${escapeHtml(layout.taxNumber)}</p>` : ''}
            </div>
          `)}
        </div>
        <div class="flex flex-col items-end text-right space-y-2">
          ${renderElement("logo", renderLogoHtml())}
          ${renderElement("meta", `
            <div class="space-y-1">
              <span class="text-xl font-black text-slate-900 block">INVOICE</span>
              <span class="text-xs font-mono text-slate-600 block">#${escapeHtml(invoiceNumber)}</span>
              <span class="text-xs text-slate-500 block">Date: ${escapeHtml(invoiceDate)}</span>
              <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'} mt-1">${escapeHtml(statusLabel)}</span>
            </div>
          `)}
        </div>
      </div>
    `;

    const clientInner = `
      <div class="bg-slate-50 p-3.5 rounded border border-slate-200 mb-5">
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Billed To</p>
        <p class="font-bold text-slate-900 text-sm">${escapeHtml(clientName)}</p>
        ${data.clientCompany ? `<p class="text-xs text-slate-700 font-medium">${escapeHtml(data.clientCompany)}</p>` : ''}
        ${data.clientEmail ? `<p class="text-xs text-slate-500">${escapeHtml(data.clientEmail)}</p>` : ''}
        ${data.clientAddress ? `<p class="text-xs text-slate-500 max-w-xs">${escapeHtml(data.clientAddress)}</p>` : ''}
      </div>
    `;

    const totalsInner = `
      <div class="flex justify-end mt-4">
        <div class="w-64 space-y-1.5 text-xs text-slate-600">
          <div class="flex justify-between py-1 border-b border-slate-100">
            <span>Subtotal</span>
            <span class="font-medium text-slate-800">${formatCurrency(subtotal, currency)}</span>
          </div>
          ${data.taxAmount ? `
            <div class="flex justify-between py-1 border-b border-slate-100">
              <span>Tax</span>
              <span class="font-medium text-slate-800">${formatCurrency(data.taxAmount, currency)}</span>
            </div>
          ` : ''}
          <div class="flex justify-between py-2 border-t-2 border-slate-800 text-sm font-bold text-slate-900">
            <span>Total Due</span>
            <span>${formatCurrency(totalAmount, currency)}</span>
          </div>
        </div>
      </div>
    `;

    templateBodyHtml = `
      <div class="flex flex-col w-full h-full justify-between">
        <div>
          ${headerInner}
          ${renderElement("client", clientInner)}
          ${renderElement("items", tableHtml, "mb-4")}
          ${renderElement("totals", totalsInner, "avoid-break")}
        </div>
        ${layout.showNotes && (layout.notes || layout.terms) ? renderElement("notes", `
          <div class="pt-4 border-t border-slate-200 text-xs text-slate-500 mt-8 avoid-break">
            <p class="font-medium text-slate-700">${escapeHtml(layout.notes)}</p>
            <p class="text-slate-400 mt-1">${escapeHtml(layout.terms)}</p>
          </div>
        `) : ''}
      </div>
    `;

  } else if (layout.templateId === "agency") {
    // -------------------------------------------------------------
    // TEMPLATE: AGENCY
    // -------------------------------------------------------------
    const headerInner = `
      <div class="flex justify-between items-start pb-6 border-b border-slate-100 mb-5">
        <div>
          ${renderElement("logo", renderLogoHtml(), "mb-3")}
          ${renderElement("title", `
            <h1 class="text-2xl font-black text-slate-900 tracking-tight">${escapeHtml(companyName)}</h1>
            ${data.company.tagline ? `<p class="text-xs text-slate-500 uppercase tracking-widest mt-1">${escapeHtml(data.company.tagline)}</p>` : ''}
          `)}
        </div>
        ${renderElement("meta", `
          <div class="text-right space-y-1">
            <span class="text-3xl font-black tracking-tight" style="color: ${accentColor};">#${escapeHtml(invoiceNumber)}</span>
            <p class="text-xs text-slate-500 font-medium">Issued: ${escapeHtml(invoiceDate)}</p>
            <p class="text-xs text-slate-500">Due: ${escapeHtml(dueDate)}</p>
          </div>
        `)}
      </div>
    `;

    const infoInner = `
      <div class="grid grid-cols-2 gap-8 mb-6 text-xs">
        ${renderElement("sender", `
          <p class="font-bold text-[10px] text-slate-400 uppercase tracking-wider mb-1">From Agency</p>
          <p class="font-bold text-slate-900">${escapeHtml(data.user.name || companyName)}</p>
          ${data.company.email ? `<p class="text-slate-600">${escapeHtml(data.company.email)}</p>` : ''}
          ${data.company.address ? `<p class="text-slate-500">${escapeHtml(data.company.address)}</p>` : ''}
        `)}
        ${renderElement("client", `
          <p class="font-bold text-[10px] text-slate-400 uppercase tracking-wider mb-1">Client</p>
          <p class="font-bold text-slate-900">${escapeHtml(clientName)}</p>
          ${data.clientEmail ? `<p class="text-slate-600">${escapeHtml(data.clientEmail)}</p>` : ''}
          ${data.clientAddress ? `<p class="text-slate-500">${escapeHtml(data.clientAddress)}</p>` : ''}
        `)}
      </div>
    `;

    const totalsInner = `
      <div class="flex justify-end mt-4">
        <div class="w-72 bg-slate-50 p-4 rounded-lg border border-slate-100 space-y-2 text-xs">
          <div class="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span class="font-medium text-slate-900">${formatCurrency(subtotal, currency)}</span>
          </div>
          <div class="flex justify-between pt-2 border-t border-slate-200 text-base font-black text-slate-900">
            <span>Total Amount</span>
            <span style="color: ${accentColor};">${formatCurrency(totalAmount, currency)}</span>
          </div>
        </div>
      </div>
    `;

    templateBodyHtml = `
      <div class="flex w-full h-full">
        <div class="w-2 rounded-full mr-6 shrink-0" style="background-color: ${accentColor};"></div>
        <div class="flex-1 flex flex-col justify-between">
          <div>
            ${headerInner}
            ${infoInner}
            ${renderElement("items", tableHtml, "mb-4")}
            ${renderElement("totals", totalsInner, "avoid-break")}
          </div>
          ${layout.showNotes && (layout.notes || layout.terms) ? renderElement("notes", `
            <div class="pt-4 border-t border-slate-100 text-xs text-slate-500 mt-8 avoid-break">
              <p>${escapeHtml(layout.notes)}</p>
              <p class="text-slate-400 mt-1">${escapeHtml(layout.terms)}</p>
            </div>
          `) : ''}
        </div>
      </div>
    `;

  } else if (layout.templateId === "minimal") {
    // -------------------------------------------------------------
    // TEMPLATE: MINIMAL
    // -------------------------------------------------------------
    const headerInner = `
      <div class="flex justify-between items-start pb-6 border-b border-slate-200 mb-6">
        <div>
          ${renderElement("title", `
            <h1 class="text-2xl font-light tracking-wide text-slate-900">${escapeHtml(companyName)}</h1>
          `)}
          ${renderElement("sender", `
            <div class="text-xs text-slate-500 space-y-0.5 mt-2">
              <p class="font-medium text-slate-700">${escapeHtml(data.user.name || companyName)}</p>
              ${data.company.email ? `<p>${escapeHtml(data.company.email)}</p>` : ''}
            </div>
          `)}
        </div>
        ${renderElement("meta", `
          <div class="text-right space-y-1">
            <span class="text-xs font-mono text-slate-400 uppercase tracking-widest block">Invoice</span>
            <span class="text-sm font-semibold text-slate-800 block">#${escapeHtml(invoiceNumber)}</span>
            <span class="text-xs text-slate-400 block">${escapeHtml(invoiceDate)}</span>
          </div>
        `)}
      </div>
    `;

    const clientInner = `
      <div class="mb-6 text-xs text-slate-600">
        <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">To</p>
        <p class="font-semibold text-slate-800 text-sm">${escapeHtml(clientName)}</p>
        ${data.clientEmail ? `<p class="text-slate-500">${escapeHtml(data.clientEmail)}</p>` : ''}
      </div>
    `;

    const totalsInner = `
      <div class="flex justify-end mt-4">
        <div class="w-64 space-y-1 text-xs text-slate-600">
          <div class="flex justify-between py-1">
            <span>Total</span>
            <span class="font-bold text-slate-900 text-sm">${formatCurrency(totalAmount, currency)}</span>
          </div>
        </div>
      </div>
    `;

    templateBodyHtml = `
      <div class="flex flex-col w-full h-full justify-between">
        <div>
          ${headerInner}
          ${renderElement("client", clientInner)}
          ${renderElement("items", tableHtml, "mb-4")}
          ${renderElement("totals", totalsInner, "avoid-break")}
        </div>
        ${layout.showNotes && (layout.notes || layout.terms) ? renderElement("notes", `
          <div class="pt-4 border-t border-slate-100 text-xs text-slate-400 mt-8 avoid-break">
            <p>${escapeHtml(layout.notes)}</p>
          </div>
        `) : ''}
      </div>
    `;

  } else {
    // -------------------------------------------------------------
    // TEMPLATE: MODERN (Default & Custom fallback)
    // -------------------------------------------------------------
    const headerInner = `
      <div class="flex justify-between items-start pb-6 border-b border-slate-100 mb-5">
        <div class="flex-1 space-y-1">
          ${renderElement("logo", renderLogoHtml(), "mb-3")}
          ${renderElement("title", `
            <h1 class="text-2xl font-bold text-slate-900 tracking-tight">${escapeHtml(companyName)}</h1>
            ${data.company.tagline ? `<p class="text-xs text-slate-500 mt-0.5">${escapeHtml(data.company.tagline)}</p>` : ''}
          `)}
          ${renderElement("sender", `
            <div class="text-xs text-slate-500 mt-2 space-y-0.5">
              <p class="font-medium text-slate-800">${escapeHtml(data.user.name || companyName)}</p>
              ${data.company.email ? `<p>${escapeHtml(data.company.email)}</p>` : ''}
              ${data.company.phone ? `<p>${escapeHtml(data.company.phone)}</p>` : ''}
              ${data.company.address ? `<p class="max-w-xs">${escapeHtml(data.company.address)}</p>` : ''}
              ${layout.showTaxNumber && layout.taxNumber ? `<p class="font-medium text-slate-700 mt-1">Tax / GST: ${escapeHtml(layout.taxNumber)}</p>` : ''}
            </div>
          `)}
        </div>
        ${renderElement("meta", `
          <div class="flex flex-col items-end text-right shrink-0 space-y-1.5">
            <div class="inline-block px-3 py-1 rounded-full font-semibold uppercase tracking-wider text-[11px] mb-1" style="background-color: ${accentColor}18; color: ${accentColor};">
              ${escapeHtml(statusLabel)}
            </div>
            <div class="space-y-0.5">
              <span class="text-xs text-slate-400 uppercase tracking-wider block">Invoice</span>
              <span class="text-base font-bold text-slate-900 block">#${escapeHtml(invoiceNumber)}</span>
            </div>
            <div class="text-xs text-slate-500 pt-1">
              <p><span class="text-slate-400">Date:</span> ${escapeHtml(invoiceDate)}</p>
              ${dueDate ? `<p><span class="text-slate-400">Due:</span> ${escapeHtml(dueDate)}</p>` : ''}
            </div>
          </div>
        `)}
      </div>
    `;

    const clientInner = `
      <div class="bg-slate-50/80 rounded-lg p-3.5 border border-slate-100 mb-5 text-xs">
        <p class="font-semibold text-slate-400 text-[10px] uppercase tracking-wider mb-1">Billed To</p>
        <p class="font-bold text-slate-900 text-sm">${escapeHtml(clientName)}</p>
        ${data.clientCompany ? `<p class="text-slate-700 font-medium">${escapeHtml(data.clientCompany)}</p>` : ''}
        ${data.clientEmail ? `<p class="text-slate-500">${escapeHtml(data.clientEmail)}</p>` : ''}
        ${data.clientAddress ? `<p class="text-slate-500 max-w-xs">${escapeHtml(data.clientAddress)}</p>` : ''}
      </div>
    `;

    const totalsInner = `
      <div class="flex justify-end mt-4">
        <div class="w-64 space-y-2 text-xs text-slate-600">
          <div class="flex justify-between py-1 border-b border-slate-100">
            <span>Subtotal</span>
            <span class="font-medium text-slate-800">${formatCurrency(subtotal, currency)}</span>
          </div>
          ${data.taxAmount ? `
            <div class="flex justify-between py-1 border-b border-slate-100">
              <span>Tax / GST</span>
              <span class="font-medium text-slate-800">${formatCurrency(data.taxAmount, currency)}</span>
            </div>
          ` : ''}
          <div class="flex justify-between py-2 border-t border-slate-200 text-sm font-bold text-slate-900">
            <span>Total Due</span>
            <span style="color: ${accentColor}; font-size: 16px;">${formatCurrency(totalAmount, currency)}</span>
          </div>
        </div>
      </div>
    `;

    templateBodyHtml = `
      <div class="flex flex-col w-full h-full justify-between">
        <div>
          <div class="h-1.5 w-full mb-6 rounded-full" style="background-color: ${accentColor};"></div>
          ${headerInner}
          ${renderElement("client", clientInner)}
          ${renderElement("items", tableHtml, "mb-4")}
          ${renderElement("totals", totalsInner, "avoid-break")}
          ${renderElement("customText", `
            <div class="text-xs whitespace-pre-wrap ${elements.customText?.style.fillColor || elements.customText?.style.showBorder ? 'p-3 rounded-lg' : 'py-2'}">
              <p style="${elements.customText?.style.fontColor ? `color: ${elements.customText.style.fontColor};` : ''}">${escapeHtml(elements.customText?.style?.customContent || "Enter custom notes, terms, bank details, or instructions here...")}</p>
            </div>
          `, "avoid-break my-3")}
        </div>
        ${layout.showNotes && (layout.notes || layout.terms) ? renderElement("notes", `
          <div class="pt-4 border-t border-slate-100 text-xs text-slate-500 mt-8 avoid-break">
            <p class="font-medium text-slate-700">${escapeHtml(layout.notes)}</p>
            <p class="text-slate-400 mt-1">${escapeHtml(layout.terms)}</p>
          </div>
        `) : ''}
      </div>
    `;
  }

  // Construct Full HTML Document
  const requestedFontFamily = layout.fontFamily || "Inter";
  const fontLink = requestedFontFamily && !["Arial", "Helvetica", "sans-serif", "serif", "monospace"].includes(requestedFontFamily)
    ? `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(requestedFontFamily).replace(/%20/g, "+")}:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice #${escapeHtml(invoiceNumber)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  ${fontLink}
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 100%;
      height: 100%;
      background: #ffffff;
      color: #0f172a;
      font-family: "${requestedFontFamily}", 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    @page {
      size: ${paper.pdfFormat};
      margin: 0;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .invoice-page {
        box-shadow: none !important;
        border: none !important;
        margin: 0 !important;
        padding: ${paper.padding}px !important;
        width: 100% !important;
        min-height: 100% !important;
      }
      table {
        page-break-inside: auto;
      }
      thead {
        display: table-header-group;
      }
      tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .avoid-break {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
    .invoice-page {
      width: ${paper.width}px;
      min-height: ${paper.height}px;
      padding: ${paper.padding}px;
      margin: 0 auto;
      background: #ffffff;
      position: relative;
      display: flex;
      flex-direction: column;
    }
    /* Utility Classes */
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .flex-row { flex-direction: row; }
    .items-start { align-items: flex-start; }
    .items-center { align-items: center; }
    .items-end { align-items: flex-end; }
    .justify-start { justify-content: flex-start; }
    .justify-center { justify-content: center; }
    .justify-end { justify-content: flex-end; }
    .justify-between { justify-content: space-between; }
    .flex-1 { flex: 1 1 0%; }
    .shrink-0 { flex-shrink: 0; }
    .grid { display: grid; }
    .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .gap-1 { gap: 4px; }
    .gap-2 { gap: 8px; }
    .gap-2\\.5 { gap: 10px; }
    .gap-3 { gap: 12px; }
    .gap-3\\.5 { gap: 14px; }
    .gap-4 { gap: 16px; }
    .gap-6 { gap: 24px; }
    .gap-8 { gap: 32px; }
    .space-y-0\\.5 > * + * { margin-top: 2px; }
    .space-y-1 > * + * { margin-top: 4px; }
    .space-y-1\\.5 > * + * { margin-top: 6px; }
    .space-y-2 > * + * { margin-top: 8px; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .font-light { font-weight: 300; }
    .font-normal { font-weight: 400; }
    .font-medium { font-weight: 500; }
    .font-semibold { font-weight: 600; }
    .font-bold { font-weight: 700; }
    .font-black { font-weight: 900; }
    .text-\\[9px\\] { font-size: 9px; }
    .text-\\[10px\\] { font-size: 10px; }
    .text-\\[11px\\] { font-size: 11px; }
    .text-xs { font-size: 12px; }
    .text-sm { font-size: 14px; }
    .text-base { font-size: 16px; }
    .text-lg { font-size: 18px; }
    .text-xl { font-size: 20px; }
    .text-2xl { font-size: 24px; }
    .text-3xl { font-size: 30px; }
    .uppercase { text-transform: uppercase; }
    .tracking-tight { letter-spacing: -0.025em; }
    .tracking-wide { letter-spacing: 0.025em; }
    .tracking-wider { letter-spacing: 0.05em; }
    .tracking-widest { letter-spacing: 0.1em; }
    .leading-tight { line-height: 1.25; }
    .p-2 { padding: 8px; }
    .p-2\\.5 { padding: 10px; }
    .p-3 { padding: 12px; }
    .p-3\\.5 { padding: 14px; }
    .p-4 { padding: 16px; }
    .py-1 { padding-top: 4px; padding-bottom: 4px; }
    .py-1\\.5 { padding-top: 6px; padding-bottom: 6px; }
    .py-2 { padding-top: 8px; padding-bottom: 8px; }
    .py-2\\.5 { padding-top: 10px; padding-bottom: 10px; }
    .px-2 { padding-left: 8px; padding-right: 8px; }
    .px-3 { padding-left: 12px; padding-right: 12px; }
    .px-4 { padding-left: 16px; padding-right: 16px; }
    .pt-1 { padding-top: 4px; }
    .pt-2 { padding-top: 8px; }
    .pt-2\\.5 { padding-top: 10px; }
    .pt-3 { padding-top: 12px; }
    .pt-4 { padding-top: 16px; }
    .pt-5 { padding-top: 20px; }
    .pb-6 { padding-bottom: 24px; }
    .mb-1 { margin-bottom: 4px; }
    .mb-3 { margin-bottom: 12px; }
    .mb-3\\.5 { margin-bottom: 14px; }
    .mb-4 { margin-bottom: 16px; }
    .mb-5 { margin-bottom: 20px; }
    .mb-6 { margin-bottom: 24px; }
    .mt-0\\.5 { margin-top: 2px; }
    .mt-1 { margin-top: 4px; }
    .mt-2 { margin-top: 8px; }
    .mt-3 { margin-top: 12px; }
    .mt-4 { margin-top: 16px; }
    .mt-6 { margin-top: 24px; }
    .mt-8 { margin-top: 32px; }
    .mt-auto { margin-top: auto; }
    .mr-6 { margin-right: 24px; }
    .w-full { width: 100%; }
    .h-full { height: 100%; }
    .w-2 { width: 8px; }
    .w-64 { width: 256px; }
    .w-72 { width: 288px; }
    .max-w-xs { max-width: 320px; }
    .rounded { border-radius: 4px; }
    .rounded-md { border-radius: 6px; }
    .rounded-lg { border-radius: 8px; }
    .rounded-full { border-radius: 9999px; }
    .border { border-width: 1px; border-style: solid; }
    .border-b { border-bottom-width: 1px; border-bottom-style: solid; }
    .border-t { border-top-width: 1px; border-top-style: solid; }
    .border-t-2 { border-top-width: 2px; border-top-style: solid; }
    .border-r { border-right-width: 1px; border-right-style: solid; }
    .border-slate-100 { border-color: #f1f5f9; }
    .border-slate-200 { border-color: #e2e8f0; }
    .border-slate-800 { border-color: #1e293b; }
    .bg-white { background-color: #ffffff; }
    .bg-slate-50 { background-color: #f8fafc; }
    .bg-slate-50\\/80 { background-color: rgba(248, 250, 252, 0.8); }
    .bg-slate-100 { background-color: #f1f5f9; }
    .bg-emerald-50 { background-color: #ecfdf5; }
    .bg-amber-50 { background-color: #fffbeb; }
    .text-white { color: #ffffff; }
    .text-white\\/80 { color: rgba(255, 255, 255, 0.8); }
    .text-slate-400 { color: #94a3b8; }
    .text-slate-500 { color: #64748b; }
    .text-slate-600 { color: #475569; }
    .text-slate-700 { color: #334155; }
    .text-slate-800 { color: #1e293b; }
    .text-slate-900 { color: #0f172a; }
    .text-emerald-600 { color: #059669; }
    .text-emerald-700 { color: #047857; }
    .text-amber-700 { color: #b45309; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .break-words { overflow-wrap: break-word; }
    .block { display: block; }
    .inline-block { display: inline-block; }
    .invoice-element {
      position: relative;
      transition: none;
    }
  </style>
</head>
<body>
  <div class="invoice-page">
    ${templateBodyHtml}
  </div>
</body>
</html>`;
}
