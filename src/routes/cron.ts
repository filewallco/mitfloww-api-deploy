import { emailService } from "@/lib/email/email-service";
import { users } from "@/lib/db/schema";
import { DELETED_RESOURCE_RETENTION_DAYS } from "@/config/retention";
import { assets } from "@/lib/db/schema";
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
  return res.json({
    success: true,
    message: "Automated R2 final draft deletions are disabled pending dedicated external background scheduler.",
    processedFinalDrafts: 0,
    errors: 0,
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

  // 4. Process Plan/Storage Expirations Email Alerts (3 days before expiration)
  const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const expiringStorage = await db
    .select({
      id: storageAccountMutations.id,
      expiresAt: storageAccountMutations.expiresAt,
      scopeId: storageAccountMutations.scopeId,
      actorUserId: storageAccountMutations.actorUserId,
    })
    .from(storageAccountMutations)
    .where(
      and(
        eq(storageAccountMutations.isExpired, false),
        isNotNull(storageAccountMutations.expiresAt),
        lte(storageAccountMutations.expiresAt, threeDaysFromNow),
      ),
    );

  const notifiedUserIds = new Set<string>();
  const appUrl = process.env.APP_URL || "https://mitfloww.com";

  for (const mut of expiringStorage) {
    const userId = mut.actorUserId || mut.scopeId;
    if (!userId || notifiedUserIds.has(userId) || !mut.expiresAt) continue;
    notifiedUserIds.add(userId);

    const [user] = await db
      .select({ email: users.email, displayName: users.displayName, firstName: users.firstName, planKey: users.planKey })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user?.email) {
      const daysRemaining = Math.max(1, Math.ceil((mut.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
      const expiryDateFormatted = mut.expiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      emailService.sendPlanExpiringEmail({
        userEmail: user.email,
        userName: user.displayName || user.firstName || undefined,
        planName: user.planKey ? user.planKey.toUpperCase() : "Storage",
        expiryDateFormatted,
        daysRemaining,
        renewUrl: `${appUrl}/settings`,
      }).catch(() => {});
    }
  }

  return res.json({
    success: true,
    processedStorage: expiredStorage.length,
    processedCredits: expiredCredits.length,
    refreshedAccounts: refreshCount,
    expiringAlertsSent: notifiedUserIds.size,
  });
}));

cronRouter.get("/cleanup-deleted-resources", asyncHandler(async (_req, res) => {
  return res.json({
    success: true,
    message: "Automated R2 resource deletions are disabled pending dedicated external background scheduler.",
    retentionDays: DELETED_RESOURCE_RETENTION_DAYS,
    cleanedProjects: 0,
    cleanedAssets: 0,
  });
}));
