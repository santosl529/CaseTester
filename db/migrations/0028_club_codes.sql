CREATE TABLE "club_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"club_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "club_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clubs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "club_codes" ADD CONSTRAINT "club_codes_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_codes_club_idx" ON "club_codes" USING btree ("club_id");--> statement-breakpoint
-- Data (14 Nov): profiles stored the code itself; from now on they store the club. Every code already on a profile
-- becomes a club of its own (id = the code lower-cased) that keeps accepting that code, and its profiles move to the
-- club, so nobody is asked for a code again. The test clubs the drills smoke and a11y scripts write (no codes) stay
-- switched on. New clubs and their codes are added with `npm run clubs`, never here: codes stay out of git.
INSERT INTO "clubs" ("id", "name") VALUES ('smoke-test', 'Smoke test'), ('a11y-test', 'Accessibility test') ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "clubs" ("id", "name")
  SELECT DISTINCT lower("org_id"), "org_id" FROM "student_profiles"
  WHERE "org_id" IS NOT NULL AND "org_id" NOT IN ('smoke-test', 'a11y-test')
  ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "club_codes" ("code", "club_id")
  SELECT DISTINCT upper("org_id"), lower("org_id") FROM "student_profiles"
  WHERE "org_id" IS NOT NULL AND "org_id" NOT IN ('smoke-test', 'a11y-test')
  ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "student_profiles" SET "org_id" = lower("org_id")
  WHERE "org_id" IS NOT NULL AND "org_id" NOT IN ('smoke-test', 'a11y-test');
