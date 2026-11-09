ALTER TABLE "drill_grading_spend" DROP CONSTRAINT "drill_grading_spend_set_id_drill_sets_id_fk";
--> statement-breakpoint
ALTER TABLE "drill_grading_spend" DROP CONSTRAINT "drill_grading_spend_job_id_grading_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "drill_grading_spend" DROP CONSTRAINT "drill_grading_spend_attempt_id_drill_attempts_id_fk";
--> statement-breakpoint
ALTER TABLE "drill_grading_spend" ALTER COLUMN "set_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "drill_grading_spend" ADD CONSTRAINT "drill_grading_spend_set_id_drill_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."drill_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_grading_spend" ADD CONSTRAINT "drill_grading_spend_job_id_grading_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."grading_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_grading_spend" ADD CONSTRAINT "drill_grading_spend_attempt_id_drill_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."drill_attempts"("id") ON DELETE set null ON UPDATE no action;