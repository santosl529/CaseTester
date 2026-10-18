ALTER TABLE "drill_sets" ADD COLUMN "untimed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "student_drill_settings" ADD COLUMN "untimed" boolean DEFAULT false NOT NULL;