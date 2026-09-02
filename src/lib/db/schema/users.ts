import { integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

import type { CreditPlanKey } from "@/lib/credits";

export function createUserTables(schema: ReturnType<typeof import("drizzle-orm/pg-core").pgSchema>) {
  const users = schema.table("users", {
    id: varchar("id", { length: 255 }).primaryKey(),
    email: varchar("email", { length: 255 }),
    displayName: varchar("display_name", { length: 255 }),
    avatarUrl: varchar("avatar_url", { length: 255 }),
    planKey: varchar("plan_key", { length: 50 })
      .$type<CreditPlanKey>()
      .notNull()
      .default("free"),
    clientShareLinkExpiryDays: integer("client_share_link_expiry_days")
      .notNull()
      .default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  });

  return { users };
}

export type UserRecord = import("drizzle-orm").InferSelectModel<
  ReturnType<typeof createUserTables>["users"]
>;

export type NewUserRecord = import("drizzle-orm").InferInsertModel<
  ReturnType<typeof createUserTables>["users"]
>;
