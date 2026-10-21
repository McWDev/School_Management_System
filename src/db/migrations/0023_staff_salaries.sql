CREATE TABLE "payroll_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"month" date NOT NULL,
	"base_salary" numeric(12, 2) NOT NULL,
	"bonus" numeric(12, 2) DEFAULT '0' NOT NULL,
	"deduction" numeric(12, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_entries_staff_month_unique" UNIQUE("staff_id","month"),
	CONSTRAINT "payroll_entries_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "payroll_entries_base_salary_positive" CHECK ("payroll_entries"."base_salary" > 0),
	CONSTRAINT "payroll_entries_bonus_not_negative" CHECK ("payroll_entries"."bonus" >= 0),
	CONSTRAINT "payroll_entries_deduction_range" CHECK ("payroll_entries"."deduction" >= 0),
	CONSTRAINT "payroll_entries_net_not_negative" CHECK ("payroll_entries"."base_salary" + "payroll_entries"."bonus" - "payroll_entries"."deduction" >= 0),
	CONSTRAINT "payroll_entries_month_first_day" CHECK (extract(day from "payroll_entries"."month") = 1)
);
--> statement-breakpoint
CREATE TABLE "payslip_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"payslip_number" text NOT NULL,
	"payment_date" date NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"amount" numeric(12, 2) NOT NULL,
	"status" "payment_status" DEFAULT 'valid' NOT NULL,
	"recorded_by_user_id" uuid,
	"reversed_at" timestamp with time zone,
	"reversed_by_user_id" uuid,
	"reversal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_payments_tenant_payslip_unique" UNIQUE("tenant_id","payslip_number"),
	CONSTRAINT "salary_payments_amount_positive" CHECK ("salary_payments"."amount" > 0),
	CONSTRAINT "salary_payments_reversal" CHECK (("salary_payments"."status" = 'reversed') = ("salary_payments"."reversed_at" is not null and "salary_payments"."reversal_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "salary" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_staff_fk" FOREIGN KEY ("tenant_id","staff_id") REFERENCES "public"."staff"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_counters" ADD CONSTRAINT "payslip_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_reversed_by_user_id_users_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_entry_fk" FOREIGN KEY ("tenant_id","entry_id") REFERENCES "public"."payroll_entries"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payroll_entries_tenant_month_idx" ON "payroll_entries" USING btree ("tenant_id","month");--> statement-breakpoint
CREATE INDEX "salary_payments_entry_idx" ON "salary_payments" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "salary_payments_tenant_date_idx" ON "salary_payments" USING btree ("tenant_id","payment_date");--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_salary_positive" CHECK ("staff"."salary" is null or "staff"."salary" > 0);