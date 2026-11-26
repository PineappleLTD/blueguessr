// Builds the Wikimedia Commons candidate pool (.cache/commons/candidates.json) for photos:build.
//
//   npm run photos:commons
//   npm run photos:commons -- --refresh   (re-query the API instead of using .cache/commons)
//
// 1. list=geosearch over small tiles (split when a tile hits the 500-result cap) to find geotagged files.
// 2. For files whose coordinates fall inside the campus polygons, fetch imageinfo + extmetadata + hidden
//    license categories, 50 titles per request, sequentially, with maxlag.
// 3. Keep only files under CC0, a public-domain mark, CC BY 2.0-4.0 or CC BY-SA 2.0-4.0, with no
//    Restrictions, a known author, JPEG/PNG, >= 1000 px wide, taken 2005 or later.
// License/metadata rejections are written to data/rejected.json (by: "auto", recomputed every run).
import { createHash } from "node:crypto";
import fs from "node:fs";
import { areaAt, campusBBox, loadCampus, type CampusFeature } from "./lib/campus";
import { loadRejected, saveRejected, stripHtml, type Candidate, type Rejection } from "./lib/photos";
import { cachePath, countBy, fetchWithRetry, parseArgs, readJson, sleep, writeJson } from "./lib/util";

const API = "https://commons.wikimedia.org/w/api.php";
const TILE = 0.01;
const GS_LIMIT = 500;
const BATCH = 50;
const DELAY_MS = 400;
const MIN_WIDTH = 1000;
const MIN_YEAR = 2005;
const EXTMETA = [
  "LicenseShortName",
  "LicenseUrl",
  "License",
  "Artist",
  "Attribution",
  "AttributionRequired",
  "Credit",
  "Restrictions",
  "UsageTerms",
  "ObjectName",
  "Copyrighted",
  "DateTimeOriginal",
].join("|");

type BBox = [number, number, number, number]; // minLng, minLat, maxLng, maxLat

interface GeoHit {
  pageid: number;
  title: string;
  lat: number;
  lon: number;
  primary?: boolean;
  type?: string;
}

interface FileInfo {
  title: string;
  missing?: boolean;
  imageinfo?: {
    url: string;
    thumburl?: string;
    descriptionurl: string;
    width: number;
    height: number;
    mime: string;
    extmetadata?: Record<string, { value: string }>;
  }[];
  coordinates?: { lat: number; lon: number; primary?: boolean; type?: string }[];
  categories?: { title: string }[];
}

