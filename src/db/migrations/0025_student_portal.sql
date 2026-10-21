ALTER TABLE "students" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_unique" UNIQUE("user_id");