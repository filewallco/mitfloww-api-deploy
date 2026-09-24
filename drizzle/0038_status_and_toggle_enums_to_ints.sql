-- Migration 0038: Convert all status, state, toggle, and category columns to smallint int numbers

BEGIN;

-- 1. projects
ALTER TABLE "mitfloww"."projects" DROP CONSTRAINT IF EXISTS "projects_status_check";
ALTER TABLE "mitfloww"."projects" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "mitfloww"."projects" ALTER COLUMN "status" TYPE smallint USING CASE
  WHEN "status" = 'active' THEN 0
  WHEN "status" = 'completed' THEN 1
  WHEN "status" = '0' THEN 0
  WHEN "status" = '1' THEN 1
  ELSE 0
END;
ALTER TABLE "mitfloww"."projects" ALTER COLUMN "status" SET DEFAULT 0;
ALTER TABLE "mitfloww"."projects" ADD CONSTRAINT "projects_status_check" CHECK ("status" >= 0 AND "status" <= 1);

ALTER TABLE "mitfloww"."projects" DROP CONSTRAINT IF EXISTS "projects_share_status_check";
ALTER TABLE "mitfloww"."projects" ALTER COLUMN "share_status" TYPE smallint USING CASE
  WHEN "share_status" = 'active' THEN 0
  WHEN "share_status" = 'expired' THEN 1
  WHEN "share_status" = 'locked' THEN 2
  WHEN "share_status" = 'revoked' THEN 3
  WHEN "share_status" = 'password_required' THEN 4
  WHEN "share_status" = '0' THEN 0
  WHEN "share_status" = '1' THEN 1
  WHEN "share_status" = '2' THEN 2
  WHEN "share_status" = '3' THEN 3
  WHEN "share_status" = '4' THEN 4
  ELSE NULL
END;
ALTER TABLE "mitfloww"."projects" ADD CONSTRAINT "projects_share_status_check" CHECK ("share_status" IS NULL OR ("share_status" >= 0 AND "share_status" <= 4));

-- 2. project_payment_snapshots
ALTER TABLE "mitfloww"."project_payment_snapshots" ALTER COLUMN "payment_type" DROP DEFAULT;
ALTER TABLE "mitfloww"."project_payment_snapshots" ALTER COLUMN "payment_type" TYPE smallint USING CASE
  WHEN "payment_type" = 'advance' THEN 0
  WHEN "payment_type" = 'final' THEN 1
  WHEN "payment_type" = 'full' THEN 2
  WHEN "payment_type" = 'remaining' THEN 3
  ELSE 1
END;
ALTER TABLE "mitfloww"."project_payment_snapshots" ALTER COLUMN "payment_type" SET DEFAULT 1;
ALTER TABLE "mitfloww"."project_payment_snapshots" ADD CONSTRAINT "project_payment_snapshots_payment_type_check" CHECK ("payment_type" >= 0 AND "payment_type" <= 3);

ALTER TABLE "mitfloww"."project_payment_snapshots" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "mitfloww"."project_payment_snapshots" ALTER COLUMN "status" TYPE smallint USING CASE
  WHEN "status" = 'pending' THEN 0
  WHEN "status" = 'paid' THEN 1
  WHEN "status" = 'failed' THEN 2
  WHEN "status" = 'refunded' THEN 3
  ELSE 0
END;
ALTER TABLE "mitfloww"."project_payment_snapshots" ALTER COLUMN "status" SET DEFAULT 0;
ALTER TABLE "mitfloww"."project_payment_snapshots" ADD CONSTRAINT "project_payment_snapshots_status_check" CHECK ("status" >= 0 AND "status" <= 3);

-- 3. files
ALTER TABLE "mitfloww"."files" DROP CONSTRAINT IF EXISTS "files_approval_status_check";
ALTER TABLE "mitfloww"."files" ALTER COLUMN "approval_status" DROP DEFAULT;
ALTER TABLE "mitfloww"."files" ALTER COLUMN "approval_status" TYPE smallint USING CASE
  WHEN "approval_status" = 'pending' THEN 0
  WHEN "approval_status" = 'approved' THEN 1
  WHEN "approval_status" = 'rejected' THEN 2
  ELSE 0
