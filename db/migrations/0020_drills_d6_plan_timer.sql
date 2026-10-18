ALTER TYPE "public"."prescription_source" ADD VALUE 'questionnaire';--> statement-breakpoint
CREATE TABLE "drill_questionnaires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"ratings" jsonb NOT NULL,
	"hardest" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drill_questionnaires" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drill_sets" ADD COLUMN "timer_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drill_sets" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drill_sets" ADD COLUMN "paused_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "drill_sets" ADD COLUMN "is_placement_check" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "student_drill_settings" ADD COLUMN "hide_timer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "student_programs" ADD COLUMN "plan_source" text;--> statement-breakpoint
ALTER TABLE "student_programs" ADD COLUMN "plan_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "student_programs" ADD COLUMN "plan_seen_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "drill_questionnaires_student_idx" ON "drill_questionnaires" USING btree ("student_id","created_at");