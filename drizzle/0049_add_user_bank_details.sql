-- Create mitfloww.user_bank_details table
CREATE TABLE IF NOT EXISTS "mitfloww"."user_bank_details" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(255) NOT NULL UNIQUE REFERENCES "mitfloww"."users"("id") ON DELETE CASCADE,
  "account_holder_name" varchar(150) NOT NULL,
  "bank_name" varchar(150) NOT NULL,
  "account_number_ciphertext" text NOT NULL,
  "account_number_last4" varchar(8) NOT NULL,
  "routing_code_ciphertext" text NOT NULL,
  "routing_code_last4" varchar(8),
  "account_type" varchar(50) NOT NULL DEFAULT 'savings',
  "country" varchar(100),
  "currency" varchar(10),
  "upi_id" varchar(100),
  "bank_branch_address" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "user_bank_details_user_id_idx"
  ON "mitfloww"."user_bank_details" ("user_id");
