CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint

CREATE TABLE "farm_boundaries" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"boundary" geometry(Polygon,4326) NOT NULL,
	CONSTRAINT "farm_boundaries_boundary_valid" CHECK (ST_IsValid("boundary"))
);
--> statement-breakpoint

ALTER TABLE "farm_boundaries" ADD CONSTRAINT "farm_boundaries_farm_id_farms_id_fk"
	FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "pastures" ADD COLUMN "polygon_geometry" geometry(Polygon,4326);
--> statement-breakpoint
UPDATE "pastures"
SET "polygon_geometry" = ST_SetSRID(
	ST_GeomFromGeoJSON(
		jsonb_build_object(
			'type', 'Polygon',
			'coordinates', jsonb_build_array(
				(
					SELECT jsonb_agg(
						jsonb_build_array((point->>1)::double precision, (point->>0)::double precision)
						ORDER BY ord
					)
					FROM jsonb_array_elements("pastures"."polygon") WITH ORDINALITY AS points(point, ord)
				) || jsonb_build_array(
					jsonb_build_array(("pastures"."polygon"->0->>1)::double precision, ("pastures"."polygon"->0->>0)::double precision)
				)
			)
		)::text
	), 4326
);
--> statement-breakpoint
ALTER TABLE "pastures" DROP COLUMN "polygon";
--> statement-breakpoint
ALTER TABLE "pastures" RENAME COLUMN "polygon_geometry" TO "polygon";
--> statement-breakpoint

ALTER TABLE "installations" ADD COLUMN "point_geometry" geometry(Point,4326);
--> statement-breakpoint
UPDATE "installations"
SET "point_geometry" = ST_SetSRID(
	ST_Point(("installations"."point"->>1)::double precision, ("installations"."point"->>0)::double precision), 4326
);
--> statement-breakpoint
ALTER TABLE "installations" DROP COLUMN "point";
--> statement-breakpoint
ALTER TABLE "installations" RENAME COLUMN "point_geometry" TO "point";
--> statement-breakpoint

CREATE UNIQUE INDEX "farm_boundaries_farm_unique" ON "farm_boundaries" USING btree ("farm_id");
--> statement-breakpoint
CREATE INDEX "farm_boundaries_boundary_gist" ON "farm_boundaries" USING gist ("boundary");
--> statement-breakpoint
CREATE INDEX "pastures_polygon_gist" ON "pastures" USING gist ("polygon");
--> statement-breakpoint
CREATE INDEX "installations_point_gist" ON "installations" USING gist ("point");
--> statement-breakpoint
ALTER TABLE "pastures" ADD CONSTRAINT "pastures_polygon_valid" CHECK (ST_IsValid("polygon"));
--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_point_valid" CHECK (ST_IsValid("point"));
