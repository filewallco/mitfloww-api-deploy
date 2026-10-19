-- Migration 0044: Convert plan keys, contract status, invoice settings, and asset template keys to smallint ints

BEGIN;

-- 1. users.plan_key
ALTER TABLE "mitfloww"."users" DROP CONSTRAINT IF EXISTS "users_plan_key_check";
ALTER TABLE "mitfloww"."users" ALTER COLUMN "plan_key" DROP DEFAULT;
ALTER TABLE "mitfloww"."users" ALTER COLUMN "plan_key" TYPE smallint USING CASE
  WHEN "plan_key" = 'free' OR "plan_key" = '0' THEN 0
  WHEN "plan_key" = 'standard' OR "plan_key" = '1' THEN 1
  WHEN "plan_key" = 'pro' OR "plan_key" = '2' THEN 2
  WHEN "plan_key" = 'studio' OR "plan_key" = '3' THEN 3
  WHEN "plan_key" = 'business' OR "plan_key" = '4' THEN 4
  ELSE 0
END;
ALTER TABLE "mitfloww"."users" ALTER COLUMN "plan_key" SET DEFAULT 0;
ALTER TABLE "mitfloww"."users" ADD CONSTRAINT "users_plan_key_check" CHECK ("plan_key" >= 0 AND "plan_key" <= 4);

-- 2. credit_accounts.plan_key
ALTER TABLE "mitfloww"."credit_accounts" DROP CONSTRAINT IF EXISTS "credit_accounts_plan_key_check";
ALTER TABLE "mitfloww"."credit_accounts" ALTER COLUMN "plan_key" DROP DEFAULT;
ALTER TABLE "mitfloww"."credit_accounts" ALTER COLUMN "plan_key" TYPE smallint USING CASE
  WHEN "plan_key" = 'free' OR "plan_key" = '0' THEN 0
  WHEN "plan_key" = 'standard' OR "plan_key" = '1' THEN 1
  WHEN "plan_key" = 'pro' OR "plan_key" = '2' THEN 2
  WHEN "plan_key" = 'studio' OR "plan_key" = '3' THEN 3
  WHEN "plan_key" = 'business' OR "plan_key" = '4' THEN 4
  ELSE 0
END;
ALTER TABLE "mitfloww"."credit_accounts" ALTER COLUMN "plan_key" SET DEFAULT 0;
ALTER TABLE "mitfloww"."credit_accounts" ADD CONSTRAINT "credit_accounts_plan_key_check" CHECK ("plan_key" >= 0 AND "plan_key" <= 4);

-- 3. storage_accounts.plan_key
ALTER TABLE "mitfloww"."storage_accounts" DROP CONSTRAINT IF EXISTS "storage_accounts_plan_key_check";
ALTER TABLE "mitfloww"."storage_accounts" ALTER COLUMN "plan_key" DROP DEFAULT;
ALTER TABLE "mitfloww"."storage_accounts" ALTER COLUMN "plan_key" TYPE smallint USING CASE
  WHEN "plan_key" = 'free' OR "plan_key" = '0' THEN 0
  WHEN "plan_key" = 'standard' OR "plan_key" = '1' THEN 1
  WHEN "plan_key" = 'pro' OR "plan_key" = '2' THEN 2
  WHEN "plan_key" = 'studio' OR "plan_key" = '3' THEN 3
  WHEN "plan_key" = 'business' OR "plan_key" = '4' THEN 4
  ELSE 0
END;
ALTER TABLE "mitfloww"."storage_accounts" ALTER COLUMN "plan_key" SET DEFAULT 0;
ALTER TABLE "mitfloww"."storage_accounts" ADD CONSTRAINT "storage_accounts_plan_key_check" CHECK ("plan_key" >= 0 AND "plan_key" <= 4);

-- 4. projects.contract_status
ALTER TABLE "mitfloww"."projects" DROP CONSTRAINT IF EXISTS "projects_contract_status_check";
ALTER TABLE "mitfloww"."projects" ALTER COLUMN "contract_status" DROP DEFAULT;
ALTER TABLE "mitfloww"."projects" ALTER COLUMN "contract_status" TYPE smallint USING CASE
  WHEN "contract_status" = 'none' OR "contract_status" = '0' THEN 0
  WHEN "contract_status" = 'accepted' OR "contract_status" = '1' THEN 1
  WHEN "contract_status" = 'pending' OR "contract_status" = '2' THEN 2
  ELSE 0
END;
ALTER TABLE "mitfloww"."projects" ALTER COLUMN "contract_status" SET DEFAULT 0;
ALTER TABLE "mitfloww"."projects" ADD CONSTRAINT "projects_contract_status_check" CHECK ("contract_status" >= 0 AND "contract_status" <= 2);

-- 5. project_contracts.status
ALTER TABLE "mitfloww"."project_contracts" DROP CONSTRAINT IF EXISTS "project_contracts_status_check";
ALTER TABLE "mitfloww"."project_contracts" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "mitfloww"."project_contracts" ALTER COLUMN "status" TYPE smallint USING CASE
  WHEN "status" = 'accepted' OR "status" = '0' THEN 0
  WHEN "status" = 'superseded' OR "status" = '1' THEN 1
  WHEN "status" = 'revoked' OR "status" = '2' THEN 2
  ELSE 0
END;
ALTER TABLE "mitfloww"."project_contracts" ALTER COLUMN "status" SET DEFAULT 0;
ALTER TABLE "mitfloww"."project_contracts" ADD CONSTRAINT "project_contracts_status_check" CHECK ("status" >= 0 AND "status" <= 2);

