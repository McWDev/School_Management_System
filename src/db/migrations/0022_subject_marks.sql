CREATE TABLE "subject_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"midterm" numeric(5, 2),
	"activities" numeric(5, 2),
	"final" numeric(5, 2),
	"entered_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subject_marks_student_subject_year_unique" UNIQUE("student_id","subject_id","academic_year_id"),
	CONSTRAINT "subject_marks_midterm_range" CHECK ("subject_marks"."midterm" between 0 and 30),
	CONSTRAINT "subject_marks_activities_range" CHECK ("subject_marks"."activities" between 0 and 20),
	CONSTRAINT "subject_marks_final_range" CHECK ("subject_marks"."final" between 0 and 50)
);
--> statement-breakpoint
ALTER TABLE "subject_marks" ADD CONSTRAINT "subject_marks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_marks" ADD CONSTRAINT "subject_marks_entered_by_user_id_users_id_fk" FOREIGN KEY ("entered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_marks" ADD CONSTRAINT "subject_marks_year_fk" FOREIGN KEY ("tenant_id","academic_year_id") REFERENCES "public"."academic_years"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_marks" ADD CONSTRAINT "subject_marks_class_fk" FOREIGN KEY ("tenant_id","class_id") REFERENCES "public"."classes"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_marks" ADD CONSTRAINT "subject_marks_subject_fk" FOREIGN KEY ("tenant_id","subject_id") REFERENCES "public"."subjects"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_marks" ADD CONSTRAINT "subject_marks_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subject_marks_class_year_idx" ON "subject_marks" USING btree ("tenant_id","class_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "subject_marks_subject_idx" ON "subject_marks" USING btree ("subject_id");