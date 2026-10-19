CREATE TABLE "subject_number_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DROP INDEX "subjects_tenant_code_unique";--> statement-breakpoint
-- Codes are now automatic (product owner, 2026-10-19): existing subjects get
-- SUB-001, SUB-002, … per school in the order they were added.
UPDATE "subjects" SET "code" = 'SUB-' || lpad("numbered"."n"::text, 3, '0')
FROM (
	SELECT "id", row_number() OVER (PARTITION BY "tenant_id" ORDER BY "created_at", "id") AS "n"
	FROM "subjects"
) AS "numbered"
WHERE "numbered"."id" = "subjects"."id";--> statement-breakpoint
INSERT INTO "subject_number_counters" ("tenant_id", "last_number")
SELECT "tenant_id", count(*) FROM "subjects" GROUP BY "tenant_id";--> statement-breakpoint
ALTER TABLE "subjects" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subject_number_counters" ADD CONSTRAINT "subject_number_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenant_code_unique" UNIQUE("tenant_id","code");
