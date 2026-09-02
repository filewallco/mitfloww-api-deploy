ALTER TABLE "mitfloww"."files" ALTER COLUMN "payment_status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ALTER COLUMN "payment_status" TYPE smallint USING CASE
	WHEN "payment_status" = 'pending' THEN 0
	WHEN "payment_status" = 'paid' THEN 1
	ELSE 0
END;--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ALTER COLUMN "payment_status" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ALTER COLUMN "upload_status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ALTER COLUMN "upload_status" TYPE smallint USING CASE
	WHEN "upload_status" = 'pending' THEN 0
	WHEN "upload_status" = 'uploaded' THEN 1
	WHEN "upload_status" = 'failed' THEN 2
	WHEN "upload_status" = 'deleted' THEN 3
	ELSE 0
END;--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ALTER COLUMN "upload_status" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ADD CONSTRAINT "files_payment_status_check" CHECK ("files"."payment_status" >= 0 AND "files"."payment_status" <= 1);--> statement-breakpoint
ALTER TABLE "mitfloww"."files" ADD CONSTRAINT "files_upload_status_check" CHECK ("files"."upload_status" >= 0 AND "files"."upload_status" <= 3);--> statement-breakpoint
DROP TYPE "mitfloww"."file_payment_status";--> statement-breakpoint
DROP TYPE "mitfloww"."file_upload_status";
