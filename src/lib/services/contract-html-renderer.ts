import { MITFLOWW_LOGO_BASE64 } from "../email/email-logo.js";

export interface ContractPdfData {
  contractId: string;
  projectId: string;
  projectTitle: string;
  version: number;
  status: "accepted" | "pending" | "proposed";
  date: string;
  acceptedAt?: string | null;
  acceptedBy?: string | null;
  creatorName: string;
  creatorEmail: string;
  clientName: string;
  clientEmail: string;
  currency: string;
  amountCents: number;
  advancePaymentEnabled: boolean;
  advanceAmountCents: number;
  remainingAmountCents: number;
  revisionLimit: number;
  extraRevisionCostCents: number;
  termsNotes?: string;
}

export function formatContractCurrency(cents: number, currency: string): string {
  const amount = (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${amount}`;
}

export function generateContractHtml(data: ContractPdfData): string {
  const formattedTotal = formatContractCurrency(data.amountCents, data.currency);
  const formattedAdvance = data.advancePaymentEnabled
    ? formatContractCurrency(data.advanceAmountCents, data.currency)
    : "None";
  const formattedRemaining = formatContractCurrency(
    data.advancePaymentEnabled ? data.remainingAmountCents : data.amountCents,
    data.currency,
  );
  const formattedExtraRevision = formatContractCurrency(
    data.extraRevisionCostCents,
    data.currency,
  );

  const advancePct =
    data.advancePaymentEnabled && data.amountCents > 0
      ? Math.round((data.advanceAmountCents / data.amountCents) * 100)
      : null;

  const isAccepted = data.status === "accepted";
  const badgeText = isAccepted
    ? `ACTIVE CONTRACT (v${data.version})`
    : `PROPOSED CONTRACT (v${data.version})`;
  const badgeBg = isAccepted ? "#10b981" : "#f59e0b";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MitFloww Project Contract - ${data.projectTitle}</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 16mm 18mm 16mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1f2937;
      background-color: #ffffff;
      line-height: 1.5;
      font-size: 13px;
      -webkit-font-smoothing: antialiased;
    }
    .contract-container {
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 20px;
      border-bottom: 2px solid #f3f4f6;
    }
    .logo-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-img {
      height: 38px;
      width: auto;
      object-fit: contain;
    }
    .logo-text {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #111827;
    }
    .header-meta {
      text-align: right;
    }
    .contract-title {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-badge {
      display: inline-block;
      margin-top: 6px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      background-color: ${badgeBg};
      border-radius: 9999px;
      letter-spacing: 0.5px;
    }
    .sub-meta {
      margin-top: 6px;
      font-size: 11px;
      color: #6b7280;
    }
    .parties-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 24px;
      padding: 16px 20px;
      background-color: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
    }
    .party-card h3 {
      font-size: 11px;
      font-weight: 700;
      color: #4b5563;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    .party-name {
      font-size: 14px;
      font-weight: 700;
      color: #111827;
    }
    .party-detail {
      font-size: 12px;
      color: #4b5563;
      margin-top: 2px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #111827;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 24px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-title::after {
      content: "";
      flex: 1;
      height: 1px;
      background-color: #e5e7eb;
    }
    .project-card {
      padding: 16px 20px;
      background-color: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
    }
    .project-name {
      font-size: 15px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 4px;
    }
    .project-meta-row {
      display: flex;
      gap: 24px;
      margin-top: 8px;
      font-size: 12px;
      color: #6b7280;
    }
    .table-container {
      margin-top: 12px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th {
      background-color: #f9fafb;
      padding: 10px 16px;
      font-size: 11px;
      font-weight: 700;
      color: #4b5563;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #e5e7eb;
    }
    td {
      padding: 12px 16px;
      font-size: 12px;
      border-bottom: 1px solid #f3f4f6;
    }
    tr:last-child td {
      border-bottom: none;
    }
    .text-right {
      text-align: right;
    }
    .font-semibold {
      font-weight: 600;
    }
    .font-bold {
      font-weight: 700;
    }
    .terms-box {
      margin-top: 16px;
      padding: 14px 18px;
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      font-size: 11px;
      color: #475569;
      line-height: 1.6;
    }
    .terms-box ul {
      margin-left: 18px;
      margin-top: 6px;
    }
    .terms-box li {
      margin-bottom: 4px;
    }
    .signature-section {
      margin-top: 24px;
      padding: 16px 20px;
      border-radius: 12px;
      border: 1.5px dashed ${isAccepted ? "#10b981" : "#cbd5e1"};
      background-color: ${isAccepted ? "#ecfdf5" : "#f8fafc"};
    }
    .signature-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      color: ${isAccepted ? "#065f46" : "#475569"};
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .signature-content {
      margin-top: 8px;
      font-size: 11px;
      color: ${isAccepted ? "#047857" : "#64748b"};
      line-height: 1.5;
    }
    .footer {
      margin-top: 30px;
      padding-top: 14px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <div class="contract-container">
    <div class="header">
      <div class="logo-container">
        <img class="logo-img" src="data:image/png;base64,${MITFLOWW_LOGO_BASE64}" alt="MitFloww" />
        <span class="logo-text">MitFloww</span>
      </div>
      <div class="header-meta">
        <div class="contract-title">Project Service Agreement</div>
        <div><span class="status-badge">${badgeText}</span></div>
        <div class="sub-meta">Project ID: ${data.projectId.slice(0, 8)} | Date: ${data.date}</div>
      </div>
    </div>

    <div class="parties-grid">
      <div class="party-card">
        <h3>Service Provider (Creator)</h3>
        <div class="party-name">${data.creatorName || "Freelancer"}</div>
        <div class="party-detail">${data.creatorEmail}</div>
      </div>
      <div class="party-card">
        <h3>Client</h3>
        <div class="party-name">${data.clientName || "Valued Client"}</div>
        <div class="party-detail">${data.clientEmail || "Pending Client Confirmation"}</div>
      </div>
    </div>

    <div class="section-title">Project Scope & Deliverables</div>
    <div class="project-card">
      <div class="project-name">${data.projectTitle}</div>
      <div class="project-meta-row">
        <span>Delivery Platform: <strong>MitFloww Escrow & Review</strong></span>
        <span>Contract Version: <strong>Version ${data.version}</strong></span>
      </div>
    </div>

    <div class="section-title">Commercial & Payment Terms</div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Commercial Item</th>
            <th>Details & Structure</th>
            <th class="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="font-semibold">Total Project Value</td>
            <td>Agreed full contract remuneration for project deliverables</td>
            <td class="text-right font-bold">${formattedTotal}</td>
          </tr>
          ${
            data.advancePaymentEnabled
              ? `<tr>
            <td>Advance Commitment</td>
            <td>Initial milestone payment required before final delivery (${advancePct ? `${advancePct}%` : "Agreed Advance"})` +
            `</td>
            <td class="text-right font-semibold">${formattedAdvance}</td>
          </tr>
          <tr>
            <td>Remaining Balance</td>
            <td>Payable upon deliverable approval to release original unwatermarked assets</td>
            <td class="text-right font-bold">${formattedRemaining}</td>
          </tr>`
              : `<tr>
            <td>Payment Schedule</td>
            <td>Full project payment payable upon deliverable approval</td>
            <td class="text-right font-bold">${formattedTotal}</td>
          </tr>`
          }
        </tbody>
      </table>
    </div>

    <div class="section-title">Revisions & Scope Management</div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Revision Parameter</th>
            <th>Agreed Limit</th>
            <th class="text-right">Unit Rate</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="font-semibold">Included Revisions</td>
            <td>${data.revisionLimit > 0 ? `${data.revisionLimit} round(s) of feedback included` : "Flexible standard review"}</td>
            <td class="text-right font-semibold">Included</td>
          </tr>
          <tr>
            <td class="font-semibold">Extra Revision Rate</td>
            <td>Applicable for revision rounds requested beyond the agreed limit</td>
            <td class="text-right font-bold">${data.extraRevisionCostCents > 0 ? formattedExtraRevision : "Free / As Agreed"}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="terms-box">
      <strong>Standard MitFloww Contract Terms & Conditions:</strong>
      <ul>
        <li><strong>Deliverables & License Release:</strong> All delivered creative files and materials remain intellectual property until full payment is finalized. Upon complete payment through MitFloww, full usage rights and licenses are transferred to the Client.</li>
        <li><strong>Feedback & Revisions:</strong> Feedback must be consolidated within the agreed revision rounds. Requests outside the original agreed scope or beyond the revision limit are subject to the extra revision rate specified above.</li>
        <li><strong>Escrow & Dispute Protection:</strong> Advance payments and final payments are held securely in accordance with MitFloww terms to protect both the Creator and Client.</li>
      </ul>
    </div>

    <div class="signature-section">
      <div class="signature-title">
        ${isAccepted ? "&#10003; Legally Binding Digital Acceptance" : "&#9679; Pending Digital Acceptance"}
      </div>
      <div class="signature-content">
        ${
          isAccepted
            ? `This contract was digitally accepted and agreed to by the Client (${data.acceptedBy || data.clientEmail}) on ${data.acceptedAt || data.date} through the MitFloww client portal. This agreement is cryptographically verified and locked as Contract Version ${data.version}.`
            : `This proposed contract has been prepared by ${data.creatorName} and is awaiting client acceptance. Upon checking "I agree to the contract and continue" on the MitFloww portal, this contract becomes active and legally binding.`
        }
      </div>
    </div>

    <div class="footer">
      <span>Generated securely via MitFloww Contract Infrastructure</span>
      <span>Document Identifier: ${data.contractId || data.projectId} | Page 1 of 1</span>
    </div>
  </div>
</body>
</html>`;
}
