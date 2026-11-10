import { db } from "@/lib/db/client";
import { projects, transactions, TransactionPaymentStatus } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import type { TransactionRecord } from "@/lib/db/schema";
import { ensureProjectInvoiceNumber } from "./invoice-service";
import { DrizzleFileRepository } from "@/lib/repositories/file-repository";
import { ProjectPaymentStatus } from "@/lib/dto/projects";

export class TransactionService {
  async listUserTransactions(userId: string): Promise<TransactionRecord[]> {
    return await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.paymentStatus, TransactionPaymentStatus.Paid)
        )
      )
      .orderBy(desc(transactions.paidAt));
  }

  async getTransactionMetrics(userId: string) {
    const userTransactions = await this.listUserTransactions(userId);
    const totalNetEarningsCents = userTransactions.reduce(
      (sum, t) => sum + (t.paymentStatus === TransactionPaymentStatus.Paid ? t.netAmountCents : 0),
      0
    );
    const totalGrossPaidCents = userTransactions.reduce(
      (sum, t) => sum + (t.paymentStatus === TransactionPaymentStatus.Paid ? t.amountCents : 0),
      0
    );
    const totalCommissionCents = userTransactions.reduce(
      (sum, t) => sum + (t.paymentStatus === TransactionPaymentStatus.Paid ? t.commissionCents : 0),
      0
    );
    const pendingPayoutsCents = userTransactions.reduce(
      (sum, t) => sum + (t.paymentStatus === TransactionPaymentStatus.Pending ? t.netAmountCents : 0),
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

  async recordAdvanceTransaction(projectId: string, tx?: any): Promise<TransactionRecord | null> {
    const executor = tx || db;
    const [project] = await executor
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project || !project.advancePaymentEnabled) return null;

    const isPaid = project.advancePaymentStatus === ProjectPaymentStatus.Paid;
    if (!isPaid) {
      return null;
    }

    const baseInvoiceNumber = await ensureProjectInvoiceNumber(projectId);
    const invoiceNumber = `ADV-${baseInvoiceNumber}`;
    const amountCents = Number(project.advanceAmountCents) || 0;
    const commissionCents = Math.round(amountCents * 0.1);
    const netAmountCents = Math.max(0, amountCents - commissionCents);
    const clientEmail = project.clientEmail || project.shareClientEmail || null;
    const paidAt = project.advancePaymentCompletedAt ?? new Date();

    const [record] = await executor
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
        paymentStatus: "paid",
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
          paymentStatus: "paid",
          updatedAt: new Date(),
        },
      })
      .returning();

    return record;
  }

  async recordProjectTransaction(projectId: string, tx?: any): Promise<TransactionRecord | null> {
    const executor = tx || db;
    const [project] = await executor
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) return null;

    const isPaid = project.paymentStatus === ProjectPaymentStatus.Paid;
    if (!isPaid) {
      return null;
    }

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
    const currency = project.currency || "INR";

    const [record] = await executor
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
        paymentStatus: "paid",
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
          paymentStatus: "paid",
          paymentType,
          updatedAt: new Date(),
        },
      })
      .returning();

    return record;
  }
}

export const transactionService = new TransactionService();
