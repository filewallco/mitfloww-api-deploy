import { Router } from "express";
import { db } from "@/lib/db/client";
import {
  creditAccounts,
  creditLedgerEntries,
  files,
  fileVersions,
  projects,
  storageAccounts,
  storageAccountMutations,
} from "@/lib/db/schema";
import { and, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { fileService } from "@/lib/services/file-service";
import { PROJECT_FILE_DELETION_LOCK_HOURS } from "@/config/projects";
import { asyncHandler } from "@/lib/api/route";

export const cronRouter = Router();

cronRouter.get("/cleanup-final-drafts", asyncHandler(async (_req, res) => {
  const lockHours = PROJECT_FILE_DELETION_LOCK_HOURS;
  const expiryThreshold = new Date(Date.now() - lockHours * 60 * 60 * 1000);

  const expiredFinalDrafts = await db
    .select({
      versionId: fileVersions.id,
      fileId: files.id,
      projectId: files.projectId,
    })
    .from(fileVersions)
    .innerJoin(files, eq(files.id, fileVersions.fileId))
    .innerJoin(projects, eq(projects.id, files.projectId))
    .where(
      and(
        eq(fileVersions.isFinalDraft, true),
        isNotNull(fileVersions.finalDraftDownloadedAt),
        isNotNull(projects.clientPaymentCompletedAt),
        lte(projects.clientPaymentCompletedAt, expiryThreshold),
        isNull(fileVersions.deletedAt),
      ),
    );

  let processedCount = 0;
  let errorCount = 0;

  for (const draft of expiredFinalDrafts) {
    try {
      await fileService.deleteFileVersion({
        deletedBy: "system",
        fileId: draft.fileId,
        projectId: draft.projectId,
        versionId: draft.versionId,
      });
      processedCount++;
    } catch (err) {
      console.error(`Failed to delete expired final draft version ${draft.versionId}:`, err);
      errorCount++;
    }
  }

  return res.json({
    success: true,
    processedFinalDrafts: processedCount,
    errors: errorCount,
  });
}));

cronRouter.get("/process-expirations", asyncHandler(async (_req, res) => {
  // 1. Process Storage Add-On Expirations
  const expiredStorage = await db
    .select()
    .from(storageAccountMutations)
    .where(
      and(
        eq(storageAccountMutations.isExpired, false),
        lte(storageAccountMutations.expiresAt, new Date()),
      ),
    );

  for (const mut of expiredStorage) {
    await db.transaction(async (tx) => {
      await tx
        .update(storageAccounts)
        .set({
          storageLimitBytes: sql`${storageAccounts.storageLimitBytes} - ${mut.bytesDelta}`,
        })
        .where(eq(storageAccounts.id, mut.accountId));

      await tx
        .update(storageAccountMutations)
        .set({ isExpired: true })
        .where(eq(storageAccountMutations.id, mut.id));
    });
  }

  // 2. Process Purchased Credit Expirations
  const expiredCredits = await db
    .select()
    .from(creditLedgerEntries)
    .where(
      and(
        eq(creditLedgerEntries.isExpired, false),
        lte(creditLedgerEntries.expiresAt, new Date()),
      ),
    );

  for (const cred of expiredCredits) {
    await db.transaction(async (tx) => {
      if (cred.remainingCredits && cred.remainingCredits > 0) {
        await tx
          .update(creditAccounts)
          .set({
            availableCredits: sql`${creditAccounts.availableCredits} - ${cred.remainingCredits}`,
            availablePurchasedCredits: sql`${creditAccounts.availablePurchasedCredits} - ${cred.remainingCredits}`,
          })
          .where(eq(creditAccounts.id, cred.accountId));
      }

      await tx
        .update(creditLedgerEntries)
        .set({ isExpired: true, remainingCredits: 0 })
        .where(eq(creditLedgerEntries.id, cred.id));
    });
  }

  // 3. Process Monthly Credit Refresh
  const today = new Date();
  const allAccounts = await db.select().from(creditAccounts);

  let refreshCount = 0;
  for (const account of allAccounts) {
    const createdAt = new Date(account.createdAt);
    if (createdAt.getDate() === today.getDate()) {
      await db
        .update(creditAccounts)
        .set({
          availableCredits: sql`${creditAccounts.currentMonthlyCredits} + ${creditAccounts.availablePurchasedCredits}`,
          currentUsedCredits: 0,
          updatedAt: today,
        })
        .where(eq(creditAccounts.id, account.id));
      refreshCount++;
    }
  }

  return res.json({
    success: true,
    processedStorage: expiredStorage.length,
    processedCredits: expiredCredits.length,
    refreshedAccounts: refreshCount,
  });
}));
