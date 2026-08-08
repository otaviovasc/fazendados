ALTER TABLE "assistant_capture_attachments"
  ADD COLUMN "name" text DEFAULT 'Arquivo sem nome' NOT NULL,
  ADD COLUMN "category" text DEFAULT 'outro' NOT NULL,
  ADD COLUMN "deleted_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "assistant_capture_attachments_gallery_idx"
  ON "assistant_capture_attachments" USING btree ("farm_id", "category", "deleted_at");
