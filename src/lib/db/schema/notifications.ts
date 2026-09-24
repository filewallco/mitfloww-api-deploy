import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { check, customType, index, jsonb, type PgSchema, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import type { createFileTables } from "@/lib/db/schema/files";
import type { createProjectTables } from "@/lib/db/schema/projects";

export const APP_NOTIFICATION_CATEGORIES = [
  "system",
  "file_processing_failed",
  "file_processing_succeeded",
] as const;

export type AppNotificationCategory = (typeof APP_NOTIFICATION_CATEGORIES)[number];
export const AppNotificationCategory = {
  System: APP_NOTIFICATION_CATEGORIES[0],
  FileProcessingFailed: APP_NOTIFICATION_CATEGORIES[1],
  FileProcessingSucceeded: APP_NOTIFICATION_CATEGORIES[2],
} as const satisfies Record<string, AppNotificationCategory>;

export const APP_NOTIFICATION_CATEGORY_DB_VALUES = [0, 1, 2] as const;
export type AppNotificationCategoryDbValue = (typeof APP_NOTIFICATION_CATEGORY_DB_VALUES)[number];
export const AppNotificationCategoryDb = {
  System: 0,
  FileProcessingFailed: 1,
  FileProcessingSucceeded: 2,
} as const;

export function toAppNotificationCategoryDbValue(cat: unknown): AppNotificationCategoryDbValue {
  if (cat === AppNotificationCategory.System || cat === 0 || cat === "system") return AppNotificationCategoryDb.System;
  if (cat === AppNotificationCategory.FileProcessingFailed || cat === 1 || cat === "file_processing_failed") return AppNotificationCategoryDb.FileProcessingFailed;
  if (cat === AppNotificationCategory.FileProcessingSucceeded || cat === 2 || cat === "file_processing_succeeded") return AppNotificationCategoryDb.FileProcessingSucceeded;
  return AppNotificationCategoryDb.System;
}

export function fromAppNotificationCategoryDbValue(value: unknown): AppNotificationCategory {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case AppNotificationCategoryDb.System:
      return AppNotificationCategory.System;
    case AppNotificationCategoryDb.FileProcessingFailed:
      return AppNotificationCategory.FileProcessingFailed;
    case AppNotificationCategoryDb.FileProcessingSucceeded:
      return AppNotificationCategory.FileProcessingSucceeded;
    default:
      return AppNotificationCategory.System;
  }
}

const notificationCategory = customType<{
  data: AppNotificationCategory;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toAppNotificationCategoryDbValue(value);
  },
  fromDriver(value) {
    return fromAppNotificationCategoryDbValue(value);
  },
});

const DEFAULT_NOTIFICATION_CATEGORY =
  toAppNotificationCategoryDbValue(AppNotificationCategory.System) as unknown as AppNotificationCategory;

export type NotificationMetadata = Record<
  string,
  boolean | number | string | null
>;

export const createNotificationTables = (
  fw: PgSchema,
  tables: {
    files: ReturnType<typeof createFileTables>["files"];
    projects: ReturnType<typeof createProjectTables>["projects"];
  },
) => {
  const notifications = fw.table(
    "notifications",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      title: varchar("title", { length: 160 }),
      titleKey: varchar("title_key", { length: 160 }),
      description: text("description"),
      descriptionKey: varchar("description_key", { length: 160 }),
      category: notificationCategory("category")
        .notNull()
        .default(DEFAULT_NOTIFICATION_CATEGORY),
      projectId: uuid("project_id").references(
        () => tables.projects.id,
        { onDelete: "set null" },
      ),
      fileId: uuid("file_id").references(() => tables.files.id, {
        onDelete: "set null",
      }),
      eventKey: varchar("event_key", { length: 255 }).unique(),
      metadata: jsonb("metadata")
        .$type<NotificationMetadata>()
        .notNull()
        .default({}),
      readAt: timestamp("read_at", { mode: "date", withTimezone: true }),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      index("notifications_created_at_idx").on(table.createdAt),
      index("notifications_read_at_created_at_idx").on(
        table.readAt,
        table.createdAt,
      ),
      index("notifications_project_id_idx").on(table.projectId),
      index("notifications_file_id_idx").on(table.fileId),
      index("notifications_category_idx").on(table.category),
      check("notifications_category_check", sql`${table.category} >= 0 AND ${table.category} <= 2`),
    ],
  );

  return { notifications };
};

export type NotificationRecord = InferSelectModel<
  ReturnType<typeof createNotificationTables>["notifications"]
>;

export type NewNotificationRecord = InferInsertModel<
  ReturnType<typeof createNotificationTables>["notifications"]
>;