END;
ALTER TABLE "mitfloww"."files" ALTER COLUMN "approval_status" SET DEFAULT 0;
ALTER TABLE "mitfloww"."files" ADD CONSTRAINT "files_approval_status_check" CHECK ("approval_status" >= 0 AND "approval_status" <= 2);

ALTER TABLE "mitfloww"."files" DROP CONSTRAINT IF EXISTS "files_final_draft_report_status_check";
ALTER TABLE "mitfloww"."files" ALTER COLUMN "final_draft_report_status" DROP DEFAULT;
ALTER TABLE "mitfloww"."files" ALTER COLUMN "final_draft_report_status" TYPE smallint USING CASE
  WHEN "final_draft_report_status" = 'none' THEN 0
  WHEN "final_draft_report_status" = 'reported' THEN 1
  WHEN "final_draft_report_status" = 'under_review' THEN 2
  WHEN "final_draft_report_status" = 'resolved' THEN 3
  WHEN "final_draft_report_status" = 'dismissed' THEN 4
  ELSE 0
END;
ALTER TABLE "mitfloww"."files" ALTER COLUMN "final_draft_report_status" SET DEFAULT 0;
ALTER TABLE "mitfloww"."files" ADD CONSTRAINT "files_final_draft_report_status_check" CHECK ("final_draft_report_status" >= 0 AND "final_draft_report_status" <= 4);

-- 4. file_versions
ALTER TABLE "mitfloww"."file_versions" DROP CONSTRAINT IF EXISTS "file_versions_processing_status_check";
ALTER TABLE "mitfloww"."file_versions" ALTER COLUMN "processing_status" DROP DEFAULT;
ALTER TABLE "mitfloww"."file_versions" ALTER COLUMN "processing_status" TYPE smallint USING CASE
  WHEN "processing_status" = 'queued' THEN 0
  WHEN "processing_status" = 'processing' THEN 1
  WHEN "processing_status" = 'uploading' THEN 2
  WHEN "processing_status" = 'completed' THEN 3
  WHEN "processing_status" = 'retrying' THEN 4
  WHEN "processing_status" = 'failed' THEN 5
  WHEN "processing_status" = 'corrupt' THEN 6
  WHEN "processing_status" = 'skipped' THEN 7
  WHEN "processing_status" = 'cancelled' THEN 8
  ELSE 0
END;
ALTER TABLE "mitfloww"."file_versions" ALTER COLUMN "processing_status" SET DEFAULT 0;
ALTER TABLE "mitfloww"."file_versions" ADD CONSTRAINT "file_versions_processing_status_check" CHECK ("processing_status" >= 0 AND "processing_status" <= 8);

-- 5. file_version_reports
ALTER TABLE "mitfloww"."file_version_reports" DROP CONSTRAINT IF EXISTS "file_version_reports_status_check";
ALTER TABLE "mitfloww"."file_version_reports" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "mitfloww"."file_version_reports" ALTER COLUMN "status" TYPE smallint USING CASE
  WHEN "status" = 'reported' THEN 0
  WHEN "status" = 'under_review' THEN 1
  WHEN "status" = 'resolved' THEN 2
  WHEN "status" = 'dismissed' THEN 3
  ELSE 0
END;
ALTER TABLE "mitfloww"."file_version_reports" ALTER COLUMN "status" SET DEFAULT 0;
ALTER TABLE "mitfloww"."file_version_reports" ADD CONSTRAINT "file_version_reports_status_check" CHECK ("status" >= 0 AND "status" <= 3);

-- 6. revision_comments
ALTER TABLE "mitfloww"."revision_comments" DROP CONSTRAINT IF EXISTS "revision_comments_status_check";
ALTER TABLE "mitfloww"."revision_comments" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "mitfloww"."revision_comments" ALTER COLUMN "status" TYPE smallint USING CASE
  WHEN "status" = 'pending' THEN 0
  WHEN "status" = 'resolved' THEN 1
  ELSE 0
END;
ALTER TABLE "mitfloww"."revision_comments" ALTER COLUMN "status" SET DEFAULT 0;
ALTER TABLE "mitfloww"."revision_comments" ADD CONSTRAINT "revision_comments_status_check" CHECK ("status" >= 0 AND "status" <= 1);

