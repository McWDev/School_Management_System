CREATE TYPE "public"."staff_gender" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."staff_status" AS ENUM('active', 'left');--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"work_type_id" uuid NOT NULL,
	"gender" "staff_gender",
	"date_of_birth" date,
	"phone" text,
	"email" text,
	"address" text,
	"location" text,
	"hire_date" date,
	"status" "staff_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "staff_photos" (
	"staff_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_photos_content_type" CHECK ("staff_photos"."content_type" in ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "staff_photos_size" CHECK ("staff_photos"."byte_size" > 0 and "staff_photos"."byte_size" <= 1048576)
);
--> statement-breakpoint
CREATE TABLE "work_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_types_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_work_type_fk" FOREIGN KEY ("tenant_id","work_type_id") REFERENCES "public"."work_types"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_photos" ADD CONSTRAINT "staff_photos_staff_fk" FOREIGN KEY ("tenant_id","staff_id") REFERENCES "public"."staff"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_types" ADD CONSTRAINT "work_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_tenant_status_idx" ON "staff" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "staff_work_type_idx" ON "staff" USING btree ("work_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_types_tenant_name_unique" ON "work_types" USING btree ("tenant_id",lower("name"));