CREATE TYPE "public"."attempt_grading_status" AS ENUM('not_needed', 'pending', 'graded', 'delayed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."drill_set_source" AS ENUM('prescription', 'continue', 'specific', 'review', 'diagnostic');--> statement-breakpoint
CREATE TYPE "public"."drill_set_status" AS ENUM('in_progress', 'grading', 'completed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."grading_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."drill_item_status" AS ENUM('draft', 'in_review', 'live', 'retired');--> statement-breakpoint
CREATE TYPE "public"."prescription_source" AS ENUM('case', 'drill');--> statement-breakpoint
CREATE TYPE "public"."prescription_status" AS ENUM('open', 'in_progress', 'completed', 'dismissed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."skill_event_source" AS ENUM('set', 'case', 'review');--> statement-breakpoint
CREATE TYPE "public"."skill_state" AS ENUM('not_started', 'learning', 'recognizes', 'mastered', 'validated');--> statement-breakpoint
CREATE TABLE "case_results" (
	"case_attempt_id" text PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"case_id" text NOT NULL,
	"case_type" text,
	"difficulty_tier" integer NOT NULL,
	"rubric_scores" jsonb NOT NULL,
	"skills_observed" text[] NOT NULL,
	"findings" jsonb NOT NULL,
	"taxonomy_version" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "drill_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"item_id" text,
	"item_version" integer,
	"template_id" text,
	"template_version" integer,
	"seed" bigint,
	"response" jsonb,
	"served_at" timestamp with time zone NOT NULL,
	"time_ms" integer NOT NULL,
	"time_limit_ms" integer NOT NULL,
	"timed_out" boolean DEFAULT false NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"score" double precision,
	"step_scores" jsonb,
	"mistake_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"check_results" jsonb,
	"red_flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"grading_status" "attempt_grading_status" DEFAULT 'not_needed' NOT NULL,
	"grader_prompt_version" text,
	"model_id" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drill_attempts_item_ref" CHECK ((
    "drill_attempts"."item_id" is not null and "drill_attempts"."item_version" is not null
    and "drill_attempts"."template_id" is null and "drill_attempts"."template_version" is null and "drill_attempts"."seed" is null
  ) or (
    "drill_attempts"."item_id" is null and "drill_attempts"."item_version" is null
    and "drill_attempts"."template_id" is not null and "drill_attempts"."template_version" is not null and "drill_attempts"."seed" is not null
  ))
);
--> statement-breakpoint
ALTER TABLE "drill_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "drill_item_stats" (
	"item_id" text NOT NULL,
	"version" integer NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"correct_rate" double precision,
	"avg_time_ms" integer,
	"option_counts" jsonb,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drill_item_stats_item_id_version_pk" PRIMARY KEY("item_id","version")
);
--> statement-breakpoint
ALTER TABLE "drill_item_stats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "drill_items" (
	"item_id" text NOT NULL,
	"version" integer NOT NULL,
	"drill_id" text NOT NULL,
	"status" "drill_item_status" DEFAULT 'draft' NOT NULL,
	"tier" integer NOT NULL,
	"skills" text[] NOT NULL,
	"payload" jsonb NOT NULL,
	"authorship" jsonb NOT NULL,
	"taxonomy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drill_items_item_id_version_pk" PRIMARY KEY("item_id","version")
);
--> statement-breakpoint
ALTER TABLE "drill_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "drill_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"drill_id" text NOT NULL,
	"level" integer NOT NULL,
	"tier" integer NOT NULL,
	"size" integer NOT NULL,
	"source" "drill_set_source" NOT NULL,
	"prescription_id" uuid,
	"focus_tag" text,
	"status" "drill_set_status" DEFAULT 'in_progress' NOT NULL,
	"current_position" integer DEFAULT 0 NOT NULL,
	"current_served_at" timestamp with time zone,
	"set_score" double precision,
	"passed" boolean,
	"skill_scores" jsonb,
	"taxonomy_version" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "drill_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "drill_tiers" (
	"student_id" uuid NOT NULL,
	"drill_id" text NOT NULL,
	"current_tier" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drill_tiers_student_id_drill_id_pk" PRIMARY KEY("student_id","drill_id")
);
--> statement-breakpoint
ALTER TABLE "drill_tiers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "grading_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"status" "grading_job_status" DEFAULT 'queued' NOT NULL,
	"retries" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" double precision,
	"latency_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "grading_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prescriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"drill_id" text NOT NULL,
	"level" integer NOT NULL,
	"tier" integer NOT NULL,
	"focus_tag" text,
	"priority" double precision NOT NULL,
	"reason_text" text NOT NULL,
	"evidence_quote" text,
	"source_type" "prescription_source" NOT NULL,
	"source_id" text NOT NULL,
	"status" "prescription_status" DEFAULT 'open' NOT NULL,
	"taxonomy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "prescriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "skill_state_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"from_state" "skill_state" NOT NULL,
	"to_state" "skill_state" NOT NULL,
	"reason" text NOT NULL,
	"source_type" "skill_event_source" NOT NULL,
	"source_id" text NOT NULL,
	"taxonomy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_state_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "skill_states" (
	"student_id" uuid NOT NULL,
	"skill_id" text NOT NULL,
	"state" "skill_state" DEFAULT 'not_started' NOT NULL,
	"l1_passing_streak" integer DEFAULT 0 NOT NULL,
	"l2_passing_streak" integer DEFAULT 0 NOT NULL,
	"last_skill_score" double precision,
	"last_practiced_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"taxonomy_version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_states_student_id_skill_id_pk" PRIMARY KEY("student_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "skill_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_drill_settings" (
	"student_id" uuid PRIMARY KEY NOT NULL,
	"time_multiplier" double precision DEFAULT 1 NOT NULL,
	"interview_date" date,
	"skipped_examples" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_multiplier_allowed" CHECK ("student_drill_settings"."time_multiplier" in (1, 1.5, 2))
);
--> statement-breakpoint
ALTER TABLE "student_drill_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"org_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "student_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drill_attempts" ADD CONSTRAINT "drill_attempts_set_id_drill_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."drill_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_sets" ADD CONSTRAINT "drill_sets_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_jobs" ADD CONSTRAINT "grading_jobs_set_id_drill_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."drill_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_results_student_idx" ON "case_results" USING btree ("student_id","completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "drill_attempts_set_position" ON "drill_attempts" USING btree ("set_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "drill_attempts_idempotency" ON "drill_attempts" USING btree ("set_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "drill_attempts_student_idx" ON "drill_attempts" USING btree ("student_id","submitted_at");--> statement-breakpoint
CREATE INDEX "drill_attempts_item_idx" ON "drill_attempts" USING btree ("item_id","item_version");--> statement-breakpoint
CREATE INDEX "drill_items_drill_status_idx" ON "drill_items" USING btree ("drill_id","status");--> statement-breakpoint
CREATE INDEX "drill_sets_student_idx" ON "drill_sets" USING btree ("student_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "drill_sets_one_in_progress" ON "drill_sets" USING btree ("student_id") WHERE "drill_sets"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX "grading_jobs_status_idx" ON "grading_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "prescriptions_student_status_idx" ON "prescriptions" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "skill_state_events_student_idx" ON "skill_state_events" USING btree ("student_id","created_at");