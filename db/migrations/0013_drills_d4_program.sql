CREATE TYPE "public"."program_status" AS ENUM('active', 'completed', 'switched');--> statement-breakpoint
CREATE TYPE "public"."program_track" AS ENUM('foundations', 'standard', 'sprint', 'self_directed');--> statement-breakpoint
CREATE TYPE "public"."workout_status" AS ENUM('planned', 'in_progress', 'completed', 'expired');--> statement-breakpoint
CREATE TABLE "lesson_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"lesson_id" text NOT NULL,
	"version" integer NOT NULL,
	"source" text NOT NULL,
	"seconds_open" integer,
	"skipped" boolean DEFAULT false NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lessons" (
	"lesson_id" text NOT NULL,
	"version" integer NOT NULL,
	"skill_id" text NOT NULL,
	"status" "drill_item_status" DEFAULT 'draft' NOT NULL,
	"body" text NOT NULL,
	"worked_example" text NOT NULL,
	"mistakes" jsonb NOT NULL,
	"authorship" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_lesson_id_version_pk" PRIMARY KEY("lesson_id","version")
);
--> statement-breakpoint
ALTER TABLE "lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"track" "program_track" NOT NULL,
	"plan_version" text NOT NULL,
	"start_date" date NOT NULL,
	"interview_date" date,
	"workouts_per_week" integer,
	"cases_done" text,
	"status" "program_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "student_programs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"program_id" uuid,
	"program_week" integer,
	"date" date NOT NULL,
	"target_minutes" integer NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "workout_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drill_items" ADD COLUMN "stage" text;--> statement-breakpoint
ALTER TABLE "drill_items" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "drill_sets" ADD COLUMN "workout_id" uuid;--> statement-breakpoint
ALTER TABLE "drill_sets" ADD COLUMN "slot" text;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_program_id_student_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."student_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_views_student_idx" ON "lesson_views" USING btree ("student_id","viewed_at");--> statement-breakpoint
CREATE INDEX "lessons_skill_idx" ON "lessons" USING btree ("skill_id","status");--> statement-breakpoint
CREATE INDEX "student_programs_student_idx" ON "student_programs" USING btree ("student_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "student_programs_one_active" ON "student_programs" USING btree ("student_id") WHERE "student_programs"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "workouts_student_date" ON "workouts" USING btree ("student_id","date");