CREATE TYPE "public"."tenant_status" AS ENUM('pending', 'active', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."branch_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_code" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"logo_url" text,
	"contact_email" text,
	"phone" text,
	"address" text,
	"currency_code" text NOT NULL,
	"timezone" text NOT NULL,
	"status" "tenant_status" DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"status_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_school_code_unique" UNIQUE("school_code"),
	CONSTRAINT "tenants_school_code_format" CHECK (school_code ~ '^[A-Z0-9][A-Z0-9-]{0,19}$'),
	CONSTRAINT "tenants_currency_code_format" CHECK ("tenants"."currency_code" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"status" "branch_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_tenant_code_unique" UNIQUE("tenant_id","branch_code"),
	CONSTRAINT "branches_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "branches_branch_code_format" CHECK (branch_code ~ '^[A-Z0-9][A-Z0-9-]{0,19}$')
);
--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "branches_tenant_status_idx" ON "branches" USING btree ("tenant_id","status");