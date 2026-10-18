ALTER TYPE "public"."drill_set_source" ADD VALUE 'plan';--> statement-breakpoint
ALTER TYPE "public"."prescription_source" ADD VALUE 'diagnostic';--> statement-breakpoint
ALTER TYPE "public"."prescription_source" ADD VALUE 'plan';--> statement-breakpoint
ALTER TYPE "public"."prescription_status" ADD VALUE 'paused';--> statement-breakpoint
ALTER TYPE "public"."skill_state" ADD VALUE 'practiced' BEFORE 'mastered';--> statement-breakpoint
ALTER TABLE "drill_sets" ADD COLUMN "stage" text;--> statement-breakpoint
ALTER TABLE "drill_sets" ADD COLUMN "is_transfer_check" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "stage" text;--> statement-breakpoint
ALTER TABLE "skill_states" ADD COLUMN "stage" text;--> statement-breakpoint
ALTER TABLE "skill_states" ADD COLUMN "practiced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "skill_states" ADD COLUMN "transfer_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "skill_states" ADD COLUMN "low_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_states" ADD COLUMN "repair_sets" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_states" ADD COLUMN "paused_for_prereq" text;--> statement-breakpoint
ALTER TABLE "skill_states" ADD COLUMN "prereq_sets" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_states" ADD COLUMN "next_focus_tag" text;