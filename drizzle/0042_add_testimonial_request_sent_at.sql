-- Migration 0042: Add testimonial request email sent tracking to projects
ALTER TABLE "mitfloww"."projects" ADD COLUMN IF NOT EXISTS "testimonial_request_sent_at" timestamp with time zone;
