import { sql } from "drizzle-orm";
import {
  index,
  type PgSchema,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { createUserTables } from "./users";

export function createClientTables(
  fw: PgSchema,
  deps: { users: ReturnType<typeof createUserTables>["users"] },
) {
  const clientMasters = fw.table(
    "client_masters",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      userId: varchar("user_id", { length: 255 })
        .notNull()
        .references(() => deps.users.id, { onDelete: "cascade" }),
      clientName: varchar("client_name", { length: 60 }).notNull(),
      companyEmail: varchar("company_email", { length: 255 }),
      createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      index("client_masters_user_id_idx").on(table.userId),
      uniqueIndex("client_masters_user_client_name_unique_idx").on(
        table.userId,
        sql`lower(${table.clientName})`,
      ),
    ],
  );

  return { clientMasters };
}

export type ClientMasterRecord = InferSelectModel<
  ReturnType<typeof createClientTables>["clientMasters"]
>;
export type NewClientMasterRecord = InferInsertModel<
  ReturnType<typeof createClientTables>["clientMasters"]
>;
