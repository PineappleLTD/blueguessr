import sharp from "sharp";
import type { CampusArea } from "../../lib/types";
import { AREAS, DIAG, campusBBox, type CampusFeature } from "./campus";
import { haversine, toXY } from "./geo";

export interface PlacedPhoto {
  lat: number;
  lng: number;
  area?: CampusArea;
  source: string;
  sequence?: string;
}

export const CELL_M = 70;
export const DIAG_RADIUS_M = 250;

export const cellKey = (lat: number, lng: number, sizeM = CELL_M) => {
  const [x, y] = toXY(lng, lat);
  return `${Math.floor(x / sizeM)}:${Math.floor(y / sizeM)}`;
};

export function spreadReport(photos: PlacedPhoto[]): string {
  const lines: string[] = [];
  const n = photos.length;
  const pct = (k: number) => (n ? ((100 * k) / n).toFixed(1) : "0.0") + "%";
  lines.push(`Total ${n} photos`);
  lines.push("  area      count  share  mapillary  commons");
  for (const a of AREAS) {
    const inArea = photos.filter((p) => p.area === a);
    const m = inArea.filter((p) => p.source === "mapillary").length;
    lines.push(`  ${a.padEnd(9)} ${String(inArea.length).padStart(5)}  ${pct(inArea.length).padStart(5)}  ${String(m).padStart(9)}  ${String(inArea.length - m).padStart(7)}`);
  }
  const nearDiag = photos.filter((p) => haversine(p.lat, p.lng, DIAG.lat, DIAG.lng) <= DIAG_RADIUS_M).length;
  lines.push(`  within ${DIAG_RADIUS_M} m of the Diag: ${nearDiag} (${pct(nearDiag)})`);

  const cells = new Map<string, number>();
  for (const p of photos) cells.set(cellKey(p.lat, p.lng), (cells.get(cellKey(p.lat, p.lng)) ?? 0) + 1);
  const crowded = [...cells.values()].filter((c) => c > 1).length;
  let minD = Infinity;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) minD = Math.min(minD, haversine(photos[i].lat, photos[i].lng, photos[j].lat, photos[j].lng));
  lines.push(`  ${CELL_M} m cells with more than one photo: ${crowded}; closest pair: ${Number.isFinite(minD) ? Math.round(minD) : "-"} m`);

  const bySeq = new Map<string, PlacedPhoto[]>();
  for (const p of photos) if (p.sequence) bySeq.set(p.sequence, [...(bySeq.get(p.sequence) ?? []), p]);
  const seqOver = [...bySeq.values()].filter((l) => l.length > 2).length;
  const seqClose = [...bySeq.values()].filter((l) => l.length === 2 && haversine(l[0].lat, l[0].lng, l[1].lat, l[1].lng) < 100).length;
  lines.push(`  Mapillary sequences: ${bySeq.size}; with >2 photos: ${seqOver}; pairs <100 m apart: ${seqClose}`);
  return lines.join("\n");
}

const AREA_FILL: Record<CampusArea, string> = {
  central: "#dbe7ff",
  north: "#dff3e1",
  medical: "#ffe0e0",
  athletic: "#fff2c9",
  other: "#ece3ff",
};

/** Draw the campus outline and photo points to a PNG. */
export async function renderCoverage(campus: CampusFeature[], photos: PlacedPhoto[], file: string, title: string): Promise<void> {
  const main = campus.filter((f) => f.area !== "other");
  const [minLng, minLat, maxLng, maxLat] = campusBBox(main.length ? main : campus);
  const pad = 0.002;
  const [x0, y0] = toXY(minLng - pad, minLat - pad);
  const [x1, y1] = toXY(maxLng + pad, maxLat + pad);
  const W = 1500;
  const scale = W / (x1 - x0);
  const H = Math.round((y1 - y0) * scale) + 40;
  const px = (lng: number, lat: number) => {
    const [x, y] = toXY(lng, lat);
    return [(x - x0) * scale, H - 40 - (y - y0) * scale].map((v) => v.toFixed(1)).join(",");
  };
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>`;
  for (const f of campus) {
    const d = f.rings.map((r) => "M" + r.map(([lng, lat]) => px(lng, lat)).join("L") + "Z").join(" ");
    svg += `<path d="${d}" fill="${AREA_FILL[f.area]}" fill-rule="evenodd" stroke="#4a5a7a" stroke-width="1.5"/>`;
  }
  const [dx, dy] = px(DIAG.lng, DIAG.lat).split(",").map(Number);
  svg += `<circle cx="${dx}" cy="${dy}" r="${(DIAG_RADIUS_M * scale).toFixed(1)}" fill="none" stroke="#c00" stroke-dasharray="6 4" stroke-width="1.5"/>`;
  for (const p of photos) {
    const [cx, cy] = px(p.lng, p.lat).split(",");
    const color = p.source === "mapillary" ? "#1d4ed8" : p.source === "commons" ? "#ea580c" : "#16a34a";
    svg += `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${color}" stroke="#fff" stroke-width="1"/>`;
  }
  // 500 m scale bar
  svg += `<rect x="20" y="${H - 26}" width="${(500 * scale).toFixed(1)}" height="6" fill="#333"/><text x="20" y="${H - 32}" font-family="sans-serif" font-size="14">500 m</text>`;
  svg += `<text x="${W - 20}" y="${H - 14}" text-anchor="end" font-family="sans-serif" font-size="15">${title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}  (blue = Mapillary, orange = Commons, red circle = ${DIAG_RADIUS_M} m around the Diag)</text>`;
  svg += "</svg>";
  await sharp(Buffer.from(svg)).png().toFile(file);
}
