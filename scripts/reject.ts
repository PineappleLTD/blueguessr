// Reject photos after review: records them in data/rejected.json (so no run picks them again),
// removes them from data/photos.json and deletes their files. Then run photos:build to refill.
//
//   npm run photos:reject -- --reason vehicle 2:4 2:9      (sheet:number from photos:sheets)
//   npm run photos:reject -- --reason interior --note "lobby" abc123def456
//
// Reason codes used so far: interior, closeup, aerial, vehicle (hood/dashboard/windshield glare), blur,
// dark, duplicate, historical, people, obstructed, event, nondescript.
import fs from "node:fs";
import path from "node:path";
import { loadPhotos, loadRejected, photoFile, photoSourceKey, savePhotos, saveRejected, type Source } from "./lib/photos";
import { CACHE_DIR, parseArgs, readJson } from "./lib/util";

function main() {
  const { flags, rest } = parseArgs();
  const reason = typeof flags.reason === "string" ? flags.reason : null;
  if (!reason || !rest.length) {
    console.error("usage: npm run photos:reject -- --reason <code> [--note text] <sheet:n | photo id> ...");
    process.exit(1);
  }
  const index = readJson<Record<string, string>>(path.join(CACHE_DIR, "sheets", "index.json"), {});
  const ids = rest.map((ref) => (/^\d+:\d+$/.test(ref) ? index[ref] : ref));
  const photos = loadPhotos();
  const rejected = loadRejected();
  const remove = new Set<string>();
  for (const [i, id] of ids.entries()) {
    const p = photos.find((x) => x.id === id);
    const key = p && photoSourceKey(p);
    if (!p || !key) {
      console.error(`  ${rest[i]}: no such photo`);
      continue;
    }
    const [source, ...sid] = key.split(":");
    rejected.push({ source: source as Source, sourceId: sid.join(":"), id: p.id, reason, note: typeof flags.note === "string" ? flags.note : undefined, by: "review" });
    remove.add(p.id);
    fs.rmSync(photoFile(p.id), { force: true });
    console.log(`  rejected ${rest[i]} -> ${p.id} (${key})`);
  }
  saveRejected(rejected);
  savePhotos(photos.filter((p) => !remove.has(p.id)));
  console.log(`${remove.size} rejected as "${reason}"; ${photos.length - remove.size} photos left`);
}

main();
