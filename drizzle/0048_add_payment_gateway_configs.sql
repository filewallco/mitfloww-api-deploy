-- Create mitfloww.payment_gateway_configs table
CREATE TABLE IF NOT EXISTS "mitfloww"."payment_gateway_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" varchar(32) NOT NULL,
  "display_name" varchar(64) NOT NULL,
  "description" varchar(255),
  "is_enabled" boolean NOT NULL DEFAULT true,
  "supported_currencies" jsonb NOT NULL DEFAULT '["INR"]'::jsonb,
  "environment" varchar(16) NOT NULL DEFAULT 'sandbox',
  "fee_percentage_basis_points" integer NOT NULL DEFAULT 230,
  "fixed_fee_cents" integer NOT NULL DEFAULT 0,
  "tax_rate_basis_points" integer NOT NULL DEFAULT 1800,
  "fee_passing_enabled" boolean NOT NULL DEFAULT true,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "unique_payment_gateway_configs_provider" UNIQUE ("provider")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_gateway_configs_provider_idx"
  ON "mitfloww"."payment_gateway_configs" ("provider");

-- Seed initial default configuration for Razorpay, Cashfree, and Stripe
INSERT INTO "mitfloww"."payment_gateway_configs" (
  "provider",
  "display_name",
  "description",
  "is_enabled",
  "supported_currencies",
  "environment",
  "fee_percentage_basis_points",
  "fixed_fee_cents",
  "tax_rate_basis_points",
  "fee_passing_enabled",
  "is_default"
) VALUES
(
  'razorpay',
  'Razorpay',
  'UPI, Credit/Debit Cards, NetBanking, Wallets',
  true,
  '["INR"]'::jsonb,
  'sandbox',
  230,
  0,
  1800,
  true,
  true
),
(
  'cashfree',
  'Cashfree Payments',
  'UPI, QR, Cards, 30+ Netbanking',
  true,
  '["INR"]'::jsonb,
  'sandbox',
  190,
  0,
  1800,
  true,
  false
),
(
  'stripe',
  'Stripe',
  'International Credit & Debit Cards',
  true,
  '["USD", "EUR", "GBP", "CAD", "AUD"]'::jsonb,
  'sandbox',
  290,
  30,
  0,
  true,
  false
)
ON CONFLICT ("provider") DO NOTHING;

