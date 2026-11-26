import "server-only";
import { createHash } from "node:crypto";
import {
  areaOf,
  MAX_PENDING_PER_PLAYER,
  PHOTO_LICENSE,
  PHOTO_LICENSE_URL,
  type FaceBox,
} from "@/components/contribute/shared";
import { CAMPUS } from "./campus";
import { campusFeatureAt, type CampusFeature } from "./geo";
import { kv } from "./kv";
import { APPROVED_PLAYER_PHOTOS_KEY } from "./photos";
import type { LngLat, Photo } from "./types";
import { blurFaces, deleteImage, newId, readImage, storeImage } from "./uploads";

/**
 * The player-photo review queue.
 *
 * KV layout (every command is atomic on its own; there is no MULTI):
 * - contrib:pending          hash  id -> PendingContribution
 * - contrib:slots:<playerId> hash  "0".."9" -> {id, at}; hsetnx on a free slot caps each player
 * - contrib:approved         hash  photo id -> {approvedAt, playerId} (bookkeeping for approved photos)
 * - photos:player            hash  photo id -> Photo (APPROVED_PLAYER_PHOTOS_KEY, read by the game)
 * - lock:contrib:<id>        string, set nx so two reviewers can't handle one photo at once
 * - rl:<what>:<window>       counters for rate limits
 */

export const PENDING_KEY = "contrib:pending";
const APPROVED_META_KEY = "contrib:approved";
const slotsKey = (playerId: string) => `contrib:slots:${playerId}`;

/** A photo waiting for review. */
export interface PendingContribution {
  id: string;
  src: string;
  width: number;
  height: number;
  lat: number;
  lng: number;
  name: string;
  /** The submitter's secret player id. Never sent to the browser. */
  playerId: string;
  /** Faces found in the browser, for the reviewer to blur. */
  faces: FaceBox[];
  createdAt: number;
}

/** What the review page gets: everything but the player id. */
export type PendingView = Omit<PendingContribution, "playerId">;

export interface ApprovedView extends Photo {
  approvedAt: number | null;
}

/** An error with an HTTP status and a short message for the UI. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const jsonError = (status: number, error: string) => Response.json({ error }, { status });

/** Turns a thrown error into a JSON response; unexpected errors are logged and hidden. */
export function errorResponse(e: unknown, what: string): Response {
  if (e instanceof HttpError) return jsonError(e.status, e.message);
  console.error(`[blueguessr] ${what} failed:`, e);
  return jsonError(500, "Something went wrong. Try again.");
}

/** Player ids come from lib/player.ts: 32 random hex characters. */
export const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function campusSpot(p: LngLat): CampusFeature | null {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
  if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return null;
  return campusFeatureAt(CAMPUS, p);
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

// ---------- rate limits ----------

/** Counts a hit in a fixed window; false once `limit` hits have been seen in this window. */
export async function underLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const k = `rl:${key}:${bucket}`;
  const n = await kv().incr(k);
  if (n === 1) await kv().expire(k, windowSeconds + 60);
  return n <= limit;
}

/** A short hash of the caller's IP, so rate limits don't store raw addresses. */
export function clientKey(req: Request): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(`blueguessr:${ip}`).digest("hex").slice(0, 24);
}

// ---------- per-player pending slots ----------

interface Slot {
  id: string;
  at: number;
}

/** A slot older than this whose submission never made it into the queue was leaked by a crash. */
const STALE_SLOT_MS = 15 * 60 * 1000;

/**
 * Claims one of the player's MAX_PENDING_PER_PLAYER slots for submission `id`.
 * hsetnx makes each slot first-come-first-served, so parallel uploads can't exceed the cap.
 */
export async function reserveSlot(playerId: string, id: string): Promise<boolean> {
  const key = slotsKey(playerId);
  const taken = await kv().hgetall<Slot>(key);
  const now = Date.now();
  for (let i = 0; i < MAX_PENDING_PER_PLAYER; i++) {
    const field = String(i);
    const cur = taken[field];
    if (cur) {
      if (now - cur.at < STALE_SLOT_MS || (await kv().hget(PENDING_KEY, cur.id))) continue;
      await kv().hdel(key, field);
    }
    if (await kv().hsetnx(key, field, { id, at: now } satisfies Slot)) return true;
  }
  return false;
}

