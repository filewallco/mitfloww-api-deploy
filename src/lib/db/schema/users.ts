import { sql } from "drizzle-orm";
import { boolean, check, customType, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { CreditPlanKey } from "@/lib/credits";

export const USER_STATUSES = ["active", "suspended", "deactivated"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const UserStatus = {
  Active: USER_STATUSES[0],
  Suspended: USER_STATUSES[1],
  Deactivated: USER_STATUSES[2],
} as const satisfies Record<string, UserStatus>;

export const USER_STATUS_DB_VALUES = [0, 1, 2] as const;
export type UserStatusDbValue = (typeof USER_STATUS_DB_VALUES)[number];
export const UserStatusDb = {
  Active: 0,
  Suspended: 1,
  Deactivated: 2,
} as const;

export function toUserStatusDbValue(status: unknown): UserStatusDbValue {
  if (status === UserStatus.Active || status === 0 || status === "active") return UserStatusDb.Active;
  if (status === UserStatus.Suspended || status === 1 || status === "suspended") return UserStatusDb.Suspended;
  if (status === UserStatus.Deactivated || status === 2 || status === "deactivated") return UserStatusDb.Deactivated;
  return UserStatusDb.Active;
}

export function fromUserStatusDbValue(value: unknown): UserStatus {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case UserStatusDb.Active:
      return UserStatus.Active;
    case UserStatusDb.Suspended:
      return UserStatus.Suspended;
    case UserStatusDb.Deactivated:
      return UserStatus.Deactivated;
    default:
      return UserStatus.Active;
  }
}

const userStatus = customType<{
  data: UserStatus;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toUserStatusDbValue(value);
  },
  fromDriver(value) {
    return fromUserStatusDbValue(value);
  },
});

const DEFAULT_USER_STATUS =
  toUserStatusDbValue(UserStatus.Active) as unknown as UserStatus;

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
    emailVerified: boolean("email_verified").notNull().default(false),
    phoneVerified: boolean("phone_verified").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
    onboardingStep: integer("onboarding_step").notNull().default(0),
    status: userStatus("status").notNull().default(DEFAULT_USER_STATUS),
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
  }, (table) => [
    check("users_status_check", sql`${table.status} >= 0 AND ${table.status} <= 2`),
  ]);

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

  const creatorWorkProfiles = schema.table("creator_work_profiles", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    primaryProfession: varchar("primary_profession", { length: 100 }).notNull(),
    customProfession: varchar("custom_profession", { length: 255 }),
    yearsOfExperience: varchar("years_of_experience", { length: 50 }).notNull(),
    companyAddress: text("company_address"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  });

  return { users, companies, creatorWorkProfiles };
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

export type CreatorWorkProfileRecord = InferSelectModel<
  ReturnType<typeof createUserTables>["creatorWorkProfiles"]
>;

export type NewCreatorWorkProfileRecord = InferInsertModel<
  ReturnType<typeof createUserTables>["creatorWorkProfiles"]
>;
