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
  revisionComments,
  revisionCommentReplies,
  storageAccounts,
  storageAccountMutations,
} from "@/lib/db/schema";
import { createScopedLogger } from "@/lib/logger";

const scopedLogger = createScopedLogger("cron-unread-notifications");
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

cronRouter.get("/process-unread-notifications", asyncHandler(async (_req, res) => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const appUrl = (process.env.APP_URL || "https://mitfloww.com").replace(/\/$/, "");

  let creatorDigestsSent = 0;
  let clientDigestsSent = 0;

  // 1. Creator Unread Comment Digest:
  // Find projects where client left comments or replies > 1 day ago that haven't been viewed by creator
  const clientComments = await db
    .select({
      projectId: revisionComments.projectId,
      projectTitle: projects.title,
      fileId: revisionComments.fileId,
      fileName: files.name,
      commentBody: revisionComments.body,
      commentCreatedAt: revisionComments.createdAt,
      creatorEmail: users.email,
      creatorDisplayName: users.displayName,
      creatorFirstName: users.firstName,
      creatorLastViewed: projects.creatorLastViewedCommentsAt,
      creatorDigestSentAt: projects.creatorDigestEmailSentAt,
    })
    .from(revisionComments)
    .innerJoin(projects, eq(revisionComments.projectId, projects.id))
    .innerJoin(files, eq(revisionComments.fileId, files.id))
    .leftJoin(users, eq(projects.userId, users.id))
    .where(
      and(
        eq(revisionComments.createdBy, "client"),
        isNull(revisionComments.deletedAt),
        lte(revisionComments.createdAt, oneDayAgo),
        sql`(${projects.creatorLastViewedCommentsAt} IS NULL OR ${revisionComments.createdAt} > ${projects.creatorLastViewedCommentsAt})`,
        sql`(${projects.creatorDigestEmailSentAt} IS NULL OR ${projects.creatorDigestEmailSentAt} < ${revisionComments.createdAt})`,
      ),
    );

  const clientReplies = await db
    .select({
      projectId: revisionComments.projectId,
      projectTitle: projects.title,
      fileId: revisionComments.fileId,
      fileName: files.name,
      commentBody: revisionCommentReplies.body,
      commentCreatedAt: revisionCommentReplies.createdAt,
      creatorEmail: users.email,
      creatorDisplayName: users.displayName,
      creatorFirstName: users.firstName,
      creatorLastViewed: projects.creatorLastViewedCommentsAt,
      creatorDigestSentAt: projects.creatorDigestEmailSentAt,
    })
    .from(revisionCommentReplies)
    .innerJoin(revisionComments, eq(revisionCommentReplies.commentId, revisionComments.id))
    .innerJoin(projects, eq(revisionComments.projectId, projects.id))
    .innerJoin(files, eq(revisionComments.fileId, files.id))
    .leftJoin(users, eq(projects.userId, users.id))
    .where(
      and(
        eq(revisionCommentReplies.createdBy, "client"),
        isNull(revisionCommentReplies.deletedAt),
        lte(revisionCommentReplies.createdAt, oneDayAgo),
        sql`(${projects.creatorLastViewedCommentsAt} IS NULL OR ${revisionCommentReplies.createdAt} > ${projects.creatorLastViewedCommentsAt})`,
        sql`(${projects.creatorDigestEmailSentAt} IS NULL OR ${projects.creatorDigestEmailSentAt} < ${revisionCommentReplies.createdAt})`,
      ),
    );

  // Group by project for Creator:
  const creatorProjectsMap = new Map<string, {
    projectId: string;
    projectTitle: string;
    creatorEmail: string;
    creatorName: string;
    items: { fileName: string; body: string; createdAt: Date }[];
  }>();

  for (const item of [...clientComments, ...clientReplies]) {
    if (!item.creatorEmail) continue;
    if (!creatorProjectsMap.has(item.projectId)) {
      creatorProjectsMap.set(item.projectId, {
        projectId: item.projectId,
        projectTitle: item.projectTitle,
        creatorEmail: item.creatorEmail,
        creatorName: item.creatorDisplayName?.trim() || item.creatorFirstName?.trim() || "Creator",
        items: [],
      });
    }
    creatorProjectsMap.get(item.projectId)!.items.push({
      fileName: item.fileName,
      body: item.commentBody,
      createdAt: item.commentCreatedAt,
    });
  }

  for (const [projectId, data] of creatorProjectsMap.entries()) {
    try {
      const latestItem = data.items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      await emailService.sendUnreadCommentDigestEmail({
        recipientEmail: data.creatorEmail,
        recipientName: data.creatorName,
        projectTitle: data.projectTitle,
        unreadCount: data.items.length,
        destinationUrl: `${appUrl}/`,
        recipientRole: "creator",
        fileName: latestItem?.fileName,
        latestCommentSnippet: latestItem?.body,
      });

      await db
        .update(projects)
        .set({ creatorDigestEmailSentAt: new Date() })
        .where(eq(projects.id, projectId));

      creatorDigestsSent++;
      scopedLogger.info("Sent unread comments digest email to creator", {
        projectId,
        recipientEmail: data.creatorEmail,
        unreadCount: data.items.length,
      });
    } catch (err: any) {
      scopedLogger.error("Failed to send creator comment digest email", {
        error: err?.message || String(err),
        projectId,
      });
    }
  }

  // 2. Client Unread Comment Digest:
  // Find projects where creator left comments or replies > 1 day ago that haven't been viewed by client
  const creatorComments = await db
    .select({
      projectId: revisionComments.projectId,
      projectTitle: projects.title,
      shareToken: projects.shareToken,
      shareClientEmail: projects.shareClientEmail,
      clientEmail: projects.clientEmail,
      clientName: projects.clientName,
      fileId: revisionComments.fileId,
      fileName: files.name,
      commentBody: revisionComments.body,
      commentCreatedAt: revisionComments.createdAt,
    })
    .from(revisionComments)
    .innerJoin(projects, eq(revisionComments.projectId, projects.id))
    .innerJoin(files, eq(revisionComments.fileId, files.id))
    .where(
      and(
        sql`${revisionComments.createdBy} != 'client'`,
        isNull(revisionComments.deletedAt),
        lte(revisionComments.createdAt, oneDayAgo),
        sql`(${projects.clientLastViewedCommentsAt} IS NULL OR ${revisionComments.createdAt} > ${projects.clientLastViewedCommentsAt})`,
        sql`(${projects.clientDigestEmailSentAt} IS NULL OR ${projects.clientDigestEmailSentAt} < ${revisionComments.createdAt})`,
      ),
    );

  const creatorReplies = await db
    .select({
      projectId: revisionComments.projectId,
      projectTitle: projects.title,
      shareToken: projects.shareToken,
      shareClientEmail: projects.shareClientEmail,
      clientEmail: projects.clientEmail,
      clientName: projects.clientName,
      fileId: revisionComments.fileId,
      fileName: files.name,
      commentBody: revisionCommentReplies.body,
      commentCreatedAt: revisionCommentReplies.createdAt,
    })
    .from(revisionCommentReplies)
    .innerJoin(revisionComments, eq(revisionCommentReplies.commentId, revisionComments.id))
    .innerJoin(projects, eq(revisionComments.projectId, projects.id))
    .innerJoin(files, eq(revisionComments.fileId, files.id))
    .where(
      and(
        sql`${revisionCommentReplies.createdBy} != 'client'`,
        isNull(revisionCommentReplies.deletedAt),
        lte(revisionCommentReplies.createdAt, oneDayAgo),
        sql`(${projects.clientLastViewedCommentsAt} IS NULL OR ${revisionCommentReplies.createdAt} > ${projects.clientLastViewedCommentsAt})`,
        sql`(${projects.clientDigestEmailSentAt} IS NULL OR ${projects.clientDigestEmailSentAt} < ${revisionCommentReplies.createdAt})`,
      ),
    );

  // Group by project for Client:
  const clientProjectsMap = new Map<string, {
    projectId: string;
    projectTitle: string;
    shareToken: string | null;
    clientEmail: string;
    clientName?: string;
    items: { fileId: string; fileName: string; body: string; createdAt: Date }[];
  }>();

  for (const item of [...creatorComments, ...creatorReplies]) {
    const recipientEmail = item.shareClientEmail || item.clientEmail;
    if (!recipientEmail) continue;
    if (!clientProjectsMap.has(item.projectId)) {
      clientProjectsMap.set(item.projectId, {
        projectId: item.projectId,
        projectTitle: item.projectTitle,
        shareToken: item.shareToken,
        clientEmail: recipientEmail,
        clientName: item.clientName?.trim() || undefined,
        items: [],
      });
    }
    clientProjectsMap.get(item.projectId)!.items.push({
      fileId: item.fileId,
      fileName: item.fileName,
      body: item.commentBody,
      createdAt: item.commentCreatedAt,
    });
  }

  for (const [projectId, data] of clientProjectsMap.entries()) {
    try {
      const latestItem = data.items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      const destinationUrl = data.shareToken && latestItem?.fileId
        ? `${appUrl}/s/${data.shareToken}/files/${latestItem.fileId}`
        : `${appUrl}/`;

      await emailService.sendUnreadCommentDigestEmail({
        recipientEmail: data.clientEmail,
        recipientName: data.clientName,
        projectTitle: data.projectTitle,
        unreadCount: data.items.length,
        destinationUrl,
        recipientRole: "client",
        fileName: latestItem?.fileName,
        latestCommentSnippet: latestItem?.body,
      });

      await db
        .update(projects)
        .set({ clientDigestEmailSentAt: new Date() })
        .where(eq(projects.id, projectId));

      clientDigestsSent++;
      scopedLogger.info("Sent unread comments digest email to client", {
        projectId,
        recipientEmail: data.clientEmail,
        unreadCount: data.items.length,
      });
    } catch (err: any) {
      scopedLogger.error("Failed to send client comment digest email", {
        error: err?.message || String(err),
        projectId,
      });
    }
  }

  return res.json({
    success: true,
    creatorDigestsSent,
    clientDigestsSent,
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
