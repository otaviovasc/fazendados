CREATE TABLE "animal_group_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"animal_id" text NOT NULL,
	"group_id" text NOT NULL,
	"start" date NOT NULL,
	"end" date
);
--> statement-breakpoint
CREATE TABLE "animals" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"tag" text,
	"status" text NOT NULL,
	"archived_at" date,
	"archive_reason" text
);
--> statement-breakpoint
CREATE TABLE "assistant_captures" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"capture_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"fields" jsonb NOT NULL,
	"consequences" jsonb NOT NULL,
	"issues" jsonb NOT NULL,
	"status" text NOT NULL,
	"dismiss_reason" text,
	"confirmed_record_ids" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"description" text NOT NULL,
	"before" text,
	"after" text,
	"reason" text,
	"origin" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_milk_productions" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"date" date NOT NULL,
	"liters" numeric(10, 1) NOT NULL,
	"origin" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"item_id" text NOT NULL,
	"date" date NOT NULL,
	"quantity" numeric(12, 1) NOT NULL,
	"origin" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "feed_items" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feeding_event_items" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"item_id" text NOT NULL,
	"quantity" numeric(12, 1) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feeding_events" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"group_id" text NOT NULL,
	"date" date NOT NULL,
	"origin" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"date" date NOT NULL,
	"due_date" date,
	"settled_at" date,
	"origin" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "herd_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"milkings_per_day" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"farm_id" text NOT NULL,
	"key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_farm_id_key_pk" PRIMARY KEY("farm_id","key")
);
--> statement-breakpoint
CREATE TABLE "individual_milk_measurements" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"liters" numeric(6, 1) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installations" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"point" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milk_collections" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"date" date NOT NULL,
	"time" text NOT NULL,
	"liters" numeric(10, 1) NOT NULL,
	"origin" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milk_control_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"date" date NOT NULL,
	"group_id" text NOT NULL,
	"shift" text NOT NULL,
	"status" text NOT NULL,
	"origin" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pasture_occupancies" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"pasture_id" text NOT NULL,
	"start" date NOT NULL,
	"end" date
);
--> statement-breakpoint
CREATE TABLE "pastures" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"polygon" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "animal_group_assignments" ADD CONSTRAINT "animal_group_assignments_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_group_assignments" ADD CONSTRAINT "animal_group_assignments_group_id_herd_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."herd_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_captures" ADD CONSTRAINT "assistant_captures_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_capture_id_assistant_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."assistant_captures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_milk_productions" ADD CONSTRAINT "daily_milk_productions_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_entries" ADD CONSTRAINT "feed_entries_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_entries" ADD CONSTRAINT "feed_entries_item_id_feed_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."feed_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeding_event_items" ADD CONSTRAINT "feeding_event_items_event_id_feeding_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."feeding_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeding_event_items" ADD CONSTRAINT "feeding_event_items_item_id_feed_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."feed_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeding_events" ADD CONSTRAINT "feeding_events_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeding_events" ADD CONSTRAINT "feeding_events_group_id_herd_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."herd_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "herd_groups" ADD CONSTRAINT "herd_groups_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individual_milk_measurements" ADD CONSTRAINT "individual_milk_measurements_session_id_milk_control_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."milk_control_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individual_milk_measurements" ADD CONSTRAINT "individual_milk_measurements_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milk_collections" ADD CONSTRAINT "milk_collections_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milk_control_sessions" ADD CONSTRAINT "milk_control_sessions_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milk_control_sessions" ADD CONSTRAINT "milk_control_sessions_group_id_herd_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."herd_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pasture_occupancies" ADD CONSTRAINT "pasture_occupancies_group_id_herd_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."herd_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pasture_occupancies" ADD CONSTRAINT "pasture_occupancies_pasture_id_pastures_id_fk" FOREIGN KEY ("pasture_id") REFERENCES "public"."pastures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pastures" ADD CONSTRAINT "pastures_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_animal_open_idx" ON "animal_group_assignments" USING btree ("animal_id","end");--> statement-breakpoint
CREATE INDEX "assignments_group_open_idx" ON "animal_group_assignments" USING btree ("group_id","end");--> statement-breakpoint
CREATE INDEX "animals_farm_id_idx" ON "animals" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "assistant_captures_farm_idx" ON "assistant_captures" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "assistant_proposals_status_idx" ON "assistant_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_events_farm_at_idx" ON "audit_events" USING btree ("farm_id","at");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_milk_productions_farm_date_unique" ON "daily_milk_productions" USING btree ("farm_id","date");--> statement-breakpoint
CREATE INDEX "feed_entries_farm_item_idx" ON "feed_entries" USING btree ("farm_id","item_id");--> statement-breakpoint
CREATE INDEX "feed_items_farm_id_idx" ON "feed_items" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "feeding_event_items_event_idx" ON "feeding_event_items" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "feeding_event_items_item_idx" ON "feeding_event_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "feeding_events_farm_date_idx" ON "feeding_events" USING btree ("farm_id","date");--> statement-breakpoint
CREATE INDEX "financial_entries_farm_date_idx" ON "financial_entries" USING btree ("farm_id","date");--> statement-breakpoint
CREATE INDEX "herd_groups_farm_id_idx" ON "herd_groups" USING btree ("farm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "individual_milk_measurements_session_animal_unique" ON "individual_milk_measurements" USING btree ("session_id","animal_id");--> statement-breakpoint
CREATE INDEX "individual_milk_measurements_animal_idx" ON "individual_milk_measurements" USING btree ("animal_id");--> statement-breakpoint
CREATE INDEX "installations_farm_id_idx" ON "installations" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "milk_collections_farm_date_idx" ON "milk_collections" USING btree ("farm_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "milk_control_sessions_group_date_shift_unique" ON "milk_control_sessions" USING btree ("group_id","date","shift");--> statement-breakpoint
CREATE INDEX "milk_control_sessions_farm_date_idx" ON "milk_control_sessions" USING btree ("farm_id","date");--> statement-breakpoint
CREATE INDEX "occupancies_group_open_idx" ON "pasture_occupancies" USING btree ("group_id","end");--> statement-breakpoint
CREATE INDEX "occupancies_pasture_open_idx" ON "pasture_occupancies" USING btree ("pasture_id","end");--> statement-breakpoint
CREATE INDEX "pastures_farm_id_idx" ON "pastures" USING btree ("farm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_farm_id_unique" ON "users" USING btree ("farm_id");