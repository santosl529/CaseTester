CREATE TYPE "public"."drill_checkin_kind" AS ENUM('set_usefulness', 'first_case', 'week_1');--> statement-breakpoint
CREATE TYPE "public"."drill_checkin_status" AS ENUM('shown', 'answered', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."drill_feedback_category" AS ENUM('broken', 'confusing', 'idea');--> statement-breakpoint
CREATE TYPE "public"."drill_report_reason" AS ENUM('answer_key_wrong', 'question_confusing', 'grade_unfair', 'other');--> statement-breakpoint
CREATE TYPE "public"."drill_report_status" AS ENUM('open', 'labeled', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TABLE "drill_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"kind" "drill_checkin_kind" NOT NULL,
	"set_id" uuid,
	"rating" integer,
	"comment" text,
	"status" "drill_checkin_status" DEFAULT 'shown' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	CONSTRAINT "drill_checkins_rating" CHECK ("drill_checkins"."rating" is null or "drill_checkins"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "drill_checkins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "drill_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"category" "drill_feedback_category" NOT NULL,
	"comment" text,
	"page" text NOT NULL,
	"set_id" uuid,
	"position" integer,
	"item_id" text,
	"item_version" integer,
	"template_id" text,
	"device" text,
	"app_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drill_feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "drill_item_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"attempt_id" uuid,
	"item_id" text,
	"item_version" integer,
	"template_id" text,
	"screen" text NOT NULL,
	"reason" "drill_report_reason" NOT NULL,
	"comment" text,
	"status" "drill_report_status" DEFAULT 'open' NOT NULL,
	"labels" jsonb,
	"red_flags" jsonb,
	"reviewer_notes" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"exported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drill_item_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drill_checkins" ADD CONSTRAINT "drill_checkins_set_id_drill_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."drill_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_feedback" ADD CONSTRAINT "drill_feedback_set_id_drill_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."drill_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_item_reports" ADD CONSTRAINT "drill_item_reports_set_id_drill_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."drill_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_item_reports" ADD CONSTRAINT "drill_item_reports_attempt_id_drill_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."drill_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drill_checkins_student_idx" ON "drill_checkins" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "drill_checkins_once" ON "drill_checkins" USING btree ("student_id","kind") WHERE "drill_checkins"."kind" <> 'set_usefulness';--> statement-breakpoint
CREATE UNIQUE INDEX "drill_checkins_per_set" ON "drill_checkins" USING btree ("student_id","set_id") WHERE "drill_checkins"."kind" = 'set_usefulness';--> statement-breakpoint
CREATE INDEX "drill_feedback_created_idx" ON "drill_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "drill_item_reports_status_idx" ON "drill_item_reports" USING btree ("status","created_at");