-- 7. revision_comment_reports
ALTER TABLE "mitfloww"."revision_comment_reports" DROP CONSTRAINT IF EXISTS "revision_comment_reports_status_check";
ALTER TABLE "mitfloww"."revision_comment_reports" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "mitfloww"."revision_comment_reports" ALTER COLUMN "status" TYPE smallint USING CASE
  WHEN "status" = 'reported' THEN 0
  WHEN "status" = 'under_review' THEN 1
  WHEN "status" = 'resolved' THEN 2
  WHEN "status" = 'dismissed' THEN 3
  ELSE 0
END;
ALTER TABLE "mitfloww"."revision_comment_reports" ALTER COLUMN "status" SET DEFAULT 0;
ALTER TABLE "mitfloww"."revision_comment_reports" ADD CONSTRAINT "revision_comment_reports_status_check" CHECK ("status" >= 0 AND "status" <= 3);

-- 8. revision_comment_markers
ALTER TABLE "mitfloww"."revision_comment_markers" DROP CONSTRAINT IF EXISTS "revision_comment_markers_type_check";
ALTER TABLE "mitfloww"."revision_comment_markers" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "mitfloww"."revision_comment_markers" ALTER COLUMN "type" TYPE smallint USING CASE
  WHEN "type" = 'region' THEN 0
  ELSE 0
END;
ALTER TABLE "mitfloww"."revision_comment_markers" ALTER COLUMN "type" SET DEFAULT 0;
ALTER TABLE "mitfloww"."revision_comment_markers" ADD CONSTRAINT "revision_comment_markers_type_check" CHECK ("type" >= 0);

-- 9. assets
DROP VIEW IF EXISTS "mitfloww"."asset_shares";

ALTER TABLE "mitfloww"."assets" DROP CONSTRAINT IF EXISTS "assets_status_check";
ALTER TABLE "mitfloww"."assets" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "mitfloww"."assets" ALTER COLUMN "status" TYPE smallint USING CASE
  WHEN "status" = 'active' THEN 0
  WHEN "status" = 'deactivated' THEN 1
  ELSE 0
END;
ALTER TABLE "mitfloww"."assets" ALTER COLUMN "status" SET DEFAULT 0;
ALTER TABLE "mitfloww"."assets" ADD CONSTRAINT "assets_status_check" CHECK ("status" >= 0 AND "status" <= 1);

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


-- 10. transactions
ALTER TABLE "mitfloww"."transactions" ALTER COLUMN "payment_status" DROP DEFAULT;
ALTER TABLE "mitfloww"."transactions" ALTER COLUMN "payment_status" TYPE smallint USING CASE
  WHEN "payment_status" = 'pending' THEN 0
  WHEN "payment_status" = 'paid' THEN 1
  WHEN "payment_status" = 'failed' THEN 2
  WHEN "payment_status" = 'refunded' THEN 3
  ELSE 1
END;
ALTER TABLE "mitfloww"."transactions" ALTER COLUMN "payment_status" SET DEFAULT 1;
ALTER TABLE "mitfloww"."transactions" ADD CONSTRAINT "transactions_payment_status_check" CHECK ("payment_status" >= 0 AND "payment_status" <= 3);

ALTER TABLE "mitfloww"."transactions" ALTER COLUMN "payment_type" DROP DEFAULT;
ALTER TABLE "mitfloww"."transactions" ALTER COLUMN "payment_type" TYPE smallint USING CASE
  WHEN "payment_type" = 'advance' THEN 0
  WHEN "payment_type" = 'final' THEN 1
  WHEN "payment_type" = 'full' THEN 2
  WHEN "payment_type" = 'remaining' THEN 3
  ELSE 2
END;
ALTER TABLE "mitfloww"."transactions" ALTER COLUMN "payment_type" SET DEFAULT 2;
ALTER TABLE "mitfloww"."transactions" ADD CONSTRAINT "transactions_payment_type_check" CHECK ("payment_type" >= 0 AND "payment_type" <= 3);

-- 11. users
ALTER TABLE "mitfloww"."users" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "mitfloww"."users" ALTER COLUMN "status" TYPE smallint USING CASE
  WHEN "status" = 'active' THEN 0
  WHEN "status" = 'suspended' THEN 1
  WHEN "status" = 'deactivated' THEN 2
  ELSE 0
END;
ALTER TABLE "mitfloww"."users" ALTER COLUMN "status" SET DEFAULT 0;
ALTER TABLE "mitfloww"."users" ADD CONSTRAINT "users_status_check" CHECK ("status" >= 0 AND "status" <= 2);

