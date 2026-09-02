ALTER TABLE "mitfloww"."credit_accounts" ADD COLUMN "available_purchased_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_ledger_entries" ADD COLUMN "remaining_credits" integer;--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_ledger_entries" ADD COLUMN "is_expired" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."storage_account_mutations" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mitfloww"."storage_account_mutations" ADD COLUMN "is_expired" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mitfloww"."credit_accounts" ADD CONSTRAINT "credit_accounts_available_purchased_credits_check" CHECK ("mitfloww"."credit_accounts"."available_purchased_credits" >= 0);