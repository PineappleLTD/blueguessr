// Picks photos from the candidate pools, downloads them, and writes public/photos/*.webp + data/photos.json.
//
//   npm run photos:build
//   npm run photos:build -- --dry-run            (show what would be picked, download nothing)
//   npm run photos:build -- --limit 25          (add at most 25 new photos this run, for review in batches)
//   npm run photos:build -- --central 80 --athletic 60   (cap an area)
//
// Re-runnable: photos already in data/photos.json stay (same ids); anything in data/rejected.json is never
// picked again; new picks only fill what is missing. Selection rules:
//   - optional per-area caps (see QUOTAS); otherwise areas fill until no candidate fits the rules,
//     Medical and Athletic first
//   - spread: farthest-point sampling inside each area, so picks go to the biggest gaps first,
//     at most one photo per 70 m grid cell and none closer than 50 m to another
//   - at most 8% of the final set within 250 m of the Diag (excess near-Diag photos are dropped)
//   - at most 2 photos per Mapillary sequence, at least 100 m apart
//   - Mapillary first; a Commons photo is used only where no Mapillary photo can fill the gap
//   - among comparable picks: higher quality, on-foot captures, under-represented seasons, newer captures
//   - review rejections can block a whole sequence ("vehicle") or a 60 m spot ("nondescript")
import fs from "node:fs";
import type { CampusArea, Photo } from "../lib/types";
import { AREAS, DIAG, areaAt, loadCampus } from "./lib/campus";
import { haversine, roundCoord } from "./lib/geo";
import {
  assertNoMetadata,
  encodeWebp,
  imageStats,
  listPhotoFiles,
  loadPhotos,
  loadRejected,
  photoFile,
  photoSourceKey,
  savePhotos,
  saveRejected,
  sourceKey,
  type Candidate,
  type Rejection,
} from "./lib/photos";
import { CELL_M, DIAG_RADIUS_M, cellKey, renderCoverage, spreadReport } from "./lib/stats";
import { PHOTOS_DIR, cachePath, fetchWithRetry, getEnv, parseArgs, randomId, readJson, sleep } from "./lib/util";

/**
 * Per-area caps. The area shares (Central 35-40%, North 25-30%, Medical and Athletic 12-15%) are a guide,
 * not a reason to drop good photos, so by default every area fills until no candidate fits the spread rules;
 * PICK_ORDER gives the scarce areas first claim. Medical runs out early: the hospital complex has almost no
 * Mapillary coverage (53 images in 3 sequences) and Commons photos there cluster at a few entrances.
 */
const OPEN = 10_000;
const QUOTAS: Record<CampusArea, number> = { central: OPEN, north: OPEN, medical: OPEN, athletic: OPEN, other: OPEN };
/**
 * Minimum distance between any two photos (on top of one per 70 m cell, which alone allows neighbours a few
 * metres apart across a cell edge). It was 50 m; at that spacing the pools ran dry at ~180 photos, and 30 m
 * adds ~30 more. Pairs under 50 m get a side-by-side look in review so no two show the same view.
 */
const MIN_DIST_M = 30;
const DIAG_MAX_SHARE = 0.08;
const SEQ_MAX = 2;
const SEQ_MIN_DIST_M = 100;
/** A candidate is "in the gap" when it is at least this fraction as far from existing picks as the farthest one. */
const WINDOW = 0.7;
/** Scarce areas pick first so they get first claim on shared Mapillary sequences. */
const PICK_ORDER: CampusArea[] = ["medical", "athletic", "other", "north", "central"];
/**
 * Review rejections that say something about neighbouring candidates too:
 *  - Mapillary "vehicle" (hood, dashboard, mirror, windshield reflections) or "blur" (low light, shake):
 *    the same camera setup runs through the whole sequence, so skip the sequence.
 *  - Commons "interior", "people", "elevated", "closeup": photographers upload whole sessions
 *    (a game day, a concert), so skip that author's other photos from the same day at the same venue
 *    (within 150 m; some authors cover the whole campus in a day).
 *  - "nondescript" (bare road, trees): the spot itself offers nothing to place it by.
 */
