ALTER TABLE "posts" DROP CONSTRAINT "posts_slug_unique";--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "year" integer;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_year_slug_unique" UNIQUE("year","slug");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "valid_year" CHECK ("posts"."year" IS NULL OR "posts"."year" >= 2025);