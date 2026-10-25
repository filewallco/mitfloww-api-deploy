-- Migration 0045: Add navigation preferences and version to users table

ALTER TABLE "mitfloww"."users" 
  ADD COLUMN IF NOT EXISTS "navigation_preferences" jsonb 
    DEFAULT '{"dashboardNav":true,"projectsNav":true,"assetsNav":true,"transactionsNav":true,"invoicesNav":true,"teamNav":true,"testimonialsNav":true}'::jsonb 
    NOT NULL;

ALTER TABLE "mitfloww"."users" 
  ADD COLUMN IF NOT EXISTS "navigation_preferences_version" integer 
    DEFAULT 1 
    NOT NULL;
