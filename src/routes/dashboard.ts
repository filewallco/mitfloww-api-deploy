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
        console.warn("Dashboard profile error:", err);
        return null;
      }),
      projectService
        .listProjects(
          { userId: actor.id, limit: 100, order: "desc", sort: "updatedAt" },
          viewerLocale
        )
        .catch((err) => {
          console.warn("Dashboard projects error:", err);
          return { items: [] };
        }),
      transactionService.listUserTransactions(actor.id).catch((err) => {
        console.warn("Dashboard transactions error:", err);
        return [];
      }),
      transactionService.getTransactionMetrics(actor.id).catch((err) => {
        console.warn("Dashboard transaction metrics error:", err);
        return null;
      }),
      projectService.getPaidProjectsWithReviews(actor.id).catch((err) => {
        console.warn("Dashboard reviews error:", err);
        return [];
      }),
      storageService.getStorageBalance().catch((err) => {
        console.warn("Dashboard storage error:", err);
        return null;
      }),
      creditService.getCreditBalance().catch((err) => {
        console.warn("Dashboard credits error:", err);
        return null;
      }),
      notificationService
        .listNotifications({ limit: 20 }, viewerLocale, actor.id)
        .catch((err) => {
          console.warn("Dashboard notifications error:", err);
          return { items: [] };
        }),
      clientService.listClientMasters(actor.id).catch((err) => {
        console.warn("Dashboard client masters error:", err);
        return [];
      }),
      assetService.listUserAssets(actor.id, {}).catch((err) => {
        console.warn("Dashboard assets error:", err);
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

