// Builds data/campus.json: the U-M Ann Arbor campus boundary from OpenStreetMap, split into areas.
//
//   npm run photos:campus            (uses .cache/overpass/campus.json if present)
//   npm run photos:campus -- --refresh
//
// OSM tags the whole campus as one amenity=university multipolygon ("University of Michigan") made of
// separate outer ways: Central+Medical (one way), North Campus, the athletic/South Campus, a few tiny
// parcels near Central, and far-off parcels (East Medical Campus, offices near Domino's Farms, a lot by
// Eisenhower Pkwy). We keep the main areas, keep small parcels within 300 m of them as "other", drop the
// rest, and cut the Central+Medical way into Central and Medical along E Ann St / Washington Heights.
import fs from "node:fs";
import type { CampusArea } from "../lib/types";
import { closeRing, clipRingToHalfPlane, distanceToRing, pointInPolygon, pointInRing, polygonArea, roundCoord, simplifyRing, type PolygonRings, type Position, type Ring } from "./lib/geo";
import { CAMPUS_JSON, cachePath, fetchWithRetry, parseArgs, writeJson } from "./lib/util";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const BBOX = "42.25,-83.77,42.31,-83.69"; // south,west,north,east
const QUERY = `[out:json][timeout:120];
(
  way["amenity"="university"](${BBOX});
  relation["amenity"="university"](${BBOX});
);
out geom;`;
const UM = /^University of Michigan$/i;

/** A point that identifies each main area's polygon. */
const ANCHORS: { area: CampusArea; name: string; lat: number; lng: number }[] = [
  { area: "central", name: "Central Campus", lat: 42.2768, lng: -83.7382 }, // the Diag
  { area: "north", name: "North Campus", lat: 42.2925, lng: -83.7163 }, // Lurie Bell Tower
  { area: "athletic", name: "Athletic Campus", lat: 42.2658, lng: -83.7487 }, // Michigan Stadium
];
/**
 * Central/Medical cut: a line along E Ann St (west) to E Medical Center Dr at Mott (east).
 * North of it (University Hospital, Cancer Center, MSRBs, Taubman Library, Nursing) is Medical; the Hill
 * dorms (Couzens, Alice Lloyd, Markley), Palmer Commons and the Power Center stay Central.
 */
const MEDICAL_CUT: [Position, Position] = [
  [-83.745, 42.28406],
  [-83.72, 42.28006],
];
const NEARBY_PARCEL_M = 300;
const SIMPLIFY_M = 1.5;

interface OsmPoint {
  lat: number;
  lon: number;
}
interface OsmMember {
  type: string;
  ref: number;
  role: string;
  geometry?: OsmPoint[];
}
interface OsmElement {
  type: "way" | "relation" | "node";
  id: number;
  tags?: Record<string, string>;
  geometry?: OsmPoint[];
  members?: OsmMember[];
}

interface Part {
  rings: PolygonRings;
  osm: string;
}

