ALTER TABLE "mitfloww"."assets" ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;

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
    updated_at,
    published_at
   FROM "mitfloww"."assets";
