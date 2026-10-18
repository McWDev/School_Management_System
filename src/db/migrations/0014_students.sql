CREATE TYPE "public"."student_gender" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'graduated', 'transferred', 'left');--> statement-breakpoint
CREATE TABLE "student_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_enrollments_student_year_unique" UNIQUE("student_id","academic_year_id")
);
--> statement-breakpoint
CREATE TABLE "student_number_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_photos" (
	"student_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_photos_content_type" CHECK ("student_photos"."content_type" in ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "student_photos_size" CHECK ("student_photos"."byte_size" > 0 and "student_photos"."byte_size" <= 1048576)
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_number" text NOT NULL,
	"full_name" text NOT NULL,
	"gender" "student_gender" NOT NULL,
	"date_of_birth" date NOT NULL,
	"admission_date" date NOT NULL,
	"guardian_name" text NOT NULL,
	"guardian_phone" text NOT NULL,
	"phone" text,
	"address" text,
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_tenant_number_unique" UNIQUE("tenant_id","student_number"),
	CONSTRAINT "students_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_class_fk" FOREIGN KEY ("tenant_id","class_id") REFERENCES "public"."classes"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_year_fk" FOREIGN KEY ("tenant_id","academic_year_id") REFERENCES "public"."academic_years"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_number_counters" ADD CONSTRAINT "student_number_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_photos" ADD CONSTRAINT "student_photos_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_enrollments_class_year_idx" ON "student_enrollments" USING btree ("class_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "student_enrollments_year_idx" ON "student_enrollments" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "students_tenant_status_idx" ON "students" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "students_tenant_name_idx" ON "students" USING btree ("tenant_id",lower("full_name"));