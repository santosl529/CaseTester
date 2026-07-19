ALTER TABLE "scores" ADD COLUMN "data_exhibit_rating" "rating";--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "data_exhibit_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "creativity_rating" "rating";--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "creativity_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "pushback_rating" "rating";--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "pushback_evidence" jsonb;