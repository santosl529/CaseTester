ALTER TABLE "drill_grading_spend" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "drill_sets" ADD COLUMN "feedback_mode" text;--> statement-breakpoint
ALTER TABLE "grading_jobs" ADD COLUMN "attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "student_drill_settings" ADD COLUMN "feedback_mode" text;--> statement-breakpoint
ALTER TABLE "grading_jobs" ADD CONSTRAINT "grading_jobs_attempt_id_drill_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."drill_attempts"("id") ON DELETE cascade ON UPDATE no action;