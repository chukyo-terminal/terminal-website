CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"uploaded_by" integer,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valid_image_mime_type" CHECK ("images"."mime_type" IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif')),
	CONSTRAINT "valid_image_size" CHECK ("images"."size" > 0 AND "images"."size" = OCTET_LENGTH("images"."data")),
	CONSTRAINT "valid_image_dimensions" CHECK ("images"."width" > 0 AND "images"."height" > 0)
);
--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "images_created_at_index" ON "images" USING btree ("created_at");