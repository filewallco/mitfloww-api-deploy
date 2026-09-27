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

const scopedLogger = createScopedLogger("dashboard");

export const dashboardRouter = Router();

// GET /api/dashboard/summary - Consolidated server-side aggregated summary
dashboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const viewerLocale = getRequestLocale(req);

    const [
      profile,
      projectsResult,
      transactions,
      transactionMetrics,
      reviewsResult,
      storageData,
      creditsData,
      notificationsResult,
      clientMasters,
      assetShares,
    ] = await Promise.all([
      userService.getProfile(actor.id).catch((err) => {
        scopedLogger.warn("Failed to load dashboard profile", { err });
        return null;
      }),
      projectService
        .listProjects(
          {
            userId: actor.id,
            limit: 100,
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
      transactionService.getTransactionMetrics(actor.id).catch((err) => {
        scopedLogger.warn("Failed to load dashboard transaction metrics", { err });
        return null;
      }),
      projectService.getPaidProjectsWithReviews(actor.id).catch((err) => {
        scopedLogger.warn("Failed to load dashboard reviews", { err });
        return [];
      }),
      storageService.getStorageBalance().catch((err) => {
        scopedLogger.warn("Failed to load dashboard storage", { err });
        return null;
      }),
      creditService.getCreditBalance().catch((err) => {
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
      assetService.listUserAssets(actor.id, {}).catch((err) => {
        scopedLogger.warn("Failed to load dashboard assets", { err });
        return [];
      }),
    ]);

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

