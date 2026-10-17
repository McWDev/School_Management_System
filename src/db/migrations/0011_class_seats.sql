ALTER TABLE "classes" ADD COLUMN "seats" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_seats_range" CHECK ("classes"."seats" between 1 and 500);