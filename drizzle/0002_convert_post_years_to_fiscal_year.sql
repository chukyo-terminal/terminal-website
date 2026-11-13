UPDATE "posts"
SET "year" = EXTRACT(YEAR FROM "post_contents"."published_at")::integer
  - CASE WHEN EXTRACT(MONTH FROM "post_contents"."published_at") < 4 THEN 1 ELSE 0 END
FROM (
  SELECT "post_id", MIN("published_at") AS "published_at"
  FROM "post_contents"
  WHERE "published_at" IS NOT NULL
  GROUP BY "post_id"
) AS "post_contents"
WHERE "posts"."id" = "post_contents"."post_id";
