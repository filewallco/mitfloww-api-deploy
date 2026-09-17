import { db } from "@/lib/db/client";
import { projects, transactions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import type { TransactionRecord } from "@/lib/db/schema";
import { ensureProjectInvoiceNumber } from "./invoice-service";
import { DrizzleFileRepository } from "@/lib/repositories/file-repository";
import { ProjectPaymentStatus } from "@/lib/dto/projects";

export class TransactionService {
  async listUserTransactions(userId: string): Promise<TransactionRecord[]> {
    return await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.paidAt));
  }

  async getTransactionMetrics(userId: string) {
    const userTransactions = await this.listUserTransactions(userId);
    const totalNetEarningsCents = userTransactions.reduce(
      (sum, t) => sum + (t.paymentStatus === "paid" ? t.netAmountCents : 0),
      0
    );
    const totalGrossPaidCents = userTransactions.reduce(
      (sum, t) => sum + (t.paymentStatus === "paid" ? t.amountCents : 0),
      0
    );
    const totalCommissionCents = userTransactions.reduce(
      (sum, t) => sum + (t.paymentStatus === "paid" ? t.commissionCents : 0),
      0
    );
    const pendingPayoutsCents = userTransactions.reduce(
      (sum, t) => sum + (t.paymentStatus === "pending" ? t.netAmountCents : 0),
      0
    );
    const count = userTransactions.length;
    const avgProjectValueCents = count > 0 ? Math.round(totalGrossPaidCents / count) : 0;

    return {
      totalNetEarningsCents,
      totalGrossPaidCents,
      totalCommissionCents,
      pendingPayoutsCents,
      avgProjectValueCents,
      transactionsCount: count,
    };
  }

  async recordAdvanceTransaction(projectId: string): Promise<TransactionRecord | null> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project || !project.advancePaymentEnabled) return null;

    const baseInvoiceNumber = await ensureProjectInvoiceNumber(projectId);
    const invoiceNumber = `ADV-${baseInvoiceNumber}`;
    const amountCents = Number(project.advanceAmountCents) || 0;
    const commissionCents = Math.round(amountCents * 0.1);
    const netAmountCents = Math.max(0, amountCents - commissionCents);
    const clientEmail = project.clientEmail || project.shareClientEmail || null;
    const paidAt = project.advancePaymentCompletedAt ?? new Date();
    const isPaid = project.advancePaymentStatus === ProjectPaymentStatus.Paid;

    const [record] = await db
      .insert(transactions)
      .values({
        userId: project.userId,
        projectId: project.id,
        projectName: `${project.title || "Project"} (Advance)`,
        clientName: project.clientName || "Valued Client",
        clientEmail,
        invoiceNumber,
        amountCents,
        commissionCents,
        netAmountCents,
        currency: project.currency || "INR",
        paymentStatus: isPaid ? "paid" : "pending",
        paymentType: "advance",
        paymentMethod: "Online",
        paidAt,
      })
      .onConflictDoUpdate({
        target: transactions.invoiceNumber,
        set: {
          projectName: `${project.title || "Project"} (Advance)`,
          clientName: project.clientName || "Valued Client",
          clientEmail,
          amountCents,
          commissionCents,
          netAmountCents,
          currency: project.currency || "INR",
          paymentStatus: isPaid ? "paid" : "pending",
          updatedAt: new Date(),
        },
      })
      .returning();

    return record;
  }

  async recordProjectTransaction(projectId: string): Promise<TransactionRecord | null> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) return null;

    const invoiceNumber = await ensureProjectInvoiceNumber(projectId);

    // Calculate revisions
    const fileRepo = new DrizzleFileRepository();
    let totalRevisions = 0;
    try {
      totalRevisions = await fileRepo.countProjectAddedRevisions(project.id);
    } catch {}

    const revisionLimit = project.revisionLimit ?? 0;
    const extraRevisionCount = Math.max(0, totalRevisions - revisionLimit);
    const extraRevisionCostCents = project.extraRevisionCostCents ?? 0;
    const extraRevisionAmountCents = extraRevisionCount * extraRevisionCostCents;
    const baseAmountCents = Number(project.amountCents) || 0;
    const totalAmountCents = baseAmountCents + extraRevisionAmountCents;

    const hasPaidAdvance = project.advancePaymentEnabled &&
      project.advancePaymentStatus === ProjectPaymentStatus.Paid &&
      Number(project.advanceAmountCents) > 0;
    const advanceAmountCents = hasPaidAdvance ? Number(project.advanceAmountCents) : 0;
    const remainingAmountCents = Math.max(0, totalAmountCents - advanceAmountCents);
    const finalAmountCents = hasPaidAdvance ? remainingAmountCents : totalAmountCents;
    const paymentType = hasPaidAdvance ? "remaining" : "full";

    const commissionCents = Math.round(finalAmountCents * 0.1); // 10% platform fee
    const netAmountCents = Math.max(0, finalAmountCents - commissionCents);

    const clientEmail = project.clientEmail || project.shareClientEmail || null;
    const paidAt = project.clientPaymentCompletedAt ?? new Date();
    const isPaid = project.paymentStatus === ProjectPaymentStatus.Paid;
    const currency = project.currency || "INR";

    const [record] = await db
      .insert(transactions)
      .values({
        userId: project.userId,
        projectId: project.id,
        projectName: project.title || "Project Deliverables",
        clientName: project.clientName || "Valued Client",
        clientEmail,
        invoiceNumber,
        amountCents: finalAmountCents,
        commissionCents,
        netAmountCents,
        currency,
        paymentStatus: isPaid ? "paid" : "pending",
        paymentType,
        paymentMethod: "Online",
        paidAt,
      })
      .onConflictDoUpdate({
        target: transactions.invoiceNumber,
        set: {
          projectName: project.title || "Project Deliverables",
          clientName: project.clientName || "Valued Client",
          clientEmail,
          amountCents: finalAmountCents,
          commissionCents,
          netAmountCents,
          currency,
          paymentStatus: isPaid ? "paid" : "pending",
          paymentType,
          updatedAt: new Date(),
        },
      })
      .returning();

    return record;
  }
}

export const transactionService = new TransactionService();
