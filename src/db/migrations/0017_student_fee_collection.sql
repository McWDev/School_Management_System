CREATE TYPE "public"."fee_charge_kind" AS ENUM('monthly', 'registration');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'mobile_money', 'bank_transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('valid', 'reversed');--> statement-breakpoint
CREATE TABLE "fee_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"kind" "fee_charge_kind" NOT NULL,
	"month" date,
	"academic_year_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"created_by_user_id" uuid,
	"waived_at" timestamp with time zone,
	"waived_by_user_id" uuid,
	"waive_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_charges_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "fee_charges_amount_positive" CHECK ("fee_charges"."amount" > 0),
	CONSTRAINT "fee_charges_month_kind" CHECK (("fee_charges"."kind" = 'monthly') = ("fee_charges"."month" is not null) and ("fee_charges"."month" is null or extract(day from "fee_charges"."month") = 1)),
	CONSTRAINT "fee_charges_waive_reason" CHECK (("fee_charges"."waived_at" is null) = ("fee_charges"."waive_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "fee_payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	CONSTRAINT "fee_payment_allocations_payment_charge_unique" UNIQUE("payment_id","charge_id"),
	CONSTRAINT "fee_payment_allocations_amount_positive" CHECK ("fee_payment_allocations"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "fee_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"receipt_number" text NOT NULL,
	"payment_date" date NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"notes" text,
	"amount" numeric(12, 2) NOT NULL,
	"status" "payment_status" DEFAULT 'valid' NOT NULL,
	"recorded_by_user_id" uuid,
	"reversed_at" timestamp with time zone,
	"reversed_by_user_id" uuid,
	"reversal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_payments_tenant_receipt_unique" UNIQUE("tenant_id","receipt_number"),
	CONSTRAINT "fee_payments_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "fee_payments_amount_positive" CHECK ("fee_payments"."amount" > 0),
	CONSTRAINT "fee_payments_reversal" CHECK (("fee_payments"."status" = 'reversed') = ("fee_payments"."reversed_at" is not null and "fee_payments"."reversal_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "fee_receipt_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_waived_by_user_id_users_id_fk" FOREIGN KEY ("waived_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_year_fk" FOREIGN KEY ("tenant_id","academic_year_id") REFERENCES "public"."academic_years"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payment_allocations" ADD CONSTRAINT "fee_payment_allocations_payment_fk" FOREIGN KEY ("tenant_id","payment_id") REFERENCES "public"."fee_payments"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payment_allocations" ADD CONSTRAINT "fee_payment_allocations_charge_fk" FOREIGN KEY ("tenant_id","charge_id") REFERENCES "public"."fee_charges"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_reversed_by_user_id_users_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_receipt_counters" ADD CONSTRAINT "fee_receipt_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_charges_student_month_unique" ON "fee_charges" USING btree ("student_id","month") WHERE "fee_charges"."kind" = 'monthly';--> statement-breakpoint
CREATE UNIQUE INDEX "fee_charges_student_registration_unique" ON "fee_charges" USING btree ("student_id") WHERE "fee_charges"."kind" = 'registration';--> statement-breakpoint
CREATE INDEX "fee_charges_tenant_month_idx" ON "fee_charges" USING btree ("tenant_id","month");--> statement-breakpoint
CREATE INDEX "fee_payment_allocations_charge_idx" ON "fee_payment_allocations" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "fee_payments_tenant_date_idx" ON "fee_payments" USING btree ("tenant_id","payment_date");--> statement-breakpoint
CREATE INDEX "fee_payments_student_idx" ON "fee_payments" USING btree ("student_id");