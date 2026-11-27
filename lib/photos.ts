import "server-only";
import photosJson from "@/data/photos.json";
import { distanceMeters } from "./geo";
import type { Photo, RoundPhoto, RoundReveal } from "./types";

/** Photos pulled from Mapillary and Wikimedia Commons by scripts/ (see data/photos.json). */
const STATIC_PHOTOS = photosJson as Photo[];

export function staticPhotos(): Photo[] {
  return STATIC_PHOTOS;
}

export async function allPhotos(): Promise<Photo[]> {
  return STATIC_PHOTOS;
}

export async function photoById(id: string): Promise<Photo | null> {
  return STATIC_PHOTOS.find((p) => p.id === id) ?? null;
}

/**
 * Random photos for one game. Tries to keep them at least `minSpacingM` apart so a game
 * doesn't show the same corner twice, relaxing the spacing if the pool is too small.
 */
export async function pickPhotos(
  n: number,
  opts: { exclude?: string[]; minSpacingM?: number; rand?: () => number } = {},
): Promise<Photo[]> {
  const exclude = new Set(opts.exclude ?? []);
  const rand = opts.rand ?? Math.random;
  const pool = (await allPhotos()).filter((p) => !exclude.has(p.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (let spacing = opts.minSpacingM ?? 200; spacing >= 0; spacing -= 50) {
    const picked: Photo[] = [];
    for (const p of pool) {
      if (picked.every((q) => distanceMeters(p, q) >= spacing)) picked.push(p);
      if (picked.length === n) return picked;
    }
    if (spacing === 0) return picked;
  }
  return [];
}

/** Safe to send before the guess: no coordinates, no credit. */
export function toRoundPhoto(p: Photo): RoundPhoto {
  return { id: p.id, src: p.src, width: p.width, height: p.height };
}

/** Sent after the guess. */
export function toReveal(p: Photo): RoundReveal {
  return {
    lat: p.lat,
    lng: p.lng,
    author: p.author,
    title: p.title,
    license: p.license,
    licenseUrl: p.licenseUrl,
    sourceUrl: p.sourceUrl,
    source: p.source,
  };
}
