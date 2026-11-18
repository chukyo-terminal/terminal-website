CREATE TABLE "post_comments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "post_comments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"post_id" integer NOT NULL,
	"thread_id" integer,
	"parent_id" integer,
	"author_id" integer,
	"author_name" text,
	"author_email" varchar(254),
	"visitor_id" uuid,
	"content" text NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valid_comment_thread" CHECK ("post_comments"."thread_id" IS NOT NULL OR "post_comments"."parent_id" IS NULL),
	CONSTRAINT "valid_comment_staff" CHECK ("post_comments"."author_id" IS NULL OR "post_comments"."thread_id" IS NOT NULL),
	CONSTRAINT "valid_comment_visitor" CHECK (("post_comments"."author_id" IS NULL) = ("post_comments"."visitor_id" IS NOT NULL)),
	CONSTRAINT "valid_comment_author_email" CHECK (("post_comments"."author_id" IS NULL) = ("post_comments"."author_email" IS NOT NULL)),
	CONSTRAINT "valid_comment_author_name" CHECK ("post_comments"."author_id" IS NULL OR "post_comments"."author_name" IS NULL),
	CONSTRAINT "valid_comment_email" CHECK ("post_comments"."author_email" IS NULL OR "post_comments"."author_email" ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);
--> statement-breakpoint
CREATE TABLE "post_ratings" (
	"post_id" integer NOT NULL,
	"visitor_id" uuid NOT NULL,
	"is_positive" boolean NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_ratings_post_id_visitor_id_pk" PRIMARY KEY("post_id","visitor_id")
);
--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."post_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."post_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_ratings" ADD CONSTRAINT "post_ratings_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_comments_post_id_index" ON "post_comments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_comments_thread_id_index" ON "post_comments" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "post_comments_parent_id_index" ON "post_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "post_comments_visitor_id_index" ON "post_comments" USING btree ("visitor_id","created_at");