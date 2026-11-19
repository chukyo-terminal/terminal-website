CREATE TABLE "mailbox_sync_states" (
	"mailbox_key" text PRIMARY KEY NOT NULL,
	"uid_validity" bigint,
	"last_uid" bigint DEFAULT 0 NOT NULL,
	"last_succeeded_at" timestamp (3) with time zone,
	"last_failed_at" timestamp (3) with time zone,
	"last_error" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_replies" ADD COLUMN "message_id" text;--> statement-breakpoint
ALTER TABLE "contact_replies" ADD COLUMN "from_address" text;--> statement-breakpoint
ALTER TABLE "contact_replies" ADD COLUMN "attachment_names" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_replies" ADD CONSTRAINT "contact_replies_message_id_unique" UNIQUE("message_id");--> statement-breakpoint
ALTER TABLE "contact_replies" ADD CONSTRAINT "valid_contact_reply_received_mail" CHECK ("contact_replies"."is_from_inquirer" OR ("contact_replies"."message_id" IS NULL AND "contact_replies"."from_address" IS NULL));