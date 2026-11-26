// Contact sheets for reviewing photos: numbered grids of thumbnails in .cache/sheets/.
//
//   npm run photos:sheets                      sheets of photos not reviewed yet
//   npm run photos:sheets -- --all             every photo
//   npm run photos:sheets -- --mark-reviewed   mark everything on the current sheets as reviewed
//
// Each tile is labelled "<n> <M|C> <area>". Reject with: npm run photos:reject -- --reason <code> 3:7 3:12 ...
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadPhotos, photoFile } from "./lib/photos";
import { CACHE_DIR, parseArgs, readJson, writeJson } from "./lib/util";

const COLS = 5;
const ROWS = 4;
const TW = 384;
const TH = 256;
const LABEL_H = 22;

const SHEETS_DIR = path.join(CACHE_DIR, "sheets");
const INDEX = path.join(SHEETS_DIR, "index.json");
const REVIEWED = path.join(CACHE_DIR, "reviewed.json");

async function main() {
  const { flags } = parseArgs();
  fs.mkdirSync(SHEETS_DIR, { recursive: true });
  const reviewed = new Set(readJson<string[]>(REVIEWED, []));

  if (flags["mark-reviewed"]) {
    const index = readJson<Record<string, string>>(INDEX, {});
    const present = new Set(loadPhotos().map((p) => p.id));
    for (const id of Object.values(index)) if (present.has(id)) reviewed.add(id);
    writeJson(REVIEWED, [...reviewed].sort());
    console.log(`${reviewed.size} photos marked as reviewed`);
    return;
  }

  const photos = loadPhotos()
    .filter((p) => flags.all || !reviewed.has(p.id))
    .sort((a, b) => (a.area ?? "").localeCompare(b.area ?? "") || a.source.localeCompare(b.source) || a.lat - b.lat);
  for (const f of fs.readdirSync(SHEETS_DIR)) if (f.endsWith(".png")) fs.rmSync(path.join(SHEETS_DIR, f));
  const index: Record<string, string> = {};
  const perSheet = COLS * ROWS;
  const sheets = Math.ceil(photos.length / perSheet);
  for (let s = 0; s < sheets; s++) {
    const batch = photos.slice(s * perSheet, (s + 1) * perSheet);
    const tiles = await Promise.all(
      batch.map(async (p, i) => {
        const n = i + 1;
        index[`${s + 1}:${n}`] = p.id;
        const img = await sharp(photoFile(p.id)).resize(TW, TH, { fit: "contain", background: "#222" }).toBuffer();
        const label = `${n} ${p.source === "mapillary" ? "M" : "C"} ${p.area ?? ""}`;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#ffd400"/><text x="6" y="16" font-family="sans-serif" font-weight="bold" font-size="15" fill="#000">${label}</text></svg>`;
        return [
          { input: img, left: (i % COLS) * TW, top: Math.floor(i / COLS) * (TH + LABEL_H) + LABEL_H },
          { input: Buffer.from(svg), left: (i % COLS) * TW, top: Math.floor(i / COLS) * (TH + LABEL_H) },
        ];
      }),
    );
    const file = path.join(SHEETS_DIR, `sheet-${String(s + 1).padStart(2, "0")}.png`);
    await sharp({ create: { width: COLS * TW, height: ROWS * (TH + LABEL_H), channels: 3, background: "#000" } })
      .composite(tiles.flat())
      .png()
      .toFile(file);
    console.log(file);
  }
  writeJson(INDEX, index);
  console.log(`${photos.length} photos on ${sheets} sheets`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
