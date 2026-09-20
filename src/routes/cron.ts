import { DELETED_RESOURCE_RETENTION_DAYS } from "@/config/retention";
import { assetShares } from "@/lib/db/schema";
import { r2Storage } from "@/lib/storage/r2";
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

cronRouter.get("/reconcile-stale-jobs", asyncHandler(async (_req, res) => {
  const result = await fileService.reconcileStaleProcessingVersions();
  return res.json({
    success: true,
    ...result,
  });
}));

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
      const [claimed] = await tx
        .update(storageAccountMutations)
        .set({ isExpired: true })
        .where(
          and(
            eq(storageAccountMutations.id, mut.id),
            eq(storageAccountMutations.isExpired, false),
          ),
        )
        .returning({ id: storageAccountMutations.id });

      if (!claimed) {
        return;
      }

      await tx
        .update(storageAccounts)
        .set({
          storageLimitBytes: sql`greatest(${storageAccounts.storageLimitBytes} - ${mut.bytesDelta}, 0)`,
        })
        .where(eq(storageAccounts.id, mut.accountId));
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

cronRouter.get("/cleanup-deleted-resources", asyncHandler(async (_req, res) => {
  const retentionDays = DELETED_RESOURCE_RETENTION_DAYS;
  const expiryThreshold = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // 1. Purge R2 files for soft-deleted projects older than retention threshold
  const expiredProjects = await db
    .select({ id: projects.id, userId: projects.userId })
    .from(projects)
    .where(
      and(
        isNotNull(projects.deletedAt),
        lte(projects.deletedAt, expiryThreshold)
      )
    );

  let cleanedProjectsCount = 0;
  for (const proj of expiredProjects) {
    try {
      const filePrefix = `users/${proj.userId}/projects/${proj.id}/`;
      const r2Files = await r2Storage.listFiles({ prefix: filePrefix });
      for (const item of r2Files.objects) {
        await r2Storage.deleteFile({ key: item.key });
      }
      cleanedProjectsCount++;
    } catch (err) {
      console.error(`Failed to clean R2 files for expired project ${proj.id}:`, err);
    }
  }

  // 2. Purge R2 files for soft-deleted asset shares older than retention threshold
  const expiredAssetShares = await db
    .select({ id: assetShares.id, userId: assetShares.userId })
    .from(assetShares)
    .where(
      and(
        isNotNull(assetShares.deletedAt),
        lte(assetShares.deletedAt, expiryThreshold)
      )
    );

  let cleanedAssetSharesCount = 0;
  for (const asset of expiredAssetShares) {
    try {
      const assetPrefix = `users/${asset.userId}/asset-shares/${asset.id}/`;
      const r2Files = await r2Storage.listFiles({ prefix: assetPrefix });
      for (const item of r2Files.objects) {
        await r2Storage.deleteFile({ key: item.key });
      }
      cleanedAssetSharesCount++;
    } catch (err) {
      console.error(`Failed to clean R2 files for expired asset share ${asset.id}:`, err);
    }
  }

  return res.json({
    success: true,
    retentionDays,
    cleanedProjects: cleanedProjectsCount,
    cleanedAssetShares: cleanedAssetSharesCount,
  });
}));
