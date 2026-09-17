import { timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Common audit columns present across all database tables.
 * Every record tracks who created it, when it was created,
 * who last modified it, and when it was last modified.
 */
export const auditColumns = {
  createdBy: varchar("created_by", { length: 255 }),
  createdOn: timestamp("created_on", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  modifiedBy: varchar("modified_by", { length: 255 }),
  modifiedOn: timestamp("modified_on", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
};

/**
 * Common TypeScript interface representing audit metadata on every record.
 */
export interface BaseAuditEntity {
  createdBy?: string | null;
  createdOn: Date;
  modifiedBy?: string | null;
  modifiedOn: Date;
}
