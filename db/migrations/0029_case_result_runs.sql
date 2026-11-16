CREATE TABLE "case_result_runs" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"case_id" text NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"tagger_config" text,
	"points" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload" jsonb,
	"preview" jsonb,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_usd" double precision,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "case_result_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "case_results" ADD COLUMN "retake" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "case_results" ADD COLUMN "partial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "case_results" ADD COLUMN "backfilled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "case_results" ADD COLUMN "next_steps" jsonb;--> statement-breakpoint
ALTER TABLE "case_result_runs" ADD CONSTRAINT "case_result_runs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_result_runs_created_idx" ON "case_result_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "case_result_runs_student_idx" ON "case_result_runs" USING btree ("student_id");