const BLOCK_SEQUENCE_REASONS = new Set(["vehicle", "blur"]);
const BLOCK_SESSION_REASONS = new Set(["interior", "people", "elevated", "closeup"]);
const BLOCK_SPOT_REASONS = new Set(["nondescript"]);
const BLOCK_SPOT_RADIUS_M = 100;
const SESSION_RADIUS_M = 150;
/**
 * Commons titles that name a game, event or interior. Most Athletic-area Commons uploads are game-day shots
 * from the stands; review rejected nearly all of the ones that were picked, so they are no longer candidates.
 */
const EVENT_TITLE = /\bvs\.?\b|\bgame\b|interior|crowd|\bband\b|concert|tailgat|commencement|graduation|hockey|basketball|football 20|softball 20|baseball 20|lacrosse|wrestling|gymnastics|volleyball|swimming/i;

interface Picked {
  lat: number;
  lng: number;
  area: CampusArea;
  source: string;
  sequence?: string;
  capturedAt?: string;
}

const season = (iso?: string) => {
  if (!iso) return null;
  const m = Number(iso.slice(5, 7));
  return m === 12 || m <= 2 ? "winter" : m <= 5 ? "spring" : m <= 8 ? "summer" : "fall";
};

class Selection {
  picked: Picked[] = [];
  cells = new Set<string>();
  bySeq = new Map<string, Picked[]>();
  seasons = new Map<string, number>();
  nearDiag = 0;
  constructor(private diagCap: number) {}

  add(p: Picked) {
    this.picked.push(p);
    this.cells.add(cellKey(p.lat, p.lng));
    if (p.sequence) this.bySeq.set(p.sequence, [...(this.bySeq.get(p.sequence) ?? []), p]);
    const s = season(p.capturedAt);
    if (s) this.seasons.set(s, (this.seasons.get(s) ?? 0) + 1);
    if (haversine(p.lat, p.lng, DIAG.lat, DIAG.lng) <= DIAG_RADIUS_M) this.nearDiag++;
  }

  count(area: CampusArea) {
    return this.picked.filter((p) => p.area === area).length;
  }

  /** Hard rules other than spacing (spacing is checked with the running distance). */
  allowed(c: Candidate): boolean {
    if (this.cells.has(cellKey(c.lat, c.lng))) return false;
    if (this.nearDiag >= this.diagCap && haversine(c.lat, c.lng, DIAG.lat, DIAG.lng) <= DIAG_RADIUS_M) return false;
    if (c.sequence) {
      const same = this.bySeq.get(c.sequence) ?? [];
      if (same.length >= SEQ_MAX) return false;
      if (same.some((p) => haversine(p.lat, p.lng, c.lat, c.lng) < SEQ_MIN_DIST_M)) return false;
    }
    return true;
  }

  score(c: Candidate): number {
    const total = Math.max(1, [...this.seasons.values()].reduce((a, b) => a + b, 0));
    const s = season(c.capturedAt);
    const seasonBonus = s ? 0.25 * (1 - (this.seasons.get(s) ?? 0) / total) : 0;
    const year = c.capturedAt ? Number(c.capturedAt.slice(0, 4)) : 2015;
    const recency = year >= 2021 ? 0.1 : year >= 2017 ? 0.03 : 0;
    const walking = c.onFoot ? 0.15 : 0; // quads, paths and building fronts rather than roads
    return (c.quality ?? 0.5) + seasonBonus + recency + walking;
  }
}

