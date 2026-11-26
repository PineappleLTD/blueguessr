// Contribution rules and helpers shared by the browser and the server. Pure: no server imports.

import type { CampusFeature } from "@/lib/geo";
import type { CampusArea } from "@/lib/types";

/** A face to blur, as fractions of the image (0..1) from its top-left corner. */
export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The upload the browser sends: already resized, so this is plenty. Vercel caps bodies at 4.5 MB. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** Long edge of the photo the browser prepares and the server stores. */
export const MAX_EDGE = 1600;
export const MIN_LONG_EDGE = 480;
export const MIN_SHORT_EDGE = 320;
/** Photos this lopsided don't work in the game viewer. */
export const MAX_ASPECT = 3;
/** How many of one player's photos can wait for review at once. */
export const MAX_PENDING_PER_PLAYER = 10;
export const MAX_FACES = 40;

export const PHOTO_LICENSE = "CC BY-SA 4.0";
export const PHOTO_LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/";

const AREAS: readonly CampusArea[] = ["central", "north", "medical", "athletic", "other"];

export const AREA_LABEL: Record<CampusArea, string> = {
  central: "Central Campus",
  north: "North Campus",
  medical: "Medical Campus",
  athletic: "Athletic Campus",
  other: "Campus",
};

export function areaOf(feature: CampusFeature): CampusArea {
  const a = feature.properties.area;
  return typeof a === "string" && (AREAS as readonly string[]).includes(a) ? (a as CampusArea) : "other";
}

/** Short place name for a campus feature, e.g. "North Campus". */
export function spotLabel(feature: CampusFeature): string {
  const area = areaOf(feature);
  if (area !== "other") return AREA_LABEL[area];
  const name = feature.properties.name;
  return typeof name === "string" && name.length <= 32 ? name : AREA_LABEL.other;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Validates face boxes from an untrusted source (JSON string or parsed array).
 * Drops anything malformed, clips boxes to the image and caps the count.
 */
export function sanitizeFaces(raw: unknown): FaceBox[] {
  let value = raw;
  if (typeof value === "string") {
    if (value.length > 20_000) return [];
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: FaceBox[] = [];
  for (const item of value.slice(0, MAX_FACES)) {
    if (!item || typeof item !== "object") continue;
    const { x, y, w, h } = item as Record<string, unknown>;
    if (![x, y, w, h].every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    const x0 = clamp01(x as number);
    const y0 = clamp01(y as number);
    const x1 = clamp01((x as number) + (w as number));
    const y1 = clamp01((y as number) + (h as number));
    if (x1 - x0 < 0.003 || y1 - y0 < 0.003) continue;
    out.push({ x: round4(x0), y: round4(y0), w: round4(x1 - x0), h: round4(y1 - y0) });
  }
  return out;
}
