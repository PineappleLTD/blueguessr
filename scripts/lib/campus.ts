import type { CampusArea } from "../../lib/types";
import { pointInPolygon, ringBBox, type PolygonRings } from "./geo";
import { CAMPUS_JSON, readJson } from "./util";

export interface CampusFeature {
  area: CampusArea;
  name: string;
  rings: PolygonRings;
  bbox: [number, number, number, number];
}

interface CampusGeoJson {
  features: { properties: { area: CampusArea; name: string }; geometry: { type: "Polygon"; coordinates: PolygonRings } }[];
}

export const AREAS: CampusArea[] = ["central", "north", "medical", "athletic", "other"];

/** The Diag, the busiest spot on campus. Used to cap clustering. */
export const DIAG = { lat: 42.2768, lng: -83.7382 };

export function loadCampus(): CampusFeature[] {
  const gj = readJson<CampusGeoJson>(CAMPUS_JSON);
  return gj.features.map((f) => ({
    area: f.properties.area,
    name: f.properties.name,
    rings: f.geometry.coordinates,
    bbox: ringBBox(f.geometry.coordinates[0]),
  }));
}

export function areaAt(campus: CampusFeature[], lat: number, lng: number): CampusArea | null {
  for (const f of campus) {
    const [minX, minY, maxX, maxY] = f.bbox;
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
    if (pointInPolygon(lng, lat, f.rings)) return f.area;
  }
  return null;
}

export function campusBBox(campus: CampusFeature[]): [number, number, number, number] {
  return [
    Math.min(...campus.map((f) => f.bbox[0])),
    Math.min(...campus.map((f) => f.bbox[1])),
    Math.max(...campus.map((f) => f.bbox[2])),
    Math.max(...campus.map((f) => f.bbox[3])),
  ];
}