-- 12. otp_challenges
ALTER TABLE "mitfloww"."otp_challenges" ALTER COLUMN "purpose" TYPE smallint USING CASE
  WHEN "purpose" = 'SIGNUP_VERIFICATION' THEN 0
  WHEN "purpose" = 'LOGIN' THEN 1
  WHEN "purpose" = 'PASSWORD_RESET' THEN 2
  ELSE 0
END;
ALTER TABLE "mitfloww"."otp_challenges" ADD CONSTRAINT "otp_challenges_purpose_check" CHECK ("purpose" >= 0 AND "purpose" <= 2);

-- 13. notifications
ALTER TABLE "mitfloww"."notifications" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "mitfloww"."notifications" ALTER COLUMN "category" TYPE smallint USING CASE
  WHEN "category" = 'system' THEN 0
  WHEN "category" = 'file_processing_failed' THEN 1
  WHEN "category" = 'file_processing_succeeded' THEN 2
  ELSE 0
END;
ALTER TABLE "mitfloww"."notifications" ALTER COLUMN "category" SET DEFAULT 0;
ALTER TABLE "mitfloww"."notifications" ADD CONSTRAINT "notifications_category_check" CHECK ("category" >= 0 AND "category" <= 2);

-- 14. testimonials & testimonial templates
ALTER TABLE "mitfloww"."testimonials" DROP CONSTRAINT IF EXISTS "testimonials_status_check";
ALTER TABLE "mitfloww"."testimonials" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "mitfloww"."testimonials" ALTER COLUMN "status" TYPE smallint USING CASE
  WHEN "status" = 'draft' THEN 0
  WHEN "status" = 'saved' THEN 1
  WHEN "status" = 'published' THEN 2
  WHEN "status" = 'archived' THEN 3
  ELSE 0
END;
ALTER TABLE "mitfloww"."testimonials" ALTER COLUMN "status" SET DEFAULT 0;
ALTER TABLE "mitfloww"."testimonials" ADD CONSTRAINT "testimonials_status_check" CHECK ("status" >= 0 AND "status" <= 3);

ALTER TABLE "mitfloww"."testimonials" DROP CONSTRAINT IF EXISTS "testimonials_template_scope_check";
ALTER TABLE "mitfloww"."testimonials" ALTER COLUMN "template_scope" DROP DEFAULT;
ALTER TABLE "mitfloww"."testimonials" ALTER COLUMN "template_scope" TYPE smallint USING CASE
  WHEN "template_scope" = 'system' THEN 0
  WHEN "template_scope" = 'user' THEN 1
  ELSE 0
END;
ALTER TABLE "mitfloww"."testimonials" ALTER COLUMN "template_scope" SET DEFAULT 0;
ALTER TABLE "mitfloww"."testimonials" ADD CONSTRAINT "testimonials_template_scope_check" CHECK ("template_scope" >= 0 AND "template_scope" <= 1);

ALTER TABLE "mitfloww"."testimonial_templates" DROP CONSTRAINT IF EXISTS "testimonial_templates_scope_check";
ALTER TABLE "mitfloww"."testimonial_templates" ALTER COLUMN "scope" DROP DEFAULT;
ALTER TABLE "mitfloww"."testimonial_templates" ALTER COLUMN "scope" TYPE smallint USING CASE
  WHEN "scope" = 'system' THEN 0
  WHEN "scope" = 'user' THEN 1
  ELSE 0
END;
ALTER TABLE "mitfloww"."testimonial_templates" ALTER COLUMN "scope" SET DEFAULT 0;
ALTER TABLE "mitfloww"."testimonial_templates" ADD CONSTRAINT "testimonial_templates_scope_check" CHECK ("scope" >= 0 AND "scope" <= 1);

ALTER TABLE "mitfloww"."testimonial_templates" DROP CONSTRAINT IF EXISTS "testimonial_templates_access_level_check";
ALTER TABLE "mitfloww"."testimonial_templates" ALTER COLUMN "access_level" DROP DEFAULT;
ALTER TABLE "mitfloww"."testimonial_templates" ALTER COLUMN "access_level" TYPE smallint USING CASE
  WHEN "access_level" = 'free' THEN 0
  WHEN "access_level" = 'premium' THEN 1
  ELSE 0
