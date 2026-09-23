import { boolean, index, integer, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { createUserTables } from "./users";

export type OtpPurpose = "SIGNUP_VERIFICATION" | "LOGIN" | "PASSWORD_RESET";

export function createAuthTables(
  schema: ReturnType<typeof import("drizzle-orm/pg-core").pgSchema>,
  refs: {
    users: ReturnType<typeof createUserTables>["users"];
  },
) {
  const authIdentities = schema.table(
    "auth_identities",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      userId: varchar("user_id", { length: 255 })
        .notNull()
        .references(() => refs.users.id, { onDelete: "cascade" }),
      provider: varchar("provider", { length: 32 }).notNull(), // 'google', 'apple', etc.
      providerUserId: varchar("provider_user_id", { length: 255 }).notNull(), // e.g. Google 'sub'
      email: varchar("email", { length: 255 }),
      emailVerified: boolean("email_verified").notNull().default(true),
      createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("auth_identities_provider_uid_idx").on(table.provider, table.providerUserId),
      index("auth_identities_user_id_idx").on(table.userId),
    ],
  );

  const sessions = schema.table(
    "sessions",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      userId: varchar("user_id", { length: 255 })
        .notNull()
        .references(() => refs.users.id, { onDelete: "cascade" }),
      refreshTokenHash: varchar("refresh_token_hash", { length: 255 }).notNull(),
      userAgent: text("user_agent"),
      ipAddress: varchar("ip_address", { length: 45 }),
      expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
      revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
      lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" })
        .notNull()
        .defaultNow(),
      createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      index("sessions_user_id_idx").on(table.userId),
      index("sessions_refresh_token_hash_idx").on(table.refreshTokenHash),
    ],
  );

  const otpChallenges = schema.table(
    "otp_challenges",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      email: varchar("email", { length: 255 }).notNull(),
      purpose: varchar("purpose", { length: 32 }).notNull().$type<OtpPurpose>(),
      otpHashed: varchar("otp_hashed", { length: 255 }).notNull(),
      attemptsCount: integer("attempts_count").notNull().default(0),
      maxAttempts: integer("max_attempts").notNull().default(5),
      expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
      consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
      createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      index("otp_challenges_email_purpose_idx").on(table.email, table.purpose),
      index("otp_challenges_created_at_idx").on(table.createdAt),
    ],
  );

  return { authIdentities, sessions, otpChallenges };
}

export type AuthIdentityRecord = InferSelectModel<
  ReturnType<typeof createAuthTables>["authIdentities"]
>;
export type NewAuthIdentityRecord = InferInsertModel<
  ReturnType<typeof createAuthTables>["authIdentities"]
>;

export type SessionRecord = InferSelectModel<
  ReturnType<typeof createAuthTables>["sessions"]
>;
export type NewSessionRecord = InferInsertModel<
  ReturnType<typeof createAuthTables>["sessions"]
>;

export type OtpChallengeRecord = InferSelectModel<
  ReturnType<typeof createAuthTables>["otpChallenges"]
>;
export type NewOtpChallengeRecord = InferInsertModel<
  ReturnType<typeof createAuthTables>["otpChallenges"]
>;
