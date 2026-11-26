// Prints the spread of data/photos.json and draws it over the campus outline (.cache/coverage.png).
//
//   npm run photos:coverage
//   npm run photos:coverage -- --pool mapillary   (plot a candidate pool instead)
import fs from "node:fs";
import { loadCampus } from "./lib/campus";
import { loadPhotos, photoSourceKey, sourceKey, type Candidate } from "./lib/photos";
import { renderCoverage, spreadReport, type PlacedPhoto } from "./lib/stats";
import { cachePath, parseArgs, readJson } from "./lib/util";

function loadPool(source: string): Candidate[] {
  const file = cachePath(source, "candidates.json");
  return fs.existsSync(file) ? readJson<Candidate[]>(file) : [];
}

async function main() {
  const { flags } = parseArgs();
  const campus = loadCampus();
  const out = typeof flags.out === "string" ? flags.out : cachePath("coverage.png");

  if (typeof flags.pool === "string") {
    const pool = loadPool(flags.pool);
    await renderCoverage(campus, pool, out, `${flags.pool} candidate pool: ${pool.length}`);
    console.log(`${pool.length} candidates plotted to ${out}`);
    return;
  }

  const seqByKey = new Map<string, string>();
  for (const c of loadPool("mapillary")) if (c.sequence) seqByKey.set(sourceKey("mapillary", c.sourceId), c.sequence);
  const photos = loadPhotos();
  const placed: PlacedPhoto[] = photos.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    area: p.area,
    source: p.source,
    sequence: seqByKey.get(photoSourceKey(p) ?? ""),
  }));
  console.log(spreadReport(placed));
  await renderCoverage(campus, placed, out, `${photos.length} photos`);
  console.log(`Coverage map: ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