-- 6. project_contract_update_requests.status
ALTER TABLE "mitfloww"."project_contract_update_requests" DROP CONSTRAINT IF EXISTS "project_contract_update_requests_status_check";
ALTER TABLE "mitfloww"."project_contract_update_requests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "mitfloww"."project_contract_update_requests" ALTER COLUMN "status" TYPE smallint USING CASE
  WHEN "status" = 'pending' OR "status" = '0' THEN 0
  WHEN "status" = 'accepted' OR "status" = '1' THEN 1
  WHEN "status" = 'rejected' OR "status" = '2' THEN 2
  WHEN "status" = 'withdrawn' OR "status" = '3' THEN 3
  WHEN "status" = 'cancelled' OR "status" = '4' THEN 4
  ELSE 0
END;
ALTER TABLE "mitfloww"."project_contract_update_requests" ALTER COLUMN "status" SET DEFAULT 0;
ALTER TABLE "mitfloww"."project_contract_update_requests" ADD CONSTRAINT "project_contract_update_requests_status_check" CHECK ("status" >= 0 AND "status" <= 4);

-- 7. invoice_settings.paper_size, logo_alignment, name_alignment
ALTER TABLE "mitfloww"."invoice_settings" DROP CONSTRAINT IF EXISTS "invoice_settings_paper_size_check";
ALTER TABLE "mitfloww"."invoice_settings" ALTER COLUMN "paper_size" DROP DEFAULT;
ALTER TABLE "mitfloww"."invoice_settings" ALTER COLUMN "paper_size" TYPE smallint USING CASE
  WHEN "paper_size" = 'a4' OR "paper_size" = '0' THEN 0
  WHEN "paper_size" = 'a5' OR "paper_size" = '1' THEN 1
  WHEN "paper_size" = 'letter' OR "paper_size" = '2' THEN 2
  ELSE 0
END;
ALTER TABLE "mitfloww"."invoice_settings" ALTER COLUMN "paper_size" SET DEFAULT 0;
ALTER TABLE "mitfloww"."invoice_settings" ADD CONSTRAINT "invoice_settings_paper_size_check" CHECK ("paper_size" >= 0 AND "paper_size" <= 2);

ALTER TABLE "mitfloww"."invoice_settings" DROP CONSTRAINT IF EXISTS "invoice_settings_logo_alignment_check";
ALTER TABLE "mitfloww"."invoice_settings" ALTER COLUMN "logo_alignment" DROP DEFAULT;
ALTER TABLE "mitfloww"."invoice_settings" ALTER COLUMN "logo_alignment" TYPE smallint USING CASE
  WHEN "logo_alignment" = 'left' OR "logo_alignment" = '0' THEN 0
  WHEN "logo_alignment" = 'center' OR "logo_alignment" = '1' THEN 1
  WHEN "logo_alignment" = 'right' OR "logo_alignment" = '2' THEN 2
  ELSE 0
END;
ALTER TABLE "mitfloww"."invoice_settings" ALTER COLUMN "logo_alignment" SET DEFAULT 0;
ALTER TABLE "mitfloww"."invoice_settings" ADD CONSTRAINT "invoice_settings_logo_alignment_check" CHECK ("logo_alignment" >= 0 AND "logo_alignment" <= 2);

ALTER TABLE "mitfloww"."invoice_settings" DROP CONSTRAINT IF EXISTS "invoice_settings_name_alignment_check";
ALTER TABLE "mitfloww"."invoice_settings" ALTER COLUMN "name_alignment" DROP DEFAULT;
ALTER TABLE "mitfloww"."invoice_settings" ALTER COLUMN "name_alignment" TYPE smallint USING CASE
  WHEN "name_alignment" = 'left' OR "name_alignment" = '0' THEN 0
  WHEN "name_alignment" = 'center' OR "name_alignment" = '1' THEN 1
  WHEN "name_alignment" = 'right' OR "name_alignment" = '2' THEN 2
  ELSE 0
END;
ALTER TABLE "mitfloww"."invoice_settings" ALTER COLUMN "name_alignment" SET DEFAULT 0;
ALTER TABLE "mitfloww"."invoice_settings" ADD CONSTRAINT "invoice_settings_name_alignment_check" CHECK ("name_alignment" >= 0 AND "name_alignment" <= 2);

-- 8. assets.template_key (and asset_shares view)
DROP VIEW IF EXISTS "mitfloww"."asset_shares";

ALTER TABLE "mitfloww"."assets" DROP CONSTRAINT IF EXISTS "assets_template_key_check";
ALTER TABLE "mitfloww"."assets" ALTER COLUMN "template_key" DROP DEFAULT;
ALTER TABLE "mitfloww"."assets" ALTER COLUMN "template_key" TYPE smallint USING CASE
  WHEN "template_key" = 'minimal-modern' OR "template_key" = '0' THEN 0
  WHEN "template_key" = 'neon-cyber' OR "template_key" = '1' THEN 1
  WHEN "template_key" = 'clean-studio' OR "template_key" = '2' THEN 2
  WHEN "template_key" = 'bold-editorial' OR "template_key" = '3' THEN 3
  ELSE 0
END;
ALTER TABLE "mitfloww"."assets" ALTER COLUMN "template_key" SET DEFAULT 0;
ALTER TABLE "mitfloww"."assets" ADD CONSTRAINT "assets_template_key_check" CHECK ("template_key" >= 0 AND "template_key" <= 3);

CREATE OR REPLACE VIEW "mitfloww"."asset_shares" AS
 SELECT id,
    user_id,
    title,
    description,
    amount_cents,
    currency,
    template_key,
    status,
    share_token,
    share_expires_at,
    deleted_at,
    created_at,
    updated_at
   FROM "mitfloww"."assets";

COMMIT;
