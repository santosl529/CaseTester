CREATE TYPE "public"."diagnostic_status" AS ENUM('in_progress', 'completed', 'skipped');--> statement-breakpoint
CREATE TABLE "diagnostics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"parts" jsonb NOT NULL,
	"status" "diagnostic_status" DEFAULT 'in_progress' NOT NULL,
	"overall_score" double precision,
	"placements" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "diagnostics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "diagnostics_student_idx" ON "diagnostics" USING btree ("student_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "diagnostics_one_in_progress" ON "diagnostics" USING btree ("student_id") WHERE "diagnostics"."status" = 'in_progress';