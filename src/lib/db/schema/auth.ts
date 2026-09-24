import { sql } from "drizzle-orm";
import { boolean, check, customType, index, integer, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { createUserTables } from "./users";

export const OTP_PURPOSES = ["SIGNUP_VERIFICATION", "LOGIN", "PASSWORD_RESET"] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];
export const OtpPurpose = {
  SignupVerification: OTP_PURPOSES[0],
  Login: OTP_PURPOSES[1],
  PasswordReset: OTP_PURPOSES[2],
} as const satisfies Record<string, OtpPurpose>;

export const OTP_PURPOSE_DB_VALUES = [0, 1, 2] as const;
export type OtpPurposeDbValue = (typeof OTP_PURPOSE_DB_VALUES)[number];
export const OtpPurposeDb = {
  SignupVerification: 0,
  Login: 1,
  PasswordReset: 2,
} as const;

export function toOtpPurposeDbValue(purpose: unknown): OtpPurposeDbValue {
  if (purpose === OtpPurpose.SignupVerification || purpose === 0 || purpose === "SIGNUP_VERIFICATION") return OtpPurposeDb.SignupVerification;
  if (purpose === OtpPurpose.Login || purpose === 1 || purpose === "LOGIN") return OtpPurposeDb.Login;
  if (purpose === OtpPurpose.PasswordReset || purpose === 2 || purpose === "PASSWORD_RESET") return OtpPurposeDb.PasswordReset;
  return OtpPurposeDb.SignupVerification;
}

export function fromOtpPurposeDbValue(value: unknown): OtpPurpose {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case OtpPurposeDb.SignupVerification:
      return OtpPurpose.SignupVerification;
    case OtpPurposeDb.Login:
      return OtpPurpose.Login;
    case OtpPurposeDb.PasswordReset:
      return OtpPurpose.PasswordReset;
    default:
      return OtpPurpose.SignupVerification;
  }
}

const otpPurpose = customType<{
  data: OtpPurpose;
  driverData: number;
  notNull: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toOtpPurposeDbValue(value);
  },
  fromDriver(value) {
    return fromOtpPurposeDbValue(value);
  },
});

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
      purpose: otpPurpose("purpose").notNull(),
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
      check("otp_challenges_purpose_check", sql`${table.purpose} >= 0 AND ${table.purpose} <= 2`),
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
