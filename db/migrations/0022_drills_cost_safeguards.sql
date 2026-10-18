CREATE TABLE "drill_grading_calls" (
	"attempt_id" uuid NOT NULL,
	"call" text NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drill_grading_calls_attempt_id_call_pk" PRIMARY KEY("attempt_id","call")
);
--> statement-breakpoint
ALTER TABLE "drill_grading_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "drill_grading_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"job_id" uuid,
	"attempt_id" uuid,
	"call" text NOT NULL,
	"model_id" text NOT NULL,
	"outcome" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drill_grading_spend" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drill_attempts" ADD COLUMN "grading_issue" text;--> statement-breakpoint
ALTER TABLE "drill_grading_calls" ADD CONSTRAINT "drill_grading_calls_attempt_id_drill_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."drill_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_grading_spend" ADD CONSTRAINT "drill_grading_spend_set_id_drill_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."drill_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_grading_spend" ADD CONSTRAINT "drill_grading_spend_job_id_grading_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."grading_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_grading_spend" ADD CONSTRAINT "drill_grading_spend_attempt_id_drill_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."drill_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drill_grading_spend_created_idx" ON "drill_grading_spend" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "drill_grading_spend_set_idx" ON "drill_grading_spend" USING btree ("set_id");