export async function releaseSlot(playerId: string, id: string): Promise<void> {
  const key = slotsKey(playerId);
  const taken = await kv().hgetall<Slot>(key);
  for (const [field, slot] of Object.entries(taken)) if (slot?.id === id) await kv().hdel(key, field);
}

export async function pendingCount(playerId: string): Promise<number> {
  return Object.keys(await kv().hgetall<Slot>(slotsKey(playerId))).length;
}

// ---------- queue ----------

export async function addPending(entry: PendingContribution): Promise<void> {
  await kv().hset(PENDING_KEY, entry.id, { ...entry, lat: round6(entry.lat), lng: round6(entry.lng) });
}

function toView({ playerId: _secret, ...rest }: PendingContribution): PendingView {
  void _secret;
  return rest;
}

/** Everything the review page shows: the queue (oldest first) and the live player photos. */
export async function reviewData(): Promise<{ pending: PendingView[]; approved: ApprovedView[] }> {
  const [pending, approved, meta] = await Promise.all([
    kv().hgetall<PendingContribution>(PENDING_KEY),
    kv().hgetall<Photo>(APPROVED_PLAYER_PHOTOS_KEY),
    kv().hgetall<{ approvedAt: number }>(APPROVED_META_KEY),
  ]);
  return {
    pending: Object.values(pending)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(toView),
    approved: Object.values(approved)
      .map((p) => ({ ...p, approvedAt: meta[p.id]?.approvedAt ?? null }))
      .sort((a, b) => (b.approvedAt ?? 0) - (a.approvedAt ?? 0)),
  };
}

/** Runs `fn` while holding a short lock on one submission, so two reviewers can't collide. */
async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const key = `lock:contrib:${id}`;
  if (!(await kv().set(key, 1, { nx: true, ex: 120 }))) {
    throw new HttpError(409, "Someone is already reviewing this one");
  }
  try {
    return await fn();
  } finally {
    await kv().del(key);
  }
}

async function getPendingOr404(id: string): Promise<PendingContribution> {
  const entry = await kv().hget<PendingContribution>(PENDING_KEY, id);
  if (!entry) throw new HttpError(404, "Already reviewed");
  return entry;
}

async function dropPending(entry: PendingContribution): Promise<void> {
  await kv().hdel(PENDING_KEY, entry.id);
  await releaseSlot(entry.playerId, entry.id);
  await deleteImage(entry.src).catch((e) => console.error("[blueguessr] pending image delete failed:", e));
}

/**
 * Publishes a pending photo: blurs the chosen faces, stores the result under a new random
 * name, adds it to the game's player photos and clears the queue entry and its image.
 */
export async function approvePending(id: string, edit: { lat: number; lng: number; faces: FaceBox[] }): Promise<Photo> {
  const spot = campusSpot(edit);
  if (!spot) throw new HttpError(400, "Put the pin on campus");
  return withLock(id, async () => {
    const entry = await getPendingOr404(id);
    const final = await blurFaces(await readImage(entry.src), edit.faces);
    const photoId = newId();
    const photo: Photo = {
      id: photoId,
      src: await storeImage(final.data, "photo", photoId),
      width: final.width,
      height: final.height,
      lat: round6(edit.lat),
      lng: round6(edit.lng),
      source: "player",
      author: entry.name,
      license: PHOTO_LICENSE,
      licenseUrl: PHOTO_LICENSE_URL,
      area: areaOf(spot),
    };
    await kv().hset(APPROVED_PLAYER_PHOTOS_KEY, photo.id, photo);
    await kv().hset(APPROVED_META_KEY, photo.id, { approvedAt: Date.now(), playerId: entry.playerId });
    await dropPending(entry);
    return photo;
  });
}

/** Throws a pending photo away: queue entry and image. */
export async function rejectPending(id: string): Promise<void> {
  await withLock(id, async () => dropPending(await getPendingOr404(id)));
}

/** Takes an approved player photo out of the game and deletes its image. */
export async function removeApproved(id: string): Promise<void> {
  const photo = await kv().hget<Photo>(APPROVED_PLAYER_PHOTOS_KEY, id);
  if (!photo) throw new HttpError(404, "Already removed");
  await kv().hdel(APPROVED_PLAYER_PHOTOS_KEY, id);
  await kv().hdel(APPROVED_META_KEY, id);
  await deleteImage(photo.src).catch((e) => console.error("[blueguessr] photo delete failed:", e));
}
