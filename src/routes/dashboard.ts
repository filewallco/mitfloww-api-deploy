import { z } from "zod";
import { dashboardPresetService } from "@/lib/services/dashboard-preset-service";
import { ValidationAppError } from "@/lib/errors/app-error";
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

const activePresetSchema = z.object({
  activePresetKey: z.string().min(1),
  activePresetId: z.string().uuid().nullable().optional(),
});

const createPresetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  items: z
    .array(
      z.object({
        widgetKey: z.string(),
        position: z.number().int().nonnegative(),
        isVisible: z.boolean(),
      })
    )
    .optional(),
});

const updateLayoutSchema = z.object({
  items: z.array(
    z.object({
      widgetKey: z.string(),
      position: z.number().int().nonnegative(),
      isVisible: z.boolean(),
    })
  ),
});

// GET /api/dashboard/presets - Get all presets and user active selection
dashboardRouter.get(
  "/presets",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const result = await dashboardPresetService.getUserPresets(actor.id);
    return sendSuccess(res, result);
  })
);

// PATCH /api/dashboard/presets/active - Set active preset
dashboardRouter.patch(
  "/presets/active",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const parsed = activePresetSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationAppError("Invalid active preset payload.", {
        errors: parsed.error.issues,
      });
    }
    const result = await dashboardPresetService.setActivePreset(actor.id, parsed.data);
    return sendSuccess(res, result);
  })
);

// POST /api/dashboard/presets - Create custom preset
dashboardRouter.post(
  "/presets",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const parsed = createPresetSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationAppError("Invalid preset creation payload.", {
        errors: parsed.error.issues,
      });
    }
    const result = await dashboardPresetService.createCustomPreset(actor.id, parsed.data as any);
    return sendSuccess(res, result, { status: 201 });
  })
);

// PATCH /api/dashboard/presets/:id - Save preset layout items (transactional)
dashboardRouter.patch(
  "/presets/:id",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const parsed = updateLayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationAppError("Invalid layout update payload.", {
        errors: parsed.error.issues,
      });
    }
    const result = await dashboardPresetService.savePresetLayout(
      actor.id,
      String(req.params.id),
      parsed.data.items as any
    );
    return sendSuccess(res, result);
  })
);

// DELETE /api/dashboard/presets/:id - Delete custom preset
dashboardRouter.delete(
  "/presets/:id",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const result = await dashboardPresetService.deleteCustomPreset(actor.id, String(req.params.id));
    return sendSuccess(res, result);
  })
);

// POST /api/dashboard/presets/:presetKey/reset - Reset built-in preset to defaults
dashboardRouter.post(
  "/presets/:presetKey/reset",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const key = String(req.params.presetKey) as any;
    const result = await dashboardPresetService.resetBuiltInPreset(actor.id, key);
    return sendSuccess(res, { presetKey: key, items: result });
  })
);
