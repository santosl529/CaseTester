CREATE TYPE "public"."phase" AS ENUM('INTRO', 'CLARIFY', 'STRUCTURE', 'ANALYSIS', 'EXHIBIT', 'BRAINSTORM', 'RECOMMENDATION', 'WRAP', 'SCORING');--> statement-breakpoint
CREATE TYPE "public"."rating" AS ENUM('needs_work', 'meets_bar', 'strong');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"user_id" uuid,
	"event_type" text NOT NULL,
	"payload_jsonb" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"firm_style" text NOT NULL,
	"difficulty" text NOT NULL,
	"prompt" text NOT NULL,
	"content_jsonb" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exhibits_shown" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"exhibit_id" text NOT NULL,
	"shown_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revealed_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"ledger_item_id" text NOT NULL,
	"revealed_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"structure_rating" "rating",
	"structure_evidence" jsonb,
	"quantitative_rating" "rating",
	"quantitative_evidence" jsonb,
	"judgment_rating" "rating",
	"judgment_evidence" jsonb,
	"communication_rating" "rating",
	"communication_evidence" jsonb,
	"synthesis_rating" "rating",
	"synthesis_evidence" jsonb,
	"overall_rating" "rating",
	"top_fix" text,
	"deterministic_jsonb" jsonb,
	"model_answer_jsonb" jsonb,
	"scoring_runtime_ms" bigint,
	"judge_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"turn_index" integer NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"timestamp_ms" bigint NOT NULL,
	"latency_ms" bigint
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"case_id" text NOT NULL,
	"phase" "phase" DEFAULT 'INTRO' NOT NULL,
	"elapsed_ms" bigint DEFAULT 0 NOT NULL,
	"phase_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "session_status" DEFAULT 'active' NOT NULL,
	"abandon_phase" "phase",
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"flags_jsonb" jsonb DEFAULT '{"stalled":false,"ranLong":false,"askedRepeat":false,"offTopicCount":0,"pushbackDone":false}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exhibits_shown" ADD CONSTRAINT "exhibits_shown_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revealed_data" ADD CONSTRAINT "revealed_data_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_turns" ADD CONSTRAINT "session_turns_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revealed_session_idx" ON "revealed_data" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "turns_session_idx" ON "session_turns" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");