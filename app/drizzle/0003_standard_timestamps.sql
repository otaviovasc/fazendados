ALTER TABLE "farms"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "users"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "sessions"
	ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "animals"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "herd_groups"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "animal_group_assignments"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "farm_boundaries"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "pastures"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "installations"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "pasture_occupancies"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "daily_milk_productions"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "milk_control_sessions"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "individual_milk_measurements"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "milk_collections"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "feed_items"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "feed_entries"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "feeding_events"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "feeding_event_items"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "financial_entries"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "assistant_captures"
	ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "assistant_capture_attachments"
	ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "assistant_proposals"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "audit_events"
	ADD COLUMN "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE "idempotency_keys"
	ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
	ADD COLUMN "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint

CREATE FUNCTION public."fazendados_set_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW."updated_at" = statement_timestamp();
	RETURN NEW;
END;
$$;
--> statement-breakpoint

DO $$
DECLARE
	target_table text;
BEGIN
	FOREACH target_table IN ARRAY ARRAY[
		'farms',
		'users',
		'sessions',
		'animals',
		'herd_groups',
		'animal_group_assignments',
		'farm_boundaries',
		'pastures',
		'installations',
		'pasture_occupancies',
		'daily_milk_productions',
		'milk_control_sessions',
		'individual_milk_measurements',
		'milk_collections',
		'feed_items',
		'feed_entries',
		'feeding_events',
		'feeding_event_items',
		'financial_entries',
		'assistant_captures',
		'assistant_capture_attachments',
		'assistant_proposals',
		'audit_events',
		'idempotency_keys'
	]
	LOOP
		EXECUTE format(
			'CREATE TRIGGER "set_updated_at_before_update" BEFORE UPDATE ON public.%I '
			'FOR EACH ROW EXECUTE FUNCTION public."fazendados_set_updated_at"()',
			target_table
		);
	END LOOP;
END;
$$;
