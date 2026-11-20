import { boolean, pgTable, text, timestamp, uuid, varchar, type PgSchema } from "drizzle-orm/pg-core";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { createUserTables } from "./users";

export function createBankDetailsTables(
  schema: PgSchema,
  deps: {
    users: ReturnType<typeof createUserTables>["users"];
  },
) {
  const userBankDetails = schema.table("user_bank_details", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .unique()
      .references(() => deps.users.id, { onDelete: "cascade" }),
    paymentType: varchar("payment_type", { length: 20 }).notNull().default("bank"),
    accountHolderName: varchar("account_holder_name", { length: 150 }),
    bankName: varchar("bank_name", { length: 150 }),
    accountNumberCiphertext: text("account_number_ciphertext"),
    accountNumberLast4: varchar("account_number_last4", { length: 8 }),
    routingCodeCiphertext: text("routing_code_ciphertext"),
    routingCodeLast4: varchar("routing_code_last4", { length: 8 }),
    accountType: varchar("account_type", { length: 50 }).notNull().default("savings"),
    country: varchar("country", { length: 100 }),
    currency: varchar("currency", { length: 10 }),
    upiId: varchar("upi_id", { length: 100 }),
    bankBranchAddress: text("bank_branch_address"),
    verificationStatus: varchar("verification_status", { length: 20 }).notNull().default("pending"),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  });

  return { userBankDetails };
}

export type UserBankDetailsRecord = InferSelectModel<
  ReturnType<typeof createBankDetailsTables>["userBankDetails"]
>;

export type NewUserBankDetailsRecord = InferInsertModel<
  ReturnType<typeof createBankDetailsTables>["userBankDetails"]
>;
