import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { CampusArea, Photo } from "../../lib/types";
import { PHOTOS_DIR, PHOTOS_JSON, REJECTED_JSON, readJson, writeJson } from "./util";

export type Source = "mapillary" | "commons";

/** A photo we could use, before it is downloaded. Pools live in .cache/<source>/candidates.json. */
export interface Candidate {
  source: Source;
  /** Mapillary image id, or the Commons file title ("File:....jpg"). */
  sourceId: string;
  lat: number;
  lng: number;
  area: CampusArea;
  /** Where to download the image (Mapillary URLs expire; build.ts refreshes them). */
  imageUrl: string;
  width: number;
  height: number;
  author: string;
  title?: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  /** ISO date the photo was taken, when known. */
  capturedAt?: string;
  /** 0..1, higher is better. Mapillary's quality_score when present. */
  quality?: number;
  /** Mapillary sequence id. */
  sequence?: string;
  creatorId?: string;
  /** Mapillary sequence captured at walking speed (reaches quads and paths, not just roads). */
  onFoot?: boolean;
}

export interface Rejection {
  source: Source;
  sourceId: string;
  /** Our photo id, when the file had been downloaded. */
  id?: string;
  /** Short reason code, e.g. "interior", "vehicle", "license". */
  reason: string;
  note?: string;
  /** "auto" = rejected by a script rule, "review" = rejected after looking at the image. */
  by: "auto" | "review";
}

export const MAPILLARY_LICENSE = "CC BY-SA 4.0";
export const MAPILLARY_LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/";
export const mapillaryUrl = (id: string) => `https://www.mapillary.com/app/?pKey=${id}`;

export const sourceKey = (source: Source, sourceId: string) => `${source}:${sourceId}`;

/** Recover the source id from a stored photo (the Photo type has no field for it). */
export function photoSourceKey(p: Photo): string | null {
  if (!p.sourceUrl) return null;
  if (p.source === "mapillary") {
    const id = new URL(p.sourceUrl).searchParams.get("pKey");
    return id ? sourceKey("mapillary", id) : null;
  }
  if (p.source === "commons") {
    const m = p.sourceUrl.match(/\/wiki\/(File:.+)$/);
    return m ? sourceKey("commons", decodeURIComponent(m[1]).replace(/_/g, " ")) : null;
  }
  return null;
}

export function loadPhotos(): Photo[] {
  return readJson<Photo[]>(PHOTOS_JSON, []);
}

const PHOTO_KEYS: (keyof Photo)[] = ["id", "src", "width", "height", "lat", "lng", "source", "author", "title", "license", "licenseUrl", "sourceUrl", "area"];

/** Validate and write data/photos.json (atomic, stable order, keys in interface order). */
export function savePhotos(photos: Photo[]): void {
  const ids = new Set<string>();
  for (const p of photos) {
    if (!/^[0-9a-z]{12}$/.test(p.id)) throw new Error(`bad id ${p.id}`);
    if (ids.has(p.id)) throw new Error(`duplicate id ${p.id}`);
    ids.add(p.id);
    if (p.src !== `/photos/${p.id}.webp`) throw new Error(`bad src for ${p.id}`);
    for (const k of ["author", "license", "licenseUrl"] as const) if (!p[k]) throw new Error(`${p.id} is missing ${k}`);
    if (!(p.width > 0 && p.height > 0 && Number.isFinite(p.lat) && Number.isFinite(p.lng))) throw new Error(`bad geometry for ${p.id}`);
  }
  const sorted = [...photos].sort((a, b) => a.id.localeCompare(b.id));
  const clean = sorted.map((p) => Object.fromEntries(PHOTO_KEYS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]])) as unknown as Photo);
  writeJson(PHOTOS_JSON, clean);
}

export function loadRejected(): Rejection[] {
  return readJson<Rejection[]>(REJECTED_JSON, []);
}

export function saveRejected(list: Rejection[]): void {
  const seen = new Map<string, Rejection>();
  for (const r of list) seen.set(sourceKey(r.source, r.sourceId), r);
  const sorted = [...seen.values()].sort((a, b) => a.source.localeCompare(b.source) || a.sourceId.localeCompare(b.sourceId));
  writeJson(REJECTED_JSON, sorted);
}

export const photoFile = (id: string) => path.join(PHOTOS_DIR, `${id}.webp`);

export const MAX_EDGE = 1600;
export const WEBP_QUALITY = 75;

/**
 * Resize to at most 1600 px on the long edge and re-encode as WebP. Nothing else changes.
 * Orientation from EXIF is applied first (so the picture is the right way up once EXIF is gone);
 * sharp drops all metadata (EXIF, GPS, XMP, IPTC, ICC) unless asked to keep it, and converts to sRGB.
 */
export async function encodeWebp(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input, { failOn: "error" })
    .autoOrient()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** The RIFF chunk ids in a WebP file, e.g. ["VP8 "] or ["VP8X", "ICCP", "VP8 ", "EXIF"]. */
export function webpChunks(buf: Buffer): string[] {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") throw new Error("not a WebP file");
  const chunks: string[] = [];
  for (let off = 12; off + 8 <= buf.length; ) {
    const size = buf.readUInt32LE(off + 4);
    chunks.push(buf.toString("ascii", off, off + 4));
    off += 8 + size + (size % 2);
  }
  return chunks;
}

/** Throws if an output file still carries EXIF/XMP/IPTC/ICC, checked both by sharp and by reading the RIFF chunks. */
export async function assertNoMetadata(file: string): Promise<void> {
  const meta = await sharp(file).metadata();
  const left = (["exif", "xmp", "iptc", "icc"] as const).filter((k) => meta[k]);
  const chunks = webpChunks(fs.readFileSync(file));
  const extra = chunks.filter((c) => !["VP8 ", "VP8L", "VP8X", "ALPH"].includes(c));
  if (left.length || extra.length) throw new Error(`${file} still has metadata: ${[...left, ...extra].join(", ")}`);
}

/** Cheap image statistics on a small copy: colourfulness (0 = grey) and mean brightness (0..255). */
export async function imageStats(input: Buffer): Promise<{ chroma: number; brightness: number }> {
  const { data, info } = await sharp(input).autoOrient().resize(96, 96, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let chroma = 0;
  let lum = 0;
  const n = info.width * info.height;
  for (let i = 0; i < data.length; i += 3) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    chroma += Math.max(r, g, b) - Math.min(r, g, b);
    lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return { chroma: chroma / n, brightness: lum / n };
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

export function listPhotoFiles(): string[] {
  if (!fs.existsSync(PHOTOS_DIR)) return [];
  return fs.readdirSync(PHOTOS_DIR).filter((f) => f.endsWith(".webp"));
}
