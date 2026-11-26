import type { LngLat } from "./types";

const R = 6371008.8; // mean Earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceMeters(a: LngLat, b: LngLat): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "8 m", "240 m", "1.3 km". */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

type Ring = number[][];
type Polygon = Ring[];

function inRing([x, y]: [number, number], ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(pt: [number, number], poly: Polygon): boolean {
  if (!poly.length || !inRing(pt, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (inRing(pt, poly[i])) return false;
  return true;
}

export interface CampusFeature {
  type: "Feature";
  properties: { area?: string; name?: string } & Record<string, unknown>;
  geometry: { type: "Polygon"; coordinates: Polygon } | { type: "MultiPolygon"; coordinates: Polygon[] };
}
export interface CampusCollection {
  type: "FeatureCollection";
  features: CampusFeature[];
}

/** The campus feature containing the point, or null. */
export function campusFeatureAt(campus: CampusCollection, p: LngLat): CampusFeature | null {
  const pt: [number, number] = [p.lng, p.lat];
  for (const f of campus.features) {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    if (polys.some((poly) => inPolygon(pt, poly))) return f;
  }
  return null;
}

/** [[minLng, minLat], [maxLng, maxLat]] of a collection, or null when it's empty. */
export function bounds(campus: CampusCollection): [[number, number], [number, number]] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of campus.features) {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const poly of polys)
      for (const [x, y] of poly[0]) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
  }
  return Number.isFinite(minX) ? [[minX, minY], [maxX, maxY]] : null;
}

/** Fallback view of Ann Arbor campuses (Central through North) when there's no boundary yet. */
export const CAMPUS_FALLBACK_BOUNDS: [[number, number], [number, number]] = [
  [-83.755, 42.262],
  [-83.705, 42.302],
];
