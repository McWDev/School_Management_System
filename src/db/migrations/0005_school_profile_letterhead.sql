CREATE TABLE "school_logos" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_logos_content_type" CHECK ("school_logos"."content_type" in ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "school_logos_size" CHECK ("school_logos"."byte_size" > 0 and "school_logos"."byte_size" <= 1048576)
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "manager_name" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "motto" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "school_logos" ADD CONSTRAINT "school_logos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;