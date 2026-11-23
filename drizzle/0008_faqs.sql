CREATE TABLE "faq_categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "faq_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faq_categories_title_unique" UNIQUE("title")
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "faqs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"category_id" integer NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_category_id_faq_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."faq_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faqs_category_id_index" ON "faqs" USING btree ("category_id","sort_order");