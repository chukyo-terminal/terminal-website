CREATE TABLE "post_review_actions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "post_review_actions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"request_id" integer NOT NULL,
	"stage" integer NOT NULL,
	"reviewer_cu_id" char(7) NOT NULL,
	"reviewer_name" text NOT NULL,
	"is_approved" boolean NOT NULL,
	"comment" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_review_actions_request_stage_unique" UNIQUE("request_id","stage"),
	CONSTRAINT "valid_review_action_comment" CHECK ("post_review_actions"."is_approved" OR ("post_review_actions"."comment" IS NOT NULL AND "post_review_actions"."comment" <> ''))
);
--> statement-breakpoint
CREATE TABLE "post_review_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "post_review_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"post_id" integer NOT NULL,
	"post_identifier" integer NOT NULL,
	"requested_by" integer NOT NULL,
	"route" text NOT NULL,
	"division_dn" text,
	"division_name" text,
	"stage" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp (3) with time zone,
	CONSTRAINT "valid_review_request_route" CHECK ("post_review_requests"."route" IN ('ordinary', 'organizational')),
	CONSTRAINT "valid_review_request_stage" CHECK ("post_review_requests"."stage" IN (1, 2)),
	CONSTRAINT "valid_review_request_status" CHECK ("post_review_requests"."status" IN ('pending', 'approved', 'rejected', 'withdrawn', 'invalidated')),
	CONSTRAINT "valid_review_request_division" CHECK ("post_review_requests"."route" = 'organizational' OR "post_review_requests"."division_dn" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "post_review_actions" ADD CONSTRAINT "post_review_actions_request_id_post_review_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."post_review_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_review_requests" ADD CONSTRAINT "post_review_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_review_requests" ADD CONSTRAINT "post_review_requests_post_id_post_identifier_post_contents_post_id_identifier_fk" FOREIGN KEY ("post_id","post_identifier") REFERENCES "public"."post_contents"("post_id","identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_review_requests_post_index" ON "post_review_requests" USING btree ("post_id","post_identifier");