async function api(params: Record<string, string>, label: string): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ format: "json", formatversion: "2", maxlag: "5", ...params });
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetchWithRetry(API, {
      method: "POST",
      body: body.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      label,
    });
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, unknown> & { error?: { code: string; info: string } };
    if (json.error?.code === "maxlag") {
      const wait = Number(res.headers.get("retry-after") ?? 5) * 1000;
      console.warn(`  ${label}: maxlag, waiting ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (json.error) throw new Error(`${label}: ${json.error.code}: ${json.error.info}`);
    await sleep(DELAY_MS);
    return json;
  }
  throw new Error(`${label}: gave up after repeated maxlag`);
}

function tileTouchesCampus(campus: CampusFeature[], [x0, y0, x1, y1]: BBox): boolean {
  const n = 10;
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) if (areaAt(campus, y0 + ((y1 - y0) * j) / n, x0 + ((x1 - x0) * i) / n)) return true;
  return campus.some((f) => f.rings[0].some(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1));
}

async function geosearch(bbox: BBox, depth = 0): Promise<GeoHit[]> {
  const key = bbox.map((v) => v.toFixed(5)).join("_");
  const file = cachePath("commons", "geosearch", `${key}.json`);
  let hits: GeoHit[];
  if (fs.existsSync(file)) {
    hits = readJson<GeoHit[]>(file);
  } else {
    const [x0, y0, x1, y1] = bbox;
    const json = await api(
      { action: "query", list: "geosearch", gsbbox: `${y1}|${x0}|${y0}|${x1}`, gsnamespace: "6", gslimit: String(GS_LIMIT), gsprimary: "all", gsprop: "type" },
      `geosearch ${key}`,
    );
    hits = ((json.query as { geosearch?: GeoHit[] })?.geosearch ?? []).map((h) => ({ pageid: h.pageid, title: h.title, lat: h.lat, lon: h.lon, primary: h.primary, type: h.type }));
    writeJson(file, hits, 0);
  }
  if (hits.length < GS_LIMIT || depth >= 6) return hits;
  const [x0, y0, x1, y1] = bbox;
  const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const out: GeoHit[] = [];
  for (const q of [
    [x0, y0, mx, my],
    [mx, y0, x1, my],
    [x0, my, mx, y1],
    [mx, my, x1, y1],
  ] as BBox[])
    out.push(...(await geosearch(q, depth + 1)));
  return out;
}

const infoFile = (title: string) => cachePath("commons", "info", `${createHash("sha1").update(title).digest("hex")}.json`);

/** imageinfo + coordinates + hidden categories for up to 50 titles, following API continuation. */
async function fetchInfo(titles: string[]): Promise<void> {
  const pages = new Map<string, FileInfo>();
  let cont: Record<string, string> = {};
  for (let round = 0; round < 50; round++) {
    const json = await api(
      {
        action: "query",
        titles: titles.join("|"),
        prop: "imageinfo|coordinates|categories",
        iiprop: "url|size|mime|extmetadata",
        iiurlwidth: "1600",
        iiextmetadatafilter: EXTMETA,
        iiextmetadatalanguage: "en",
        coprimary: "all",
        coprop: "type|dim",
        colimit: "max",
        clshow: "hidden",
        cllimit: "max",
        ...cont,
      },
      `imageinfo batch (${titles.length})`,
    );
    for (const p of ((json.query as { pages?: FileInfo[] })?.pages ?? [])) {
      const prev = pages.get(p.title) ?? { title: p.title };
      pages.set(p.title, {
        ...prev,
        ...p,
        imageinfo: p.imageinfo ?? prev.imageinfo,
        coordinates: [...(prev.coordinates ?? []), ...(p.coordinates ?? [])],
        categories: [...(prev.categories ?? []), ...(p.categories ?? [])],
      });
    }
    if (!json.continue) break;
    cont = json.continue as Record<string, string>;
  }
  for (const t of titles) {
    const info = pages.get(t) ?? { title: t, missing: true };
    writeJson(infoFile(t), info, 0);
  }
}

// ---------------------------------------------------------------------------------------------
// Licensing

const ALLOWED_VERSIONS = ["4.0", "3.0", "2.5", "2.0"];
const CC_KIND_NAME: Record<string, string> = { by: "CC BY", "by-sa": "CC BY-SA" };

interface License {
  name: string;
  url: string;
  /** Lower is more permissive. */
  rank: number;
}

/** Parse a machine license id ("cc-by-sa-3.0", "cc-by-2.5,2.0", "cc-by-sa-3.0-de", "cc0", "pd"). */
function parseLicenseId(id: string, meta: Meta, pageUrl: string): License | null {
  const s = id.trim().toLowerCase();
  if (s === "cc0" || s === "cc-zero" || s === "cc0-1.0") return { name: "CC0 1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/", rank: 0 };
  if (s === "pd" || s === "public domain") {
    if (meta.Copyrighted?.toLowerCase() !== "false") return null;
    const url = meta.LicenseUrl && /^https?:\/\/creativecommons\.org\/publicdomain\//.test(meta.LicenseUrl) ? normalizeCcUrl(meta.LicenseUrl) : pageUrl;
    return { name: "Public domain", url, rank: 0 };
  }
  const m = s.match(/^cc-(by|by-sa)-([\d.,]+)(?:-([a-z][a-z-]*))?$/);
  if (!m) return null;
  const [, kind, versions, suffix] = m;
  const version = ALLOWED_VERSIONS.find((v) => versions.split(",").includes(v));
  if (!version) return null;
  // "migrated" = GFDL files relicensed to CC BY-SA 3.0 (unported). Two-letter suffixes are ported licenses.
  const port = suffix && /^[a-z]{2}$/.test(suffix) ? suffix : null;
  if (suffix && !port && !/^migrated/.test(suffix)) return null;
  const url = `https://creativecommons.org/licenses/${kind}/${version}/${port ? port + "/" : ""}`;
  const name = `${CC_KIND_NAME[kind]} ${version}${port ? " " + port.toUpperCase() : ""}`;
  const rank = (kind === "by" ? 10 : 20) + ALLOWED_VERSIONS.indexOf(version) + (port ? 0.5 : 0);
  return { name, url, rank };
}

function normalizeCcUrl(url: string): string {
  return url.replace(/^http:/, "https:").replace(/^\/\//, "https://").replace(/deed\.[a-z-]+$/i, "").replace(/\/?$/, "/");
}

/** Map a hidden license category to a machine id, e.g. "Category:CC-BY-SA-3.0-DE" -> "cc-by-sa-3.0-de". */
function categoryLicenseId(cat: string): string | null {
  const name = cat.replace(/^Category:/, "").trim();
  if (/^CC-Zero$/i.test(name) || /^CC0$/i.test(name)) return "cc0";
  const m = name.match(/^CC-(BY|BY-SA)-(\d\.\d)(?:-([A-Za-z]{2}))?$/i);
  return m ? `cc-${m[1].toLowerCase()}-${m[2]}${m[3] ? "-" + m[3].toLowerCase() : ""}` : null;
}

type Meta = Partial<Record<string, string>>;

function chooseLicense(meta: Meta, categories: string[], pageUrl: string): { license?: License; reason?: string; all: string[] } {
  const ids = new Set<string>();
  if (meta.License) ids.add(meta.License.toLowerCase());
  for (const c of categories) {
    const id = categoryLicenseId(c);
    if (id) ids.add(id);
  }
  const parsed = [...ids].map((id) => parseLicenseId(id, meta, pageUrl)).filter((l): l is License => !!l);
  parsed.sort((a, b) => a.rank - b.rank);
  if (parsed.length) return { license: parsed[0], all: [...ids] };
  const shown = meta.LicenseShortName || meta.License || "none";
  return { reason: `license: ${shown}`, all: [...ids] };
}

// ---------------------------------------------------------------------------------------------
// Author and title

const UNKNOWN_AUTHOR = /^(unknown|unknown author|author unknown|anonymous|anon\.?|not provided|n\/a|see (below|source)|unbekannt)$/i;

function cleanAuthor(html: string): string {
  // Flickr imports read "<a href=flickr.com/people/...>Name</a> from Place": keep the name.
  const flickr = html.match(/^\s*<a [^>]*href="[^"]*flickr\.com\/(?:people|photos)\/[^"]*"[^>]*>([^<]+)<\/a>\s+from\s+[^<]*$/i);
  let text = stripHtml(flickr ? flickr[1] : html);
  text = text
    .replace(/\(\s*talk(\s*\|\s*contribs?)?\s*\)/gi, "")
    .replace(/^(?:[a-z]{2,3}:)?User:/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function fileTitle(title: string): string {
  return title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "");
}

function parseYear(s: string | undefined): number | null {
  const m = s && stripHtml(s).match(/\b(1[89]\d\d|20\d\d)\b/);
  return m ? Number(m[1]) : null;
}

function parseDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const text = stripHtml(s);
  const iso = text.match(/\b(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3] ?? "01"}`;
  const d = Date.parse(text.replace(/^Taken on\s*/i, "").replace(/\(UTC\)/, ""));
  return Number.isFinite(d) ? new Date(d).toISOString().slice(0, 10) : undefined;
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const { flags } = parseArgs();
  if (flags.refresh) {
    fs.rmSync(cachePath("commons", "geosearch"), { recursive: true, force: true });
    fs.rmSync(cachePath("commons", "info"), { recursive: true, force: true });
  }

  const campus = loadCampus();
  const [minLng, minLat, maxLng, maxLat] = campusBBox(campus);
  const tiles: BBox[] = [];
  for (let x = Math.floor(minLng / TILE) * TILE; x < maxLng; x += TILE)
    for (let y = Math.floor(minLat / TILE) * TILE; y < maxLat; y += TILE) {
      const t = [x, y, x + TILE, y + TILE].map((v) => Number(v.toFixed(5))) as BBox;
      if (tileTouchesCampus(campus, t)) tiles.push(t);
    }

  console.log(`Geosearch over ${tiles.length} tiles...`);
  const hitsByTitle = new Map<string, GeoHit[]>();
  for (const t of tiles) for (const h of await geosearch(t)) hitsByTitle.set(h.title, [...(hitsByTitle.get(h.title) ?? []), h]);
  const inCampus = [...hitsByTitle.entries()].filter(([, hs]) => hs.some((h) => areaAt(campus, h.lat, h.lon))).map(([t]) => t);
  console.log(`${hitsByTitle.size} geotagged files in the tiles, ${inCampus.length} with a coordinate inside the campus`);

  const missing = inCampus.filter((t) => !fs.existsSync(infoFile(t)));
  console.log(`Fetching metadata for ${missing.length} files (${inCampus.length - missing.length} cached)...`);
  for (let i = 0; i < missing.length; i += BATCH) {
    await fetchInfo(missing.slice(i, i + BATCH));
    if ((i / BATCH) % 5 === 4) console.log(`  ${Math.min(i + BATCH, missing.length)}/${missing.length}`);
  }

  const candidates: Candidate[] = [];
  const rejections: Rejection[] = [];
  const skipped: string[] = [];
  const multi: string[] = [];
  for (const title of inCampus.sort()) {
    const info = readJson<FileInfo>(infoFile(title));
    const ii = info.imageinfo?.[0];
    if (info.missing || !ii) {
      skipped.push("missing");
      continue;
    }
    // Camera location first; fall back to the primary coordinate.
    const coords = info.coordinates ?? [];
    const pos = coords.find((c) => c.type === "camera") ?? coords.find((c) => c.primary) ?? coords[0];
    const area = pos ? areaAt(campus, pos.lat, pos.lon) : null;
    if (!pos || !area) {
      skipped.push("camera outside campus");
      continue;
    }
    const meta: Meta = Object.fromEntries(Object.entries(ii.extmetadata ?? {}).map(([k, v]) => [k, String(v.value ?? "").trim()]));
    const cats = (info.categories ?? []).map((c) => c.title);
    const lic = chooseLicense(meta, cats, ii.descriptionurl);
    const author = meta.Attribution ? cleanAuthor(meta.Attribution) : cleanAuthor(meta.Artist ?? "");
    const year = parseYear(meta.DateTimeOriginal);
    const reject = (reason: string, note?: string) => rejections.push({ source: "commons", sourceId: title, reason, note, by: "auto" });

    if (!/^image\/(jpeg|png)$/.test(ii.mime)) reject("format", ii.mime);
    else if (ii.width < MIN_WIDTH) reject("too small", `${ii.width}x${ii.height}`);
    else if (!lic.license) reject("license", lic.reason);
    else if (meta.Restrictions) reject("restrictions", meta.Restrictions);
    else if (!author || UNKNOWN_AUTHOR.test(author)) reject("no author", stripHtml(meta.Artist ?? "") || undefined);
    else if (year !== null && year < MIN_YEAR) reject("before 2005", stripHtml(meta.DateTimeOriginal ?? ""));
    else if (ii.width < ii.height) skipped.push("portrait");
    else if (ii.width / ii.height > 2.4) skipped.push("panorama");
    else {
      if (lic.all.length > 1) multi.push(`${title}: ${lic.all.join(", ")} -> ${lic.license.name}`);
      candidates.push({
        source: "commons",
        sourceId: title,
        lat: pos.lat,
        lng: pos.lon,
        area,
        imageUrl: ii.thumburl ?? ii.url,
        width: ii.width,
        height: ii.height,
        author,
        title: stripHtml(meta.ObjectName ?? "") || fileTitle(title),
        license: lic.license.name,
        licenseUrl: lic.license.url,
        sourceUrl: ii.descriptionurl,
        capturedAt: parseDate(meta.DateTimeOriginal),
        quality: pos.type === "camera" ? 0.6 : 0.4,
      });
    }
  }
  writeJson(cachePath("commons", "candidates.json"), candidates, 0);

  // Auto rejections are recomputed each run; review rejections are kept as they are.
  const kept = loadRejected().filter((r) => !(r.source === "commons" && r.by === "auto"));
  saveRejected([...kept, ...rejections]);

  const report = {
    geotaggedInTiles: hitsByTitle.size,
    inCampus: inCampus.length,
    candidates: candidates.length,
    skipped: countBy(skipped, (s) => s),
    rejected: countBy(rejections, (r) => r.reason),
    rejectedLicenses: countBy(rejections.filter((r) => r.reason === "license"), (r) => r.note ?? ""),
    rejectedRestrictions: countBy(rejections.filter((r) => r.reason === "restrictions"), (r) => r.note ?? ""),
    candidateLicenses: countBy(candidates, (c) => c.license),
    candidateAreas: countBy(candidates, (c) => c.area),
    multiLicensed: multi,
  };
  writeJson(cachePath("commons", "report.json"), report);
  console.log(JSON.stringify({ ...report, multiLicensed: `${multi.length} files (see .cache/commons/report.json)` }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
