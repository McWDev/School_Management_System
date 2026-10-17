DROP INDEX "classes_tenant_grade_idx";--> statement-breakpoint
CREATE INDEX "classes_tenant_status_idx" ON "classes" USING btree ("tenant_id","status");--> statement-breakpoint
ALTER TABLE "classes" DROP COLUMN "grade";