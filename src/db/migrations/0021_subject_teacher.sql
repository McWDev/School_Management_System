ALTER TABLE "subjects" ADD COLUMN "teacher_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_teacher_fk" FOREIGN KEY ("tenant_id","teacher_staff_id") REFERENCES "public"."staff"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subjects_teacher_idx" ON "subjects" USING btree ("teacher_staff_id");