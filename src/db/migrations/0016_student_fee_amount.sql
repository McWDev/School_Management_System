-- The fee amount now applies to Full Payment and Partial Fee (product owner, 2026-10-18).
ALTER TABLE "students" DROP CONSTRAINT "students_partial_fee_amount";--> statement-breakpoint
ALTER TABLE "students" RENAME COLUMN "partial_fee_amount" TO "fee_amount";--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_fee_amount" CHECK (("students"."fee_type" <> 'full_scholarship' or "students"."fee_amount" is null) and coalesce("students"."fee_amount", 1) > 0);
