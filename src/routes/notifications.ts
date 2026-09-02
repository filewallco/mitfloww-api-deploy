import { Router } from "express";
import { getRequestLocale } from "@/middleware/locale";
import { notificationService } from "@/lib/services/notification-service";
import {
  notificationListQueryParamsSchema,
  notificationIdParamsSchema,
  markNotificationReadSchema,
} from "@/lib/validation/notifications";
import { sendSuccess, parseWithSchema, asyncHandler } from "@/lib/api/route";

export const notificationsRouter = Router();

notificationsRouter.get("/", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const query = parseWithSchema(
    notificationListQueryParamsSchema,
    req.query,
  );
  const result = await notificationService.listNotifications(
    query,
    viewerLocale,
  );

  return sendSuccess(res, result.items, {
    meta: {
      count: result.items.length,
      filters: {
        unreadOnly: query.unreadOnly ?? null,
      },
      pagination: result.pagination,
      unreadCount: result.unreadCount,
    },
  });
}));

notificationsRouter.post("/mark-all-read", asyncHandler(async (_req, res) => {
  const data = await notificationService.markAllNotificationsRead();
  return sendSuccess(res, data);
}));

notificationsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(notificationIdParamsSchema, req.params);
  parseWithSchema(markNotificationReadSchema, req.body);
  const data = await notificationService.markNotificationRead(
    params.id,
    viewerLocale,
  );

  return sendSuccess(res, data);
}));
