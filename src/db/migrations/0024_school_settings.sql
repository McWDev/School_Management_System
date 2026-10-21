CREATE TABLE "school_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"pass_mark" integer DEFAULT 50 NOT NULL,
	"midterm_max" integer DEFAULT 30 NOT NULL,
	"activities_max" integer DEFAULT 20 NOT NULL,
	"final_max" integer DEFAULT 50 NOT NULL,
	"student_prefix" text DEFAULT 'STU' NOT NULL,
	"receipt_prefix" text DEFAULT 'RCT' NOT NULL,
	"payslip_prefix" text DEFAULT 'PAY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_settings_pass_mark_range" CHECK ("school_settings"."pass_mark" between 1 and 100),
	CONSTRAINT "school_settings_parts_total" CHECK ("school_settings"."midterm_max" >= 1 and "school_settings"."activities_max" >= 1 and "school_settings"."final_max" >= 1 and "school_settings"."midterm_max" + "school_settings"."activities_max" + "school_settings"."final_max" = 100),
	CONSTRAINT "school_settings_prefixes" CHECK ("school_settings"."student_prefix" ~ '^[A-Z0-9]{1,6}$' and "school_settings"."receipt_prefix" ~ '^[A-Z0-9]{1,6}$' and "school_settings"."payslip_prefix" ~ '^[A-Z0-9]{1,6}$')
);
--> statement-breakpoint
ALTER TABLE "subject_marks" DROP CONSTRAINT "subject_marks_midterm_range";--> statement-breakpoint
ALTER TABLE "subject_marks" DROP CONSTRAINT "subject_marks_activities_range";--> statement-breakpoint
ALTER TABLE "subject_marks" DROP CONSTRAINT "subject_marks_final_range";--> statement-breakpoint
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_marks" ADD CONSTRAINT "subject_marks_parts_range" CHECK ("subject_marks"."midterm" between 0 and 100 and "subject_marks"."activities" between 0 and 100 and "subject_marks"."final" between 0 and 100);