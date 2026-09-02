import { uuid, text, timestamp, PgSchema } from "drizzle-orm/pg-core";

export const createHealthTables = (fw: PgSchema) => ({
    healthChecks: fw.table("health_checks", {
        id: uuid("id").defaultRandom().primaryKey(),
        message: text("message"),
        createdAt: timestamp("created_at").defaultNow(),
    })
});