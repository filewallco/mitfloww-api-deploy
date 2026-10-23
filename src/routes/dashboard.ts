import { createScopedLogger } from "@/lib/logger";
import { Router } from "express";
import { getRequestLocale } from "@/middleware/locale";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { asyncHandler, sendSuccess } from "@/lib/api/route";
import { userService } from "@/lib/services/user-service";
import { projectService } from "@/lib/services/project-service";
import { transactionService } from "@/lib/services/transaction-service";
import { storageService } from "@/lib/services/storage-service";
import { creditService } from "@/lib/services/credit-service";
import { notificationService } from "@/lib/services/notification-service";
import { clientService } from "@/lib/services/client-service";
import { assetService } from "@/lib/services/asset-service";
import { TransactionPaymentStatus } from "@/lib/db/schema";

const scopedLogger = createScopedLogger("dashboard");

export const dashboardRouter = Router();

// GET /api/dashboard/summary - Consolidated server-side aggregated summary
dashboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const viewerLocale = getRequestLocale(req);
    const personalBillingScope = {
      actorUserId: actor.id,
      scopeId: actor.id,
      scopeType: "personal" as const,
    };

    const [
      profile,
      projectsResult,
      transactions,
      reviewsResult,
      storageData,
      creditsData,
      notificationsResult,
      clientMasters,
      assetSharesResult,
    ] = await Promise.all([
      userService.getProfile(actor.id).catch((err) => {
        scopedLogger.warn("Failed to load dashboard profile", { err });
        return null;
      }),
      projectService
        .listProjects(
          {
            userId: actor.id,
            limit: 25,
            page: 1,
            includeTotal: false,
            order: "desc",
            sort: "updatedAt",
          },
          viewerLocale
        )
        .catch((err) => {
          scopedLogger.warn("Failed to load dashboard projects", { err });
          return { items: [] };
        }),
      transactionService.listUserTransactions(actor.id).catch((err) => {
        scopedLogger.warn("Failed to load dashboard transactions", { err });
        return [];
      }),
      projectService.getPaidProjectsWithReviews(actor.id).catch((err) => {
        scopedLogger.warn("Failed to load dashboard reviews", { err });
        return [];
      }),
      storageService.getStorageBalance(personalBillingScope).catch((err) => {
        scopedLogger.warn("Failed to load dashboard storage", { err });
        return null;
      }),
      creditService.getCreditBalance(personalBillingScope).catch((err) => {
        scopedLogger.warn("Failed to load dashboard credits", { err });
        return null;
      }),
      notificationService
        .listNotifications(
          { limit: 20, page: 1, includeTotal: false },
          viewerLocale,
          actor.id
        )
        .catch((err) => {
          scopedLogger.warn("Failed to load dashboard notifications", { err });
          return { items: [] };
        }),
      clientService.listClientMasters(actor.id).catch((err) => {
        scopedLogger.warn("Failed to load dashboard client masters", { err });
        return [];
      }),
      assetService.listUserAssets(actor.id, { limit: 20 }).catch((err) => {
        scopedLogger.warn("Failed to load dashboard assets", { err });
        return [];
      }),
    ]);

    const userTransactions = transactions || [];
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

    const transactionMetrics = {
      totalNetEarningsCents,
      totalGrossPaidCents,
      totalCommissionCents,
      pendingPayoutsCents,
      avgProjectValueCents,
      transactionsCount: count,
    };

    const reviews = reviewsResult.map(({ project, review }) => ({
      clientEmail: project.clientEmail,
      clientName: project.clientName,
      createdAt: project.createdAt.toISOString(),
      id: project.id,
      projectReviewId: review.id,
      rating: review.rating,
      reviewText: review.reviewText,
      sourceLocale: review.sourceLocale,
      submittedAt: review.submittedAt.toISOString(),
      title: project.title,
    }));

    const assetShares = Array.isArray(assetSharesResult)
      ? assetSharesResult
      : (assetSharesResult as any)?.items || [];

    return sendSuccess(res, {
      profile,
      projects: projectsResult.items,
      transactions,
      transactionMetrics,
      reviews,
      storageData,
      creditsData,
      notifications: notificationsResult.items,
      clientMasters,
      assetShares,
    });
  })
);