/** Farthest-point sampling with a quality window. Returns the candidates to add, in pick order. */
function select(campusPool: Candidate[], existing: Picked[], quotas: Record<CampusArea, number>, diagCap: number): Candidate[] {
  const sel = new Selection(diagCap);
  for (const p of existing) sel.add(p);
  const out: Candidate[] = [];
  for (const area of PICK_ORDER) {
    const pool = campusPool.filter((c) => c.area === area);
    const dist = pool.map((c) => Math.min(Infinity, ...sel.picked.map((p) => haversine(p.lat, p.lng, c.lat, c.lng))));
    const dead = new Array<boolean>(pool.length).fill(false);
    while (sel.count(area) < quotas[area]) {
      let dmax = -1;
      for (let i = 0; i < pool.length; i++) {
        if (dead[i]) continue;
        if (dist[i] < MIN_DIST_M || !sel.allowed(pool[i])) {
          dead[i] = true;
          continue;
        }
        dmax = Math.max(dmax, dist[i]);
      }
      if (dmax < 0) break; // nothing left that fits the rules
      let best = -1;
      let bestKey = [-Infinity, -Infinity];
      for (let i = 0; i < pool.length; i++) {
        if (dead[i] || dist[i] < WINDOW * dmax) continue;
        const key = [pool[i].source === "mapillary" ? 1 : 0, sel.score(pool[i])];
        if (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) [best, bestKey] = [i, key];
      }
      const c = pool[best];
      sel.add({ lat: c.lat, lng: c.lng, area, source: c.source, sequence: c.sequence, capturedAt: c.capturedAt });
      out.push(c);
      dead[best] = true;
      for (let i = 0; i < pool.length; i++) if (!dead[i]) dist[i] = Math.min(dist[i], haversine(c.lat, c.lng, pool[i].lat, pool[i].lng));
    }
  }
  return out;
}

async function freshMapillaryUrl(id: string): Promise<string | null> {
  const token = getEnv("MAPILLARY_TOKEN");
  if (!token) return null;
  const res = await fetchWithRetry(`https://graph.mapillary.com/${id}?access_token=${encodeURIComponent(token)}&fields=thumb_2048_url`, { label: `mapillary image ${id}` });
  if (!res.ok) return null;
  return ((await res.json()) as { thumb_2048_url?: string }).thumb_2048_url ?? null;
}

