ALTER TABLE "assistant_capture_attachments"
  ADD COLUMN "source_attachment_id" text;
--> statement-breakpoint
CREATE INDEX "assistant_capture_attachments_source_idx"
  ON "assistant_capture_attachments" USING btree ("farm_id", "source_attachment_id");
