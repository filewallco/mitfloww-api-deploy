ALTER TABLE "mitfloww"."files" DROP CONSTRAINT "files_upload_status_check";--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ADD CONSTRAINT "files_upload_status_check" CHECK ("files"."upload_status" >= 0 AND "files"."upload_status" <= 3);