async function download(c: Candidate): Promise<Buffer | null> {
  let res = await fetchWithRetry(c.imageUrl, { label: `${c.source} ${c.sourceId}` });
  if (!res.ok && c.source === "mapillary") {
    await res.body?.cancel().catch(() => {});
    const url = await freshMapillaryUrl(c.sourceId); // signed thumbnail URLs expire
    if (!url) return null;
    res = await fetchWithRetry(url, { label: `mapillary ${c.sourceId}` });
  }
  if (!res.ok) {
    console.warn(`  ${c.source} ${c.sourceId}: HTTP ${res.status}`);
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

function loadPool(source: string): Candidate[] {
  const file = cachePath(source, "candidates.json");
  if (!fs.existsSync(file)) {
    console.warn(`No ${source} candidates yet (run npm run photos:${source}); continuing without them.`);
    return [];
  }
  return readJson<Candidate[]>(file);
}

async function main() {
  const { flags } = parseArgs();
  const quotas = { ...QUOTAS };
  for (const a of AREAS) if (typeof flags[a] === "string") quotas[a] = Number(flags[a]);
  const limit = typeof flags.limit === "string" ? Number(flags.limit) : Infinity;
  let added = 0;
  let diagCap = Infinity;
  const diagDistance = (p: { lat: number; lng: number }) => haversine(p.lat, p.lng, DIAG.lat, DIAG.lng);
  const dryRun = !!flags["dry-run"];

  const campus = loadCampus();
  const pools = [...loadPool("mapillary"), ...loadPool("commons").filter((c) => !EVENT_TITLE.test(c.sourceId))];
  const seqByKey = new Map(pools.filter((c) => c.sequence).map((c) => [sourceKey(c.source, c.sourceId), c.sequence!]));
  const capturedByKey = new Map(pools.map((c) => [sourceKey(c.source, c.sourceId), c.capturedAt]));
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });

  let rejected = loadRejected();
  const rejectedKeys = () => new Set(rejected.map((r) => sourceKey(r.source, r.sourceId)));

  // Existing photos: drop ones that were rejected, lost their file, or fall outside the campus now.
  let photos = loadPhotos().filter((p) => {
    const key = photoSourceKey(p);
    const keep = (!key || !rejectedKeys().has(key)) && fs.existsSync(photoFile(p.id)) && areaAt(campus, p.lat, p.lng);
    if (!keep) console.log(`  dropping ${p.id} (rejected, missing file or outside campus)`);
    return keep;
  });
  photos = photos.map((p) => ({ ...p, area: areaAt(campus, p.lat, p.lng)! }));
  // An area over its quota (after a quota change) loses the photos that sit closest to another photo.
  for (const a of AREAS) {
    while (photos.filter((p) => p.area === a).length > quotas[a]) {
      const nearest = (p: Photo) => Math.min(...photos.filter((q) => q !== p).map((q) => haversine(p.lat, p.lng, q.lat, q.lng)));
      const drop = photos.filter((p) => p.area === a).sort((x, y) => nearest(x) - nearest(y))[0];
      console.log(`  ${a} is over its quota of ${quotas[a]}: dropping ${drop.id} (${Math.round(nearest(drop))} m from its nearest neighbour)`);
      photos = photos.filter((p) => p !== drop);
    }
  }
  if (!dryRun) savePhotos(photos);

  const poolByKey = new Map(pools.map((c) => [sourceKey(c.source, c.sourceId), c]));
  for (let round = 1; round <= 8; round++) {
    const used = new Set([...photos.map(photoSourceKey), ...rejectedKeys()]);
    const blockedSeqs = new Set<string>();
    const blockedSessions: Candidate[] = [];
    const blockedSpots: Candidate[] = [];
    for (const r of rejected) {
      const c = r.by === "review" ? poolByKey.get(sourceKey(r.source, r.sourceId)) : undefined;
      if (!c) continue;
      if (c.sequence && BLOCK_SEQUENCE_REASONS.has(r.reason)) blockedSeqs.add(c.sequence);
      if (c.source === "commons" && c.capturedAt && BLOCK_SESSION_REASONS.has(r.reason)) blockedSessions.push(c);
      if (BLOCK_SPOT_REASONS.has(r.reason)) blockedSpots.push(c);
    }
    const sameSession = (a: Candidate, b: Candidate) =>
      a.author === b.author && a.capturedAt?.slice(0, 10) === b.capturedAt?.slice(0, 10) && haversine(a.lat, a.lng, b.lat, b.lng) < SESSION_RADIUS_M;
    const blocked = (c: Candidate) =>
      (c.sequence && blockedSeqs.has(c.sequence)) ||
      (c.source === "commons" && blockedSessions.some((s) => sameSession(s, c))) ||
      blockedSpots.some((s) => haversine(s.lat, s.lng, c.lat, c.lng) < BLOCK_SPOT_RADIUS_M);
    const pool = pools.filter((c) => !used.has(sourceKey(c.source, c.sourceId)) && areaAt(campus, c.lat, c.lng) === c.area && !blocked(c));
    const toPicked = (list: Photo[]): Picked[] =>
      list.map((p) => {
        const key = photoSourceKey(p) ?? "";
        return { lat: p.lat, lng: p.lng, area: p.area!, source: p.source, sequence: seqByKey.get(key), capturedAt: capturedByKey.get(key) };
      });

    // The Diag cap is 8% of the set this run ends with, which depends on what fits; settle it in a few passes.
    // If photos already near the Diag exceed it, drop the ones closest to the Diag center.
    let picks: Candidate[] = [];
    let fit = 0;
    for (let pass = 0; pass < 5; pass++) {
      picks = select(pool, toPicked(photos), quotas, diagCap);
      fit = picks.length;
      picks = picks.slice(0, Math.max(0, limit - added));
      const cap = Math.floor(DIAG_MAX_SHARE * (photos.length + picks.length));
      const near = photos.filter((p) => diagDistance(p) <= DIAG_RADIUS_M).sort((a, b) => diagDistance(a) - diagDistance(b));
      if (cap >= diagCap && near.length <= diagCap) break;
      diagCap = Math.min(diagCap, cap);
      const drop = new Set(near.slice(0, Math.max(0, near.length - diagCap)).map((p) => p.id));
      if (drop.size) {
        console.log(`  Diag cap is now ${diagCap}: dropping ${drop.size} photo(s) nearest the Diag: ${[...drop].join(", ")}`);
        photos = photos.filter((p) => !drop.has(p.id));
        if (!dryRun) savePhotos(photos);
      }
    }
    console.log(
      `Round ${round}: ${photos.length} kept, ${picks.length} new picks (${fit} candidates fit the rules)`,
      Object.fromEntries(AREAS.map((a) => [a, picks.filter((p) => p.area === a).length])),
    );
    if (!picks.length || dryRun) break;

    for (const c of picks) {
      const buf = await download(c).catch((err) => {
        console.warn(`  ${c.source} ${c.sourceId}: ${String(err)}`);
        return null;
      });
      const reject = (reason: string, note: string) => {
        rejected = [...rejected, { source: c.source, sourceId: c.sourceId, reason, note, by: "auto" } satisfies Rejection];
        saveRejected(rejected);
        console.log(`  auto-rejected ${c.source} ${c.sourceId}: ${reason} (${note})`);
      };
      if (!buf) {
        reject("download failed", "image could not be downloaded");
        continue;
      }
      let encoded;
      try {
        encoded = await encodeWebp(buf);
      } catch (err) {
        reject("unreadable", String(err).slice(0, 120));
        continue;
      }
      const stats = await imageStats(encoded.data);
      if (stats.chroma < 6) {
        reject("black-and-white", `chroma ${stats.chroma.toFixed(1)}`);
        continue;
      }
      if (stats.brightness < 40) {
        reject("too dark", `mean brightness ${stats.brightness.toFixed(0)}`);
        continue;
      }
      const id = randomId();
      const file = photoFile(id);
      fs.writeFileSync(file, encoded.data);
      await assertNoMetadata(file);
      photos.push({
        id,
        src: `/photos/${id}.webp`,
        width: encoded.width,
        height: encoded.height,
        lat: roundCoord(c.lat),
        lng: roundCoord(c.lng),
        source: c.source,
        author: c.author,
        title: c.title,
        license: c.license,
        licenseUrl: c.licenseUrl,
        sourceUrl: c.sourceUrl,
        area: c.area,
      } satisfies Photo);
      savePhotos(photos);
      added++;
      await sleep(c.source === "commons" ? 500 : 100);
    }
  }

  // Remove files that are no longer listed (e.g. after rejections).
  const listed = new Set(photos.map((p) => `${p.id}.webp`));
  if (!dryRun) for (const f of listPhotoFiles()) if (!listed.has(f)) fs.rmSync(`${PHOTOS_DIR}/${f}`);
  for (const p of photos) await assertNoMetadata(photoFile(p.id));
  console.log(`Checked ${photos.length} files: no EXIF/GPS/XMP/IPTC/ICC data`);

  const placed = photos.map((p) => ({ lat: p.lat, lng: p.lng, area: p.area, source: p.source, sequence: seqByKey.get(photoSourceKey(p) ?? "") }));
  console.log(spreadReport(placed));
  const caps = AREAS.filter((a) => quotas[a] < OPEN).map((a) => `${a} ${quotas[a]}`);
  console.log(`Added ${added} this run; caps: ${caps.join(", ") || "none"}; Diag cap ${diagCap}; ${CELL_M} m cells; min spacing ${MIN_DIST_M} m`);
  await renderCoverage(campus, placed, cachePath("coverage.png"), `${photos.length} photos`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