END;
ALTER TABLE "mitfloww"."testimonial_templates" ALTER COLUMN "access_level" SET DEFAULT 0;
ALTER TABLE "mitfloww"."testimonial_templates" ADD CONSTRAINT "testimonial_templates_access_level_check" CHECK ("access_level" >= 0 AND "access_level" <= 1);

ALTER TABLE "mitfloww"."testimonial_revisions" DROP CONSTRAINT IF EXISTS "testimonial_revisions_reason_check";
ALTER TABLE "mitfloww"."testimonial_revisions" ALTER COLUMN "reason" TYPE smallint USING CASE
  WHEN "reason" = 'autosave' THEN 0
  WHEN "reason" = 'manual' THEN 1
  WHEN "reason" = 'duplicate' THEN 2
  WHEN "reason" = 'publish' THEN 3
  WHEN "reason" = 'template-change' THEN 4
  ELSE 0
END;
ALTER TABLE "mitfloww"."testimonial_revisions" ADD CONSTRAINT "testimonial_revisions_reason_check" CHECK ("reason" >= 0 AND "reason" <= 4);

-- 15. credit_reservations & credit_ledger_entries
ALTER TABLE "mitfloww"."credit_reservations" DROP CONSTRAINT IF EXISTS "credit_reservations_status_check";
ALTER TABLE "mitfloww"."credit_reservations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "mitfloww"."credit_reservations" ALTER COLUMN "status" TYPE smallint USING CASE
  WHEN "status" = 'active' THEN 0
  WHEN "status" = 'captured' THEN 1
  WHEN "status" = 'released' THEN 2
  WHEN "status" = 'expired' THEN 3
  ELSE 0
END;
ALTER TABLE "mitfloww"."credit_reservations" ALTER COLUMN "status" SET DEFAULT 0;
ALTER TABLE "mitfloww"."credit_reservations" ADD CONSTRAINT "credit_reservations_status_check" CHECK ("status" >= 0 AND "status" <= 3);

ALTER TABLE "mitfloww"."credit_ledger_entries" DROP CONSTRAINT IF EXISTS "credit_ledger_entries_type_check";
ALTER TABLE "mitfloww"."credit_ledger_entries" DROP CONSTRAINT IF EXISTS "credit_ledger_entries_credit_value_check";
ALTER TABLE "mitfloww"."credit_ledger_entries" ALTER COLUMN "type" TYPE smallint USING CASE
  WHEN "type" = 'grant' THEN 0
  WHEN "type" = 'purchase' THEN 1
  WHEN "type" = 'deduction' THEN 2
  WHEN "type" = 'refund' THEN 3
  WHEN "type" = 'adjustment' THEN 4
  WHEN "type" = 'expiry' THEN 5
  WHEN "type" = 'reservation' THEN 6
  WHEN "type" = 'reservation_release' THEN 7
  WHEN "type" = 'reservation_capture' THEN 8
  ELSE 0
END;
ALTER TABLE "mitfloww"."credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_type_check" CHECK ("type" >= 0 AND "type" <= 8);
ALTER TABLE "mitfloww"."credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_credit_value_check" CHECK ((credits <> 0) OR (type = 8));

ALTER TABLE "mitfloww"."credit_ledger_entries" DROP CONSTRAINT IF EXISTS "credit_ledger_entries_source_check";
ALTER TABLE "mitfloww"."credit_ledger_entries" ALTER COLUMN "source" TYPE smallint USING CASE
  WHEN "source" = 'monthly_plan' THEN 0
  WHEN "source" = 'purchased_pack' THEN 1
  WHEN "source" = 'promotional' THEN 2
  WHEN "source" = 'feature_usage' THEN 3
  WHEN "source" = 'admin_adjustment' THEN 4
  WHEN "source" = 'refund' THEN 5
  WHEN "source" = 'system' THEN 6
  ELSE 0
END;
ALTER TABLE "mitfloww"."credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_source_check" CHECK ("source" >= 0 AND "source" <= 6);

