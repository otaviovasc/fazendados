ALTER TABLE "assistant_captures" ALTER COLUMN "text" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "assistant_captures" ADD COLUMN "extracted_text" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;
--> statement-breakpoint
UPDATE "users" SET "username" = 'legacy_' || "id" WHERE "username" IS NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");
--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_captures_farm_id_id_unique" ON "assistant_captures" USING btree ("farm_id","id");
--> statement-breakpoint
CREATE TABLE "assistant_capture_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"capture_id" text NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "assistant_capture_attachments_byte_size_nonnegative" CHECK ("byte_size" >= 0),
	CONSTRAINT "assistant_capture_attachments_duration_ms_nonnegative" CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "assistant_capture_attachments" ADD CONSTRAINT "assistant_capture_attachments_farm_capture_fk"
	FOREIGN KEY ("farm_id","capture_id") REFERENCES "public"."assistant_captures"("farm_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "assistant_capture_attachments_farm_capture_idx" ON "assistant_capture_attachments" USING btree ("farm_id","capture_id");
