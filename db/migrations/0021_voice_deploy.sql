CREATE TABLE "voice_session_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "voice_session_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_id" uuid NOT NULL,
	"line" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_session_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "voice_tts_usage" (
	"month" text PRIMARY KEY NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_tts_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "voice_session_lines" ADD CONSTRAINT "voice_session_lines_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_session_lines_session_idx" ON "voice_session_lines" USING btree ("session_id");