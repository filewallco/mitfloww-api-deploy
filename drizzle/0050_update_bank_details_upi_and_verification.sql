-- Add payment_type, verification_status, verified_at and make bank-specific columns nullable for UPI
ALTER TABLE "mitfloww"."user_bank_details"
  ADD COLUMN IF NOT EXISTS "payment_type" varchar(20) NOT NULL DEFAULT 'bank',
  ADD COLUMN IF NOT EXISTS "verification_status" varchar(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone,
  ALTER COLUMN "account_holder_name" DROP NOT NULL,
  ALTER COLUMN "bank_name" DROP NOT NULL,
  ALTER COLUMN "account_number_ciphertext" DROP NOT NULL,
  ALTER COLUMN "account_number_last4" DROP NOT NULL,
  ALTER COLUMN "routing_code_ciphertext" DROP NOT NULL;
