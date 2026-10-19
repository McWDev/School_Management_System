ALTER TYPE "public"."fee_charge_kind" ADD VALUE 'other';--> statement-breakpoint
CREATE TABLE "fee_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"default_amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_types_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "fee_types_default_amount_positive" CHECK ("fee_types"."default_amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "fee_charges" ADD COLUMN "fee_type_id" uuid;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "fee_types" ADD CONSTRAINT "fee_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_types_tenant_name_unique" ON "fee_types" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_fee_type_fk" FOREIGN KEY ("tenant_id","fee_type_id") REFERENCES "public"."fee_types"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fee_charges_fee_type_idx" ON "fee_charges" USING btree ("fee_type_id");--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_fee_type_kind" CHECK (("fee_charges"."kind" in ('monthly', 'registration')) = ("fee_charges"."fee_type_id" is null and "fee_charges"."description" is null));