/** Join way segments into closed rings. */
function stitch(ways: Ring[]): Ring[] {
  const rings: Ring[] = [];
  const open = ways.map((w) => [...w]);
  const same = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];
  while (open.length) {
    let cur = open.shift()!;
    let grew = true;
    while (!same(cur[0], cur[cur.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const w = open[i];
        const end = cur[cur.length - 1];
        if (same(w[0], end)) cur = [...cur, ...w.slice(1)];
        else if (same(w[w.length - 1], end)) cur = [...cur, ...[...w].reverse().slice(1)];
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (same(cur[0], cur[cur.length - 1]) && cur.length >= 4) rings.push(cur);
    else console.warn(`  skipping unclosed ring (${cur.length} points)`);
  }
  return rings;
}

const toRing = (g: OsmPoint[]): Ring => g.map((p) => [p.lon, p.lat]);

function partsFromElement(el: OsmElement): Part[] {
  if (el.type === "way" && el.geometry) {
    const ring = toRing(el.geometry);
    return ring.length >= 4 ? [{ rings: [closeRing(ring)], osm: `way/${el.id}` }] : [];
  }
  if (el.type !== "relation" || !el.members) return [];
  const outerWays: { ring: Ring; ref: number }[] = [];
  const innerWays: Ring[] = [];
  for (const m of el.members) {
    if (m.type !== "way" || !m.geometry?.length) continue;
    if (m.role === "inner") innerWays.push(toRing(m.geometry));
    else outerWays.push({ ring: toRing(m.geometry), ref: m.ref });
  }
  // Keep the OSM way id when an outer ring is a single closed way, for traceability.
  const parts: Part[] = [];
  const pending: Ring[] = [];
  for (const { ring, ref } of outerWays) {
    const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
    if (closed) parts.push({ rings: [ring], osm: `way/${ref}` });
    else pending.push(ring);
  }
  for (const ring of stitch(pending)) parts.push({ rings: [ring], osm: `relation/${el.id}` });
  for (const hole of stitch(innerWays)) {
    const owner = parts.find((p) => pointInRing(hole[0][0], hole[0][1], p.rings[0]));
    if (owner) owner.rings.push(hole);
  }
  return parts;
}

function finishRings(rings: PolygonRings): PolygonRings {
  return rings
    .map((r) => simplifyRing(r, SIMPLIFY_M).map(([x, y]) => [roundCoord(x), roundCoord(y)] as Position))
    .filter((r) => r.length >= 4);
}

async function main() {
  const { flags } = parseArgs();
  const cacheFile = cachePath("overpass", "campus.json");
  if (flags.refresh) fs.rmSync(cacheFile, { force: true });

  let raw: { elements: OsmElement[] };
  if (fs.existsSync(cacheFile)) {
    raw = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  } else {
    console.log("Querying Overpass for amenity=university around Ann Arbor...");
    const res = await fetchWithRetry(OVERPASS_URL, {
      method: "POST",
      body: new URLSearchParams({ data: QUERY }).toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      label: "overpass",
      retries: 8,
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    raw = await res.json();
    if (!raw.elements?.length) throw new Error("Overpass returned no elements");
    fs.writeFileSync(cacheFile, JSON.stringify(raw));
  }

  const um = raw.elements.filter((e) => UM.test(e.tags?.name ?? "") || UM.test(e.tags?.operator ?? ""));
  console.log(`OSM: ${raw.elements.length} university elements in bbox, ${um.length} named/operated by University of Michigan`);
  const parts = um.flatMap(partsFromElement);

  const main: { area: CampusArea; name: string; part: Part }[] = [];
  const rest: Part[] = [];
  for (const part of parts) {
    const anchor = ANCHORS.find((a) => pointInPolygon(a.lng, a.lat, part.rings));
    if (anchor && !main.some((m) => m.area === anchor.area)) main.push({ area: anchor.area, name: anchor.name, part });
    else rest.push(part);
  }
  for (const a of ANCHORS) if (!main.some((m) => m.area === a.area)) throw new Error(`No OSM polygon contains the ${a.name} anchor`);

  type Feature = { area: CampusArea; name: string; osm: string; rings: PolygonRings };
  const features: Feature[] = [];
  for (const m of main) {
    if (m.area !== "central") {
      features.push({ area: m.area, name: m.name, osm: m.part.osm, rings: m.part.rings });
      continue;
    }
    // Split Central+Medical. Holes (none today) stay with whichever side contains them.
    const [a, b] = MEDICAL_CUT;
    const medicalOuter = clipRingToHalfPlane(m.part.rings[0], a, b);
    const centralOuter = clipRingToHalfPlane(m.part.rings[0], b, a);
    const holes = m.part.rings.slice(1);
    const holesIn = (outer: Ring) => holes.filter((h) => pointInRing(h[0][0], h[0][1], outer));
    features.push({ area: "central", name: "Central Campus", osm: m.part.osm, rings: [centralOuter, ...holesIn(centralOuter)] });
    features.push({ area: "medical", name: "Medical Campus", osm: m.part.osm, rings: [medicalOuter, ...holesIn(medicalOuter)] });
  }
  for (const part of rest) {
    const [lng, lat] = part.rings[0][0];
    const nearest = Math.min(...main.map((m) => distanceToRing(lng, lat, m.part.rings[0])));
    const areaM2 = polygonArea(part.rings);
    if (nearest <= NEARBY_PARCEL_M && areaM2 < 100_000) {
      features.push({ area: "other", name: "Other U-M parcel", osm: part.osm, rings: part.rings });
      console.log(`  keep ${part.osm} as other (${Math.round(areaM2)} m², ${Math.round(nearest)} m from a main area)`);
    } else {
      console.log(`  drop ${part.osm} (${Math.round(areaM2)} m², ${Math.round(nearest)} m from the main areas)`);
    }
  }

  const order: CampusArea[] = ["central", "north", "medical", "athletic", "other"];
  features.sort((x, y) => order.indexOf(x.area) - order.indexOf(y.area));
  const geojson = {
    type: "FeatureCollection",
    attribution: "© OpenStreetMap contributors",
    license: "ODbL-1.0",
    licenseUrl: "https://www.openstreetmap.org/copyright",
    features: features.map((f) => ({
      type: "Feature",
      properties: { area: f.area, name: f.name, osm: f.osm },
      geometry: { type: "Polygon", coordinates: finishRings(f.rings) },
    })),
  };
  writeJson(CAMPUS_JSON, geojson, 0);

  const size = fs.statSync(CAMPUS_JSON).size;
  console.log(`Wrote data/campus.json: ${features.length} features, ${(size / 1024).toFixed(1)} KB`);
  for (const f of geojson.features) {
    const pts = f.geometry.coordinates.reduce((s, r) => s + r.length, 0);
    console.log(`  ${f.properties.area.padEnd(8)} ${f.properties.osm.padEnd(14)} ${(polygonArea(f.geometry.coordinates) / 1e6).toFixed(3)} km², ${pts} points`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
