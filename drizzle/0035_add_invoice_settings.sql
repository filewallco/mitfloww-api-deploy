CREATE TABLE IF NOT EXISTS "mitfloww"."invoice_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"template_id" varchar(64) DEFAULT 'modern' NOT NULL,
	"logo_alignment" varchar(16) DEFAULT 'left' NOT NULL,
	"name_alignment" varchar(16) DEFAULT 'left' NOT NULL,
	"accent_color" varchar(32) DEFAULT 'primary' NOT NULL,
	"show_logo" boolean DEFAULT true NOT NULL,
	"show_tax_number" boolean DEFAULT false NOT NULL,
	"tax_number" varchar(50),
	"show_notes" boolean DEFAULT true NOT NULL,
	"notes" text,
	"terms" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_settings_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "invoice_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "mitfloww"."users"("id") ON DELETE cascade ON UPDATE no action
);
