import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, jsonb, type PgSchema, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import type { createFileTables } from "@/lib/db/schema/files";
import type { createProjectTables } from "@/lib/db/schema/projects";

export type AppNotificationCategory =
  | "file_processing_failed"
  | "file_processing_succeeded"
  | "system";

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
      category: varchar("category", { length: 40 })
        .$type<AppNotificationCategory>()
        .notNull()
        .default("system"),
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
