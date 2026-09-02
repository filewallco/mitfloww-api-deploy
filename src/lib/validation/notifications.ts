import { z } from "zod";
import {
  DEFAULT_PAGE,
  MAX_PAGE_SIZE,
} from "@/lib/query/pagination";

export const notificationIdParamsSchema = z
  .object({
    id: z.string().uuid("Notification id must be a valid UUID."),
  })
  .strict();

function emptyStringToUndefined(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export const notificationListQueryParamsSchema = z
  .object({
    includeTotal: z.preprocess((value) => {
      const normalizedValue = value === undefined ? "true" : value;

      if (typeof normalizedValue === "boolean") {
        return normalizedValue ? "true" : "false";
      }

      return normalizedValue;
    }, z.enum(["true", "false"], {
      errorMap: () => ({ message: "includeTotal must be true or false." }),
    }).default("true").transform((value) => value === "true")),
    limit: z.preprocess(
      (value) => (value === undefined ? 12 : value),
      z.coerce
        .number({
          invalid_type_error: "limit must be a number.",
        })
        .int("limit must be an integer.")
        .min(1, "limit must be at least 1.")
        .max(MAX_PAGE_SIZE, `limit must be at most ${MAX_PAGE_SIZE}.`),
    ),
    page: z.preprocess(
      (value) => (value === undefined ? DEFAULT_PAGE : value),
      z.coerce
        .number({
          invalid_type_error: "page must be a number.",
        })
        .int("page must be an integer.")
        .min(1, "page must be at least 1."),
    ),
    unreadOnly: z.preprocess((value) => {
      const normalizedValue = emptyStringToUndefined(value);

      if (typeof normalizedValue === "boolean") {
        return normalizedValue ? "true" : "false";
      }

      return normalizedValue;
    }, z.enum(["true", "false"], {
      errorMap: () => ({ message: "unreadOnly must be true or false." }),
    }).transform((value) => value === "true").optional()),
  })
  .strict();

export const markNotificationReadSchema = z
  .object({
    read: z.literal(true, {
      errorMap: () => ({
        message: "Only read=true is supported.",
      }),
    }),
  })
  .strict();

export type NotificationIdParams = z.infer<typeof notificationIdParamsSchema>;
export type NotificationListQueryParams = z.infer<
  typeof notificationListQueryParamsSchema
>;
