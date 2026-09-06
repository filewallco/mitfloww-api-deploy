ALTER TABLE "mitfloww"."invoice_settings" ADD COLUMN IF NOT EXISTS "paper_size" varchar(16) DEFAULT 'a4' NOT NULL;
