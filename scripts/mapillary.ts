// Builds the Mapillary candidate pool (.cache/mapillary/candidates.json) for photos:build.
//
//   npm run photos:mapillary              (needs MAPILLARY_TOKEN in the env or .env.local)
//   npm run photos:mapillary -- --refresh (re-download the cached API tiles)
//
// All Mapillary imagery is CC BY-SA 4.0; the credit is the uploader's Mapillary username.
// We query the Graph API v4 in ~0.004° tiles over the campus (subdividing tiles that hit the result cap),
// keep non-panoramic landscape photos taken inside the campus polygons, and leave picking to build.ts.
import fs from "node:fs";
import { areaAt, campusBBox, loadCampus, type CampusFeature } from "./lib/campus";
import { MAPILLARY_LICENSE, MAPILLARY_LICENSE_URL, mapillaryUrl, type Candidate } from "./lib/photos";
import { CACHE_DIR, cachePath, countBy, fetchWithRetry, getEnv, parseArgs, readJson, sleep, writeJson } from "./lib/util";

const API = "https://graph.mapillary.com/images";
const FIELDS = [
  "id",
  "thumb_2048_url",
  "computed_geometry",
  "geometry",
  "captured_at",
  "compass_angle",
  "is_pano",
  "creator",
  "quality_score",
  "width",
  "height",
  "sequence",
  "camera_type",
].join(",");
const LIMIT = 2000;
// The API returns fewer images for dense boxes than their quarters do, long before the 2000 cap.
// Splitting every tile with 400+ results recovered ~4,000 images; going lower added almost nothing.
const SPLIT_AT = 400;
const TILE = 0.004;
const MIN_WIDTH = 1600;
const MIN_DATE = Date.UTC(2015, 0, 1);

interface MapillaryImage {
  id: string;
  thumb_2048_url?: string;
  computed_geometry?: { coordinates: [number, number] };
  geometry?: { coordinates: [number, number] };
  captured_at?: number;
  compass_angle?: number;
  is_pano?: boolean;
  creator?: { id: string; username?: string };
  quality_score?: number;
  width?: number;
  height?: number;
  sequence?: string;
  camera_type?: string;
}

type BBox = [number, number, number, number]; // minLng, minLat, maxLng, maxLat

function tileTouchesCampus(campus: CampusFeature[], [x0, y0, x1, y1]: BBox): boolean {
  const n = 6;
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) if (areaAt(campus, y0 + ((y1 - y0) * j) / n, x0 + ((x1 - x0) * i) / n)) return true;
  return campus.some((f) => f.rings[0].some(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1));
}

async function fetchTile(token: string, bbox: BBox, depth = 0): Promise<MapillaryImage[]> {
  const key = bbox.map((v) => v.toFixed(5)).join("_");
  const file = cachePath("mapillary", "tiles", `${key}.json`);
  let data: MapillaryImage[];
  if (fs.existsSync(file)) {
    data = readJson<MapillaryImage[]>(file);
  } else {
    const url = `${API}?access_token=${encodeURIComponent(token)}&bbox=${bbox.join(",")}&fields=${FIELDS}&limit=${LIMIT}`;
    const res = await fetchWithRetry(url, { label: `mapillary tile ${key}` });
    if (!res.ok) throw new Error(`Mapillary HTTP ${res.status} for tile ${key}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { data?: MapillaryImage[] };
    data = body.data ?? [];
    writeJson(file, data, 0);
    await sleep(150);
  }
  if (data.length < SPLIT_AT || depth >= 4) return data;
  // Dense tile: split into quarters so nothing is silently dropped.
  const [x0, y0, x1, y1] = bbox;
  const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const quads: BBox[] = [
    [x0, y0, mx, my],
    [mx, y0, x1, my],
    [x0, my, mx, y1],
    [mx, my, x1, y1],
  ];
  const out: MapillaryImage[] = [];
  for (const q of quads) out.push(...(await fetchTile(token, q, depth + 1)));
  return out;
}

async function main() {
  const { flags } = parseArgs();
  const token = getEnv("MAPILLARY_TOKEN");
  if (!token) {
    console.log(
      "MAPILLARY_TOKEN is not set, so the Mapillary step was skipped.\n" +
        "Create a client token at https://www.mapillary.com/dashboard/developers, put MAPILLARY_TOKEN=... in .env.local\n" +
        "(or export it), then run: npm run photos:mapillary && npm run photos:build",
    );
    return;
  }
  if (flags.refresh) fs.rmSync(cachePath("mapillary", "tiles"), { recursive: true, force: true });

  const campus = loadCampus();
  const [minLng, minLat, maxLng, maxLat] = campusBBox(campus);
  const tiles: BBox[] = [];
  for (let x = Math.floor(minLng / TILE) * TILE; x < maxLng; x += TILE)
    for (let y = Math.floor(minLat / TILE) * TILE; y < maxLat; y += TILE) {
      const t: BBox = [x, y, x + TILE, y + TILE].map((v) => Number(v.toFixed(5))) as BBox;
      if (tileTouchesCampus(campus, t)) tiles.push(t);
    }
  console.log(`Querying ${tiles.length} tiles of ${TILE}° (cached under ${CACHE_DIR}/mapillary/tiles)...`);

  const byId = new Map<string, MapillaryImage>();
  let done = 0;
  for (const t of tiles) {
    for (const img of await fetchTile(token, t)) byId.set(img.id, img);
    if (++done % 20 === 0) console.log(`  ${done}/${tiles.length} tiles, ${byId.size} images`);
  }
  console.log(`${byId.size} images in the tiles`);

  const skipped: string[] = [];
  const candidates: Candidate[] = [];
  for (const img of byId.values()) {
    const coords = img.computed_geometry?.coordinates ?? img.geometry?.coordinates;
    const area = coords ? areaAt(campus, coords[1], coords[0]) : null;
    const reason = !coords || !area
      ? "outside campus"
      : img.is_pano || ["spherical", "equirectangular", "fisheye"].includes(img.camera_type ?? "")
        ? "panorama/fisheye"
        : !img.width || !img.height || img.width < img.height
          ? "portrait"
          : img.width < MIN_WIDTH
            ? "low resolution"
            : !img.captured_at || img.captured_at < MIN_DATE
              ? "before 2015"
              : !img.creator?.username
                ? "no username"
                : !img.thumb_2048_url
                  ? "no image url"
                  : null;
    if (reason) {
      skipped.push(reason);
      continue;
    }
    candidates.push({
      source: "mapillary",
      sourceId: img.id,
      lat: coords![1],
      lng: coords![0],
      area: area!,
      imageUrl: img.thumb_2048_url!,
      width: img.width!,
      height: img.height!,
      author: img.creator!.username!,
      license: MAPILLARY_LICENSE,
      licenseUrl: MAPILLARY_LICENSE_URL,
      sourceUrl: mapillaryUrl(img.id),
      capturedAt: new Date(img.captured_at!).toISOString(),
      quality: img.quality_score,
      sequence: img.sequence,
      creatorId: img.creator!.id,
    });
  }
  candidates.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  writeJson(cachePath("mapillary", "candidates.json"), candidates, 0);

  console.log("Skipped:", countBy(skipped, (s) => s));
  console.log(`Candidates: ${candidates.length}`, countBy(candidates, (c) => c.area));
  console.log("By year:", countBy(candidates, (c) => c.capturedAt!.slice(0, 4)));
  console.log(`Sequences: ${new Set(candidates.map((c) => c.sequence)).size}, creators: ${new Set(candidates.map((c) => c.author)).size}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