-- 16. scope_type & storage operations
ALTER TABLE "mitfloww"."credit_accounts" DROP CONSTRAINT IF EXISTS "credit_accounts_scope_type_check";
ALTER TABLE "mitfloww"."credit_accounts" ALTER COLUMN "scope_type" DROP DEFAULT;
ALTER TABLE "mitfloww"."credit_accounts" ALTER COLUMN "scope_type" TYPE smallint USING CASE
  WHEN "scope_type" = 'personal' THEN 0
  WHEN "scope_type" = 'workspace' THEN 1
  ELSE 0
END;
ALTER TABLE "mitfloww"."credit_accounts" ALTER COLUMN "scope_type" SET DEFAULT 0;
ALTER TABLE "mitfloww"."credit_accounts" ADD CONSTRAINT "credit_accounts_scope_type_check" CHECK ("scope_type" >= 0 AND "scope_type" <= 1);

ALTER TABLE "mitfloww"."credit_ledger_entries" DROP CONSTRAINT IF EXISTS "credit_ledger_entries_scope_type_check";
ALTER TABLE "mitfloww"."credit_ledger_entries" ALTER COLUMN "scope_type" DROP DEFAULT;
ALTER TABLE "mitfloww"."credit_ledger_entries" ALTER COLUMN "scope_type" TYPE smallint USING CASE
  WHEN "scope_type" = 'personal' THEN 0
  WHEN "scope_type" = 'workspace' THEN 1
  ELSE 0
END;
ALTER TABLE "mitfloww"."credit_ledger_entries" ALTER COLUMN "scope_type" SET DEFAULT 0;
ALTER TABLE "mitfloww"."credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_scope_type_check" CHECK ("scope_type" >= 0 AND "scope_type" <= 1);

ALTER TABLE "mitfloww"."credit_reservations" DROP CONSTRAINT IF EXISTS "credit_reservations_scope_type_check";
ALTER TABLE "mitfloww"."credit_reservations" ALTER COLUMN "scope_type" DROP DEFAULT;
ALTER TABLE "mitfloww"."credit_reservations" ALTER COLUMN "scope_type" TYPE smallint USING CASE
  WHEN "scope_type" = 'personal' THEN 0
  WHEN "scope_type" = 'workspace' THEN 1
  ELSE 0
END;
ALTER TABLE "mitfloww"."credit_reservations" ALTER COLUMN "scope_type" SET DEFAULT 0;
ALTER TABLE "mitfloww"."credit_reservations" ADD CONSTRAINT "credit_reservations_scope_type_check" CHECK ("scope_type" >= 0 AND "scope_type" <= 1);

ALTER TABLE "mitfloww"."storage_accounts" DROP CONSTRAINT IF EXISTS "storage_accounts_scope_type_check";
ALTER TABLE "mitfloww"."storage_accounts" ALTER COLUMN "scope_type" TYPE smallint USING CASE
  WHEN "scope_type" = 'personal' THEN 0
  WHEN "scope_type" = 'workspace' THEN 1
  ELSE 0
END;
ALTER TABLE "mitfloww"."storage_accounts" ADD CONSTRAINT "storage_accounts_scope_type_check" CHECK ("scope_type" >= 0 AND "scope_type" <= 1);

ALTER TABLE "mitfloww"."storage_account_mutations" DROP CONSTRAINT IF EXISTS "storage_account_mutations_scope_type_check";
ALTER TABLE "mitfloww"."storage_account_mutations" ALTER COLUMN "scope_type" TYPE smallint USING CASE
  WHEN "scope_type" = 'personal' THEN 0
  WHEN "scope_type" = 'workspace' THEN 1
  ELSE 0
END;
ALTER TABLE "mitfloww"."storage_account_mutations" ADD CONSTRAINT "storage_account_mutations_scope_type_check" CHECK ("scope_type" >= 0 AND "scope_type" <= 1);

ALTER TABLE "mitfloww"."storage_account_mutations" DROP CONSTRAINT IF EXISTS "storage_account_mutations_operation_check";
ALTER TABLE "mitfloww"."storage_account_mutations" ALTER COLUMN "operation" TYPE smallint USING CASE
  WHEN "operation" = 'commit' THEN 0
  WHEN "operation" = 'release' THEN 1
  WHEN "operation" = 'adjustment' THEN 2
  ELSE 0
END;
ALTER TABLE "mitfloww"."storage_account_mutations" ADD CONSTRAINT "storage_account_mutations_operation_check" CHECK ("operation" >= 0 AND "operation" <= 2);

COMMIT;
