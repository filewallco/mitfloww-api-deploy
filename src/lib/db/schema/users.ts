import { boolean, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { CreditPlanKey } from "@/lib/credits";

export function createUserTables(schema: ReturnType<typeof import("drizzle-orm/pg-core").pgSchema>) {
  const users = schema.table("users", {
    id: varchar("id", { length: 255 }).primaryKey(),
    username: varchar("username", { length: 100 }),
    passwordHash: varchar("password_hash", { length: 255 }),
    email: varchar("email", { length: 255 }),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    displayName: varchar("display_name", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    countryCode: varchar("country_code", { length: 10 }),
    city: varchar("city", { length: 100 }),
    state: varchar("state", { length: 100 }),
    postcode: varchar("postcode", { length: 20 }),
    country: varchar("country", { length: 100 }),
    roleTitle: varchar("role_title", { length: 150 }),
    bio: text("bio"),
    avatarUrl: varchar("avatar_url", { length: 1024 }),
    avatarStorageKey: varchar("avatar_storage_key", { length: 1024 }),
    isVerified: boolean("is_verified").notNull().default(true),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    planKey: varchar("plan_key", { length: 50 })
      .$type<CreditPlanKey>()
      .notNull()
      .default("free"),
    clientShareLinkExpiryDays: integer("client_share_link_expiry_days")
      .notNull()
      .default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  });

  const companies = schema.table("companies", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 150 }).notNull().default("DilCo Design Company"),
    tagline: varchar("tagline", { length: 255 }),
    industry: varchar("industry", { length: 100 }),
    website: varchar("website", { length: 255 }),
    email: varchar("email", { length: 255 }),
    logoUrl: varchar("logo_url", { length: 1024 }),
    logoStorageKey: varchar("logo_storage_key", { length: 1024 }),
    yearFounded: varchar("year_founded", { length: 10 }),
    companySize: varchar("company_size", { length: 50 }),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  });

  return { users, companies };
}

export type UserRecord = InferSelectModel<
  ReturnType<typeof createUserTables>["users"]
>;

export type NewUserRecord = InferInsertModel<
  ReturnType<typeof createUserTables>["users"]
>;

export type CompanyRecord = InferSelectModel<
  ReturnType<typeof createUserTables>["companies"]
>;

export type NewCompanyRecord = InferInsertModel<
  ReturnType<typeof createUserTables>["companies"]
>;
