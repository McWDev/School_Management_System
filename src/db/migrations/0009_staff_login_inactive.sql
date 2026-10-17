ALTER TYPE "public"."staff_status" ADD VALUE 'inactive' BEFORE 'left';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_format" CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,39}$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_login_identifier" CHECK ("users"."email" is not null or "users"."username" is not null);