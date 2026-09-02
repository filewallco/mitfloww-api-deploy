import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type PgSchema,
} from "drizzle-orm/pg-core";

import {
  TESTIMONIAL_TEMPLATE_ACCESS_LEVELS,
  TESTIMONIAL_TEMPLATE_SCOPES,
  TESTIMONIAL_STATUSES,
  type TestimonialCanvasPresetId,
  type TestimonialTemplateAccessLevel,
  type TestimonialTemplateScope,
  type TestimonialStatus,
} from "@/types/testimonials";
import type { createProjectTables } from "./projects";

function buildSqlStringList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(","));
}

export const createTestimonialTables = (
  fw: PgSchema,
  tables: {
    projectClientReviews: ReturnType<typeof createProjectTables>["projectClientReviews"];
    projects: ReturnType<typeof createProjectTables>["projects"];
  },
) => {
  const testimonialTemplates = fw.table(
    "testimonial_templates",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      ownerId: varchar("owner_id", { length: 255 }).notNull().default("system"),
      templateKey: varchar("template_key", { length: 120 }).notNull(),
      scope: varchar("scope", { length: 32 })
        .$type<TestimonialTemplateScope>()
        .notNull()
        .default(TESTIMONIAL_TEMPLATE_SCOPES[0]),
      accessLevel: varchar("access_level", { length: 32 })
        .$type<TestimonialTemplateAccessLevel>()
        .notNull()
        .default(TESTIMONIAL_TEMPLATE_ACCESS_LEVELS[0]),
      name: varchar("name", { length: 120 }).notNull(),
      category: varchar("category", { length: 80 }).notNull(),
      presetId: varchar("preset_id", { length: 24 })
        .$type<TestimonialCanvasPresetId>()
        .notNull(),
      description: text("description").notNull(),
      canvasJson: jsonb("canvas_json").notNull(),
      isDefault: boolean("is_default").notNull().default(false),
      deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("testimonial_templates_template_key_unique_idx").on(
        table.templateKey,
      ),
      index("testimonial_templates_scope_idx").on(table.scope),
      index("testimonial_templates_owner_id_idx").on(table.ownerId),
      index("testimonial_templates_access_level_idx").on(table.accessLevel),
      index("testimonial_templates_updated_at_idx").on(table.updatedAt),
      check(
        "testimonial_templates_scope_check",
        sql`${table.scope} IN (${buildSqlStringList(TESTIMONIAL_TEMPLATE_SCOPES)})`,
      ),
      check(
        "testimonial_templates_access_level_check",
        sql`${table.accessLevel} IN (${buildSqlStringList(TESTIMONIAL_TEMPLATE_ACCESS_LEVELS)})`,
      ),
    ],
  );

  const testimonials = fw.table(
    "testimonials",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      userId: varchar("user_id", { length: 255 }).notNull(),
      title: varchar("title", { length: 120 }).notNull(),
      titleSourceLocale: varchar("title_source_locale", { length: 16 })
        .notNull()
        .default("und"),
      slug: varchar("slug", { length: 160 }).notNull(),
      status: varchar("status", { length: 32 })
        .$type<TestimonialStatus>()
        .notNull()
        .default(TESTIMONIAL_STATUSES[0]),
      templateId: uuid("template_id").references(() => testimonialTemplates.id, {
        onDelete: "set null",
        onUpdate: "cascade",
      }),
      templateKey: varchar("template_key", { length: 120 }).notNull(),
      templateScope: varchar("template_scope", { length: 32 })
        .$type<TestimonialTemplateScope>()
        .notNull()
        .default(TESTIMONIAL_TEMPLATE_SCOPES[0]),
      presetId: varchar("preset_id", { length: 24 })
        .$type<TestimonialCanvasPresetId>()
        .notNull(),
      canvasJson: jsonb("canvas_json").notNull(),
      bindingSourceJson: jsonb("binding_source_json"),
      projectId: uuid("project_id").references(() => tables.projects.id, {
        onDelete: "set null",
        onUpdate: "cascade",
      }),
      projectReviewId: uuid("project_review_id").references(
        () => tables.projectClientReviews.id,
        {
          onDelete: "set null",
          onUpdate: "cascade",
        },
      ),
      previewDataUrl: text("preview_data_url"),
      publishedAt: timestamp("published_at", {
        mode: "date",
        withTimezone: true,
      }),
      lastSavedAt: timestamp("last_saved_at", {
        mode: "date",
        withTimezone: true,
      })
        .notNull()
        .defaultNow(),
      deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("testimonials_user_slug_unique_idx").on(
        table.userId,
        table.slug,
      ),
      uniqueIndex("testimonials_user_title_unique_idx").on(
        table.userId,
        table.title,
      ),
      index("testimonials_user_updated_at_idx").on(table.userId, table.updatedAt),
      index("testimonials_project_id_idx").on(table.projectId),
      index("testimonials_template_id_idx").on(table.templateId),
      index("testimonials_status_idx").on(table.status),
      index("testimonials_deleted_at_idx").on(table.deletedAt),
      check(
        "testimonials_status_check",
        sql`${table.status} IN (${buildSqlStringList(TESTIMONIAL_STATUSES)})`,
      ),
      check(
        "testimonials_template_scope_check",
        sql`${table.templateScope} IN (${buildSqlStringList(TESTIMONIAL_TEMPLATE_SCOPES)})`,
      ),
    ],
  );

  const testimonialRevisions = fw.table(
    "testimonial_revisions",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      testimonialId: uuid("testimonial_id")
        .notNull()
        .references(() => testimonials.id, {
          onDelete: "cascade",
          onUpdate: "cascade",
        }),
      revisionNumber: integer("revision_number").notNull(),
      title: varchar("title", { length: 120 }).notNull(),
      reason: varchar("reason", { length: 32 }).notNull(),
      snapshotJson: jsonb("snapshot_json").notNull(),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("testimonial_revisions_testimonial_revision_unique_idx").on(
        table.testimonialId,
        table.revisionNumber,
      ),
      index("testimonial_revisions_testimonial_id_idx").on(table.testimonialId),
      index("testimonial_revisions_created_at_idx").on(table.createdAt),
      check(
        "testimonial_revisions_reason_check",
        sql`${table.reason} IN ('autosave','manual','duplicate','publish','template-change')`,
      ),
      check(
        "testimonial_revisions_revision_number_check",
        sql`${table.revisionNumber} >= 1`,
      ),
    ],
  );

  return {
    testimonialRevisions,
    testimonialTemplates,
    testimonials,
  };
};

export type TestimonialTemplateRecord = InferSelectModel<
  ReturnType<typeof createTestimonialTables>["testimonialTemplates"]
>;

export type NewTestimonialTemplateRecord = InferInsertModel<
  ReturnType<typeof createTestimonialTables>["testimonialTemplates"]
>;

export type TestimonialRecord = InferSelectModel<
  ReturnType<typeof createTestimonialTables>["testimonials"]
>;

export type NewTestimonialRecord = InferInsertModel<
  ReturnType<typeof createTestimonialTables>["testimonials"]
>;

export type TestimonialRevisionRecord = InferSelectModel<
  ReturnType<typeof createTestimonialTables>["testimonialRevisions"]
>;

export type NewTestimonialRevisionRecord = InferInsertModel<
  ReturnType<typeof createTestimonialTables>["testimonialRevisions"]
>;

