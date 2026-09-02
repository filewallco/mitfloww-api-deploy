CREATE TABLE "mitfloww"."testimonial_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"testimonial_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"title" varchar(120) NOT NULL,
	"reason" varchar(32) NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "testimonial_revisions_reason_check" CHECK ("mitfloww"."testimonial_revisions"."reason" IN ('autosave','manual','duplicate','publish','template-change')),
	CONSTRAINT "testimonial_revisions_revision_number_check" CHECK ("mitfloww"."testimonial_revisions"."revision_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "mitfloww"."testimonial_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" varchar(255) DEFAULT 'system' NOT NULL,
	"template_key" varchar(120) NOT NULL,
	"scope" varchar(32) DEFAULT 'system' NOT NULL,
	"access_level" varchar(32) DEFAULT 'free' NOT NULL,
	"name" varchar(120) NOT NULL,
	"category" varchar(80) NOT NULL,
	"preset_id" varchar(24) NOT NULL,
	"description" text NOT NULL,
	"canvas_json" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "testimonial_templates_scope_check" CHECK ("mitfloww"."testimonial_templates"."scope" IN ('system','user')),
	CONSTRAINT "testimonial_templates_access_level_check" CHECK ("mitfloww"."testimonial_templates"."access_level" IN ('free','premium'))
);
--> statement-breakpoint
CREATE TABLE "mitfloww"."testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"title" varchar(120) NOT NULL,
	"title_source_locale" varchar(16) DEFAULT 'und' NOT NULL,
	"slug" varchar(160) NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"template_id" uuid,
	"template_key" varchar(120) NOT NULL,
	"template_scope" varchar(32) DEFAULT 'system' NOT NULL,
	"preset_id" varchar(24) NOT NULL,
	"canvas_json" jsonb NOT NULL,
	"binding_source_json" jsonb,
	"project_id" uuid,
	"project_review_id" uuid,
	"preview_data_url" text,
	"published_at" timestamp with time zone,
	"last_saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "testimonials_status_check" CHECK ("mitfloww"."testimonials"."status" IN ('draft','saved','published','archived')),
	CONSTRAINT "testimonials_template_scope_check" CHECK ("mitfloww"."testimonials"."template_scope" IN ('system','user'))
);
--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ADD COLUMN "advance_payment_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ADD COLUMN "advance_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ADD COLUMN "advance_payment_status" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."testimonial_revisions" ADD CONSTRAINT "testimonial_revisions_testimonial_id_testimonials_id_fk" FOREIGN KEY ("testimonial_id") REFERENCES "mitfloww"."testimonials"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mitfloww"."testimonials" ADD CONSTRAINT "testimonials_template_id_testimonial_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "mitfloww"."testimonial_templates"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mitfloww"."testimonials" ADD CONSTRAINT "testimonials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "mitfloww"."projects"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mitfloww"."testimonials" ADD CONSTRAINT "testimonials_project_review_id_project_client_reviews_id_fk" FOREIGN KEY ("project_review_id") REFERENCES "mitfloww"."project_client_reviews"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "testimonial_revisions_testimonial_revision_unique_idx" ON "mitfloww"."testimonial_revisions" USING btree ("testimonial_id","revision_number");--> statement-breakpoint
CREATE INDEX "testimonial_revisions_testimonial_id_idx" ON "mitfloww"."testimonial_revisions" USING btree ("testimonial_id");--> statement-breakpoint
CREATE INDEX "testimonial_revisions_created_at_idx" ON "mitfloww"."testimonial_revisions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "testimonial_templates_template_key_unique_idx" ON "mitfloww"."testimonial_templates" USING btree ("template_key");--> statement-breakpoint
CREATE INDEX "testimonial_templates_scope_idx" ON "mitfloww"."testimonial_templates" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "testimonial_templates_owner_id_idx" ON "mitfloww"."testimonial_templates" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "testimonial_templates_access_level_idx" ON "mitfloww"."testimonial_templates" USING btree ("access_level");--> statement-breakpoint
CREATE INDEX "testimonial_templates_updated_at_idx" ON "mitfloww"."testimonial_templates" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "testimonials_user_slug_unique_idx" ON "mitfloww"."testimonials" USING btree ("user_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "testimonials_user_title_unique_idx" ON "mitfloww"."testimonials" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "testimonials_user_updated_at_idx" ON "mitfloww"."testimonials" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "testimonials_project_id_idx" ON "mitfloww"."testimonials" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "testimonials_template_id_idx" ON "mitfloww"."testimonials" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "testimonials_status_idx" ON "mitfloww"."testimonials" USING btree ("status");--> statement-breakpoint
CREATE INDEX "testimonials_deleted_at_idx" ON "mitfloww"."testimonials" USING btree ("deleted_at");--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ADD CONSTRAINT "projects_advance_amount_cents_check" CHECK ("mitfloww"."projects"."advance_amount_cents" >= 0);--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ADD CONSTRAINT "projects_advance_payment_status_check" CHECK ("mitfloww"."projects"."advance_payment_status" >= 0 AND "mitfloww"."projects"."advance_payment_status" <= 1);