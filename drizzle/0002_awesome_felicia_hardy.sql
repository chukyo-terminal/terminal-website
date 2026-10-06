CREATE TABLE "contact_replies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contact_replies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"contact_id" integer NOT NULL,
	"author_id" integer,
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contacts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"email" varchar(254) NOT NULL,
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"assigned_to" integer,
	"completed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP VIEW "public"."published_posts_view";--> statement-breakpoint
ALTER TABLE "contact_replies" ADD CONSTRAINT "contact_replies_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_replies" ADD CONSTRAINT "contact_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE VIEW "public"."published_posts_view" AS (select distinct on ("posts"."id") "posts"."id", "posts"."slug", "users"."id" as "author_id", "users"."name" as "author_name", "users"."display_name" as "author_display_name", "post_contents"."title" as "title", "post_contents"."description" as "description", "post_contents"."content" as "content", "tag_agg", "original_post_contents"."published_at", "post_contents"."published_at" as "updated_at", "has_draft" from "posts" inner join "users" on "posts"."author_id" = "users"."id" inner join "post_contents" on "posts"."id" = "post_contents"."post_id" left join lateral (select COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('name', "tags"."name", 'slug', "tags"."slug")), '[]'::JSONB) as "tag_agg" from "post_tags" inner join "tags" on "post_tags"."tag_id" = "tags"."id" where "post_tags"."post_id" = "posts"."id") "tags" on TRUE left join lateral (select "published_at" from "post_contents" where "post_contents"."post_id" = "posts"."id" order by "post_contents"."identifier" asc limit 1) "original_post_contents" on TRUE left join lateral (select "published_at" is null as "has_draft" from "post_contents" where "post_contents"."post_id" = "posts"."id" order by "post_contents"."identifier" desc limit 1) "draft_query" on TRUE where ("posts"."is_private" <> true and "post_contents"."is_private" <> true and "post_contents"."published_at" is not null) order by "posts"."id" desc, "post_contents"."identifier" desc);