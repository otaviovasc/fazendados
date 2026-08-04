import { sql } from 'drizzle-orm';
import type { LatLng } from '../domain/types.js';

type GeoJsonPolygon = { type: 'Polygon'; coordinates: number[][][] };
type GeoJsonPoint = { type: 'Point'; coordinates: number[] };

const closedRing = (points: LatLng[]) => {
  const ring = points.map(([lat, lng]) => [lng, lat]);
  const first = ring[0];
  if (first && ring.at(-1)?.[0] === first[0] && ring.at(-1)?.[1] === first[1]) return ring;
  return [...ring, first];
};

export function polygonGeometryFromLatLng(points: LatLng[]) {
  const geojson: GeoJsonPolygon = { type: 'Polygon', coordinates: [closedRing(points)] };
  return sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geojson)}), 4326)`;
}

export function pointGeometryFromLatLng([lat, lng]: LatLng) {
  const geojson: GeoJsonPoint = { type: 'Point', coordinates: [lng, lat] };
  return sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geojson)}), 4326)`;
}

function coordinatesFromGeoJson(value: unknown): unknown {
  if (typeof value === 'string') return JSON.parse(value) as unknown;
  return value;
}

export function latLngPolygonFromGeoJson(value: unknown): LatLng[] {
  const parsed = coordinatesFromGeoJson(value) as { coordinates?: number[][][] };
  const ring = parsed.coordinates?.[0] ?? [];
  return ring.slice(0, -1).map(([lng, lat]) => [lat, lng] as LatLng);
}

export function latLngPointFromGeoJson(value: unknown): LatLng {
  const parsed = coordinatesFromGeoJson(value) as { coordinates?: number[] };
  const [lng, lat] = parsed.coordinates ?? [];
  return [lat, lng];
}
