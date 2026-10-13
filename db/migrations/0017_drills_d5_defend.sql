ALTER TABLE "drill_attempts" ADD COLUMN "defend_response" jsonb;--> statement-breakpoint
ALTER TABLE "drill_attempts" ADD COLUMN "defend_time_ms" integer;--> statement-breakpoint
ALTER TABLE "drill_attempts" ADD COLUMN "defend_score" double precision;--> statement-breakpoint
ALTER TABLE "drill_attempts" ADD COLUMN "defend_check_results" jsonb;