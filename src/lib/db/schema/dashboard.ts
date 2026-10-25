import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

export function createDashboardTables(
  schema: ReturnType<typeof import("drizzle-orm/pg-core").pgSchema>,
  tables: { users: any }
) {
  const dashboardPresets = schema.table(
    "dashboard_presets",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      userId: varchar("user_id", { length: 255 })
        .notNull()
        .references(() => tables.users.id, { onDelete: "cascade" }),
      name: varchar("name", { length: 100 }).notNull(),
      presetKey: varchar("preset_key", { length: 64 }),
      isSystem: boolean("is_system").notNull().default(false),
      version: integer("version").notNull().default(1),
      createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      unique("dashboard_presets_user_name_unique").on(table.userId, table.name),
      unique("dashboard_presets_user_preset_key_unique").on(table.userId, table.presetKey),
      index("dashboard_presets_user_id_idx").on(table.userId),
    ]
  );

  const dashboardPresetItems = schema.table(
    "dashboard_preset_items",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      presetId: uuid("preset_id")
        .notNull()
        .references(() => dashboardPresets.id, { onDelete: "cascade" }),
      widgetKey: varchar("widget_key", { length: 64 }).notNull(),
      position: integer("position").notNull().default(0),
      isVisible: boolean("is_visible").notNull().default(true),
      createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      unique("dashboard_preset_items_preset_widget_unique").on(table.presetId, table.widgetKey),
      unique("dashboard_preset_items_preset_position_unique").on(table.presetId, table.position),
      index("dashboard_preset_items_preset_id_idx").on(table.presetId),
      index("dashboard_preset_items_preset_position_idx").on(table.presetId, table.position),
      check("dashboard_preset_items_position_non_negative", sql`${table.position} >= 0`),
    ]
  );

  const dashboardUserState = schema.table(
    "dashboard_user_state",
    {
      userId: varchar("user_id", { length: 255 })
        .primaryKey()
        .references(() => tables.users.id, { onDelete: "cascade" }),
      activePresetKey: varchar("active_preset_key", { length: 64 })
        .notNull()
        .default("all"),
      activePresetId: uuid("active_preset_id")
        .references(() => dashboardPresets.id, { onDelete: "set null" }),
      version: integer("version").notNull().default(1),
      updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      index("dashboard_user_state_user_id_idx").on(table.userId),
    ]
  );

  return {
    dashboardPresets,
    dashboardPresetItems,
    dashboardUserState,
  };
}

export type DashboardPresetRecord = InferSelectModel<
  ReturnType<typeof createDashboardTables>["dashboardPresets"]
>;
export type NewDashboardPresetRecord = InferInsertModel<
  ReturnType<typeof createDashboardTables>["dashboardPresets"]
>;

export type DashboardPresetItemRecord = InferSelectModel<
  ReturnType<typeof createDashboardTables>["dashboardPresetItems"]
>;
export type NewDashboardPresetItemRecord = InferInsertModel<
  ReturnType<typeof createDashboardTables>["dashboardPresetItems"]
>;

export type DashboardUserStateRecord = InferSelectModel<
  ReturnType<typeof createDashboardTables>["dashboardUserState"]
>;
export type NewDashboardUserStateRecord = InferInsertModel<
  ReturnType<typeof createDashboardTables>["dashboardUserState"]
>;
