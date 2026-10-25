-- Migration 0046: Add relational dashboard presets and customization

CREATE TABLE IF NOT EXISTS "mitfloww"."dashboard_presets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(255) NOT NULL REFERENCES "mitfloww"."users"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "preset_key" varchar(64),
  "is_system" boolean NOT NULL DEFAULT false,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_presets_user_name_unique" 
  ON "mitfloww"."dashboard_presets" ("user_id", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_presets_user_preset_key_unique" 
  ON "mitfloww"."dashboard_presets" ("user_id", "preset_key") 
  WHERE "preset_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "dashboard_presets_user_id_idx" 
  ON "mitfloww"."dashboard_presets" ("user_id");

CREATE TABLE IF NOT EXISTS "mitfloww"."dashboard_preset_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "preset_id" uuid NOT NULL REFERENCES "mitfloww"."dashboard_presets"("id") ON DELETE CASCADE,
  "widget_key" varchar(64) NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  "is_visible" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dashboard_preset_items_position_non_negative" CHECK ("position" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_preset_items_preset_widget_unique" 
  ON "mitfloww"."dashboard_preset_items" ("preset_id", "widget_key");

CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_preset_items_preset_position_unique" 
  ON "mitfloww"."dashboard_preset_items" ("preset_id", "position");

CREATE INDEX IF NOT EXISTS "dashboard_preset_items_preset_id_idx" 
  ON "mitfloww"."dashboard_preset_items" ("preset_id");

CREATE INDEX IF NOT EXISTS "dashboard_preset_items_preset_position_idx" 
  ON "mitfloww"."dashboard_preset_items" ("preset_id", "position");

CREATE TABLE IF NOT EXISTS "mitfloww"."dashboard_user_state" (
  "user_id" varchar(255) PRIMARY KEY REFERENCES "mitfloww"."users"("id") ON DELETE CASCADE,
  "active_preset_key" varchar(64) NOT NULL DEFAULT 'all',
  "active_preset_id" uuid REFERENCES "mitfloww"."dashboard_presets"("id") ON DELETE SET NULL,
  "version" integer NOT NULL DEFAULT 1,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "dashboard_user_state_user_id_idx" 
  ON "mitfloww"."dashboard_user_state" ("user_id");
