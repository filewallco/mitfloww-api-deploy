ALTER TABLE "mitfloww"."projects"
  ADD COLUMN IF NOT EXISTS "share_password_ciphertext" varchar(1024);
