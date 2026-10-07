ALTER TABLE "drill_items" ADD COLUMN "is_example" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drill_sets" ADD COLUMN "focus_skill" text;--> statement-breakpoint
ALTER TABLE "drill_sets" ADD COLUMN "item_plan" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "drill_sets" ADD COLUMN "pending_step" jsonb;