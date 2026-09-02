CREATE TABLE "mitfloww"."project_client_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"review_text" text NOT NULL,
	"source_locale" varchar(16) DEFAULT 'und' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_client_reviews_rating_check" CHECK ("mitfloww"."project_client_reviews"."rating" >= 1 AND "mitfloww"."project_client_reviews"."rating" <= 5)
);
--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ADD COLUMN "client_payment_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mitfloww"."projects" ADD COLUMN "client_payment_reference" varchar(64);--> statement-breakpoint
ALTER TABLE "mitfloww"."project_client_reviews" ADD CONSTRAINT "project_client_reviews_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "mitfloww"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "project_client_reviews_project_id_unique_idx" ON "mitfloww"."project_client_reviews" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_client_reviews_submitted_at_idx" ON "mitfloww"."project_client_reviews" USING btree ("submitted_at");