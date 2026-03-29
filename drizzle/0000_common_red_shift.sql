CREATE TYPE "public"."ROLE" AS ENUM('ADMIN', 'REVIEWER', 'CONTRIBUTOR');--> statement-breakpoint
CREATE TABLE "sudoers" (
	"id" integer PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cu_id" char(7) NOT NULL,
	"name" text NOT NULL,
	"display_name" text,
	"email" varchar(254),
	"roles" "ROLE"[] DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_cu_id_unique" UNIQUE("cu_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "valid_cu_id" CHECK ("users"."cu_id" ~ '^[A-Z]\d{5}[md\d]$'),
	CONSTRAINT "valid_email" CHECK ("users"."email" IS NULL OR ("users"."email" ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' AND "users"."email" NOT LIKE '%@m.chukyo-u.ac.jp'))
);
--> statement-breakpoint
ALTER TABLE "sudoers" ADD CONSTRAINT "sudoers_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;