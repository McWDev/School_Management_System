CREATE TYPE "public"."student_fee_type" AS ENUM('full_scholarship', 'partial_fee', 'full_payment');--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "fee_type" "student_fee_type" DEFAULT 'full_payment' NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "partial_fee_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "registration_fee" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "registration_fee_paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_partial_fee_amount" CHECK (("students"."fee_type" = 'partial_fee') = ("students"."partial_fee_amount" is not null) and coalesce("students"."partial_fee_amount", 1) > 0);--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_registration_fee" CHECK ("students"."registration_fee" >= 0);