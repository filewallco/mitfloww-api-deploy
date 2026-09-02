CREATE TABLE "mitfloww"."users" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email" varchar(255),
	"display_name" varchar(255),
	"avatar_url" varchar(255),
	"plan_key" varchar(50) DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_accounts" DROP CONSTRAINT "credit_accounts_plan_key_check";--> statement-breakpoint
ALTER TABLE "mitfloww"."storage_accounts" DROP CONSTRAINT "storage_accounts_plan_key_check";--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_accounts" ALTER COLUMN "plan_key" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "mitfloww"."storage_accounts" ALTER COLUMN "plan_key" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_accounts" ADD CONSTRAINT "credit_accounts_plan_key_check" CHECK ("mitfloww"."credit_accounts"."plan_key" IN ('free','standard','pro','studio','business'));--> statement-breakpoint
ALTER TABLE "mitfloww"."storage_accounts" ADD CONSTRAINT "storage_accounts_plan_key_check" CHECK ("mitfloww"."storage_accounts"."plan_key" IN ('free','standard','pro','studio','business'));