import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { CAMPUS } from "./campus";
import { campusFeatureAt, distanceMeters } from "./geo";
import { kv } from "./kv";
import { pickPhotos, toReveal, toRoundPhoto } from "./photos";
import { isBullseye, ROUNDS_PER_GAME, roundScore } from "./scoring";
import type { LngLat, Photo, RoundPhoto, RoundReveal } from "./types";

// Solo games. A game lives in KV under game:<id> (its five photos, answers included, never sent
// before the matching guess) and its guesses in the hash game:<id>:guesses, one field per round.
// Every score is computed here; the browser only ever sends pins.

/** Games (and their guesses) expire a day after they start. */
export const GAME_TTL_SECONDS = 60 * 60 * 24;

const RATE_LIMIT_PER_HOUR = 120;
/** How many recently played photos we remember per player, so new games show new places. */
const SEEN_MAX = 120;
const SEEN_TTL_SECONDS = 60 * 60 * 24 * 30;
/** Spread-out random candidates drawn from the pool before choosing the five rounds. */
const CANDIDATES = 30;
/** Rounds from the same area should be at least this far apart when the pool allows it. */
const SPREAD_METERS = 400;

const gameKey = (id: string) => `game:${id}`;
const guessesKey = (id: string) => `game:${id}:guesses`;
/** Set (nx) when a game is posted to the leaderboard. */
export const submittedKey = (id: string) => `game:${id}:lb`;

export const GAME_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
export const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

// ---------- API shapes (shared with the client via `import type`) ----------

export interface NewGame {
  id: string;
  rounds: RoundPhoto[];
}

/** One guessed round, as POST /api/game/[id]/guess returns it. */
export interface RoundResult {
  /** 0-based round index. */
  round: number;
  guess: LngLat;
  distance: number;
  score: number;
  bullseye: boolean;
  /** Running total after this round. */
  total: number;
  reveal: RoundReveal;
  /** True once the last round is guessed. */
  done: boolean;
}

/** GET /api/game/[id]: everything needed to resume a game after a reload. */
export interface GameState {
  id: string;
  rounds: RoundPhoto[];
  results: RoundResult[];
  done: boolean;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public extra?: Record<string, unknown>,
  ) {
    super(code);
  }
}

/** JSON response that no cache keeps. */
export function apiJson(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function apiFail(e: unknown): Response {
  if (e instanceof ApiError) return apiJson({ error: e.code, ...e.extra }, e.status);
  console.error("[blueguessr] api error", e);
  return apiJson({ error: "server" }, 500);
}

/** Parses a small JSON body; anything else is a 400. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 8_000) throw new ApiError("too-large", 413);
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {}
  throw new ApiError("bad-request", 400);
}

// ---------- identities ----------

/** One-way, salted key for a secret or personal value (player ids, IPs) so KV never holds it raw. */
export function hashKey(value: string): string {
  return createHash("sha256")
    .update(`blueguessr:${process.env.GAME_SECRET ?? ""}:${value}`)
    .digest("base64url")
    .slice(0, 24);
}

export const playerKey = (playerId: string) => hashKey(`player:${playerId}`);

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "local"
  );
}

// ---------- storage ----------

interface StoredGame {
  /** Full photos (answers and credits) snapshotted at creation, so a game survives photo edits. */
  photos: Photo[];
  createdAt: number;
  /** playerKey of whoever started it, when known. Only they can post it to the leaderboard. */
  owner?: string;
}

interface StoredGuess {
  lat: number;
  lng: number;
  distance: number;
  score: number;
  bullseye: boolean;
  at: number;
}

async function loadGame(id: string): Promise<StoredGame> {
  if (!GAME_ID_PATTERN.test(id)) throw new ApiError("not-found", 404);
  const game = await kv().get<StoredGame>(gameKey(id));
  if (!game?.photos?.length) throw new ApiError("not-found", 404);
  return game;
}

/** Guesses in round order. Rounds can only be filled in order, so the fields are always 0..n-1. */
async function loadGuesses(id: string): Promise<StoredGuess[]> {
  const all = await kv().hgetall<StoredGuess>(guessesKey(id));
  const out: StoredGuess[] = [];
  while (all[String(out.length)]) out.push(all[String(out.length)]);
  return out;
}

function resultFor(game: StoredGame, guesses: StoredGuess[], round: number): RoundResult {
  const g = guesses[round];
  let total = 0;
  for (let i = 0; i <= round; i++) total += guesses[i].score;
  return {
    round,
    guess: { lat: g.lat, lng: g.lng },
    distance: g.distance,
    score: g.score,
    bullseye: g.bullseye,
    total,
    reveal: toReveal(game.photos[round]),
    done: round === game.photos.length - 1,
  };
}

// ---------- picking a good mix of places ----------

/** Campus area of a photo: its own tag, else the campus polygon it sits in. */
export function areaOf(p: Photo): string {
  if (p.area) return p.area;
  const area = campusFeatureAt(CAMPUS, p)?.properties.area;
  return typeof area === "string" && area ? area : "other";
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const nearest = (p: Photo, picked: Photo[]) => Math.min(Infinity, ...picked.map((q) => distanceMeters(p, q)));

/**
 * Chooses `n` rounds from already shuffled, spread-out candidates so a game tours campus:
 * each pick draws an area with weight √(its share) that drops every time the area is used,
 * so Central shows up most but North, the medical campus and the athletic campus get their
 * turns too. Within an area it prefers photos far from the ones already chosen.
 */
export function chooseVaried(candidates: Photo[], n: number): Photo[] {
  const groups = new Map<string, Photo[]>();
  for (const p of candidates) {
    const a = areaOf(p);
    const g = groups.get(a);
    if (g) g.push(p);
    else groups.set(a, [p]);
  }
  const size = new Map([...groups].map(([a, ps]) => [a, ps.length]));
  const used = new Map<string, number>();
  const picked: Photo[] = [];
  while (picked.length < n) {
    const open = [...groups].filter(([, ps]) => ps.length > 0);
    if (!open.length) break;
    const weights = open.map(
      ([a]) => (Math.sqrt(size.get(a) ?? 1) * (a === "other" ? 0.5 : 1)) / (1 + 2 * (used.get(a) ?? 0)),
    );
    let r = Math.random() * weights.reduce((s, w) => s + w, 0);
    let k = 0;
    while (k < open.length - 1 && (r -= weights[k]) > 0) k++;
    const [area, ps] = open[k];
    const clear = ps.find((p) => nearest(p, picked) >= SPREAD_METERS);
    const choice = clear ?? ps.reduce((best, p) => (nearest(p, picked) > nearest(best, picked) ? p : best));
    ps.splice(ps.indexOf(choice), 1);
    used.set(area, (used.get(area) ?? 0) + 1);
    picked.push(choice);
  }
  // Random round order, avoiding two rounds in a row from the same area where possible.
  let best = picked;
  let clashes = Infinity;
  for (let t = 0; t < 12 && clashes > 0; t++) {
    const order = shuffle([...picked]);
    const c = order.slice(1).filter((p, i) => areaOf(p) === areaOf(order[i])).length;
    if (c < clashes) [best, clashes] = [order, c];
  }
  return best;
}

/** Five rounds, skipping photos this player saw recently when the pool is big enough. */
async function pickGamePhotos(seen: string[]): Promise<Photo[]> {
  const attempts = seen.length ? [seen, seen.slice(0, Math.floor(seen.length / 2)), []] : [[]];
  for (const exclude of attempts) {
    const candidates = await pickPhotos(CANDIDATES, { exclude, minSpacingM: 150 });
    if (candidates.length >= ROUNDS_PER_GAME) return chooseVaried(candidates, ROUNDS_PER_GAME);
  }
  return [];
}

// ---------- public operations ----------

async function underRateLimit(ipKey: string): Promise<boolean> {
  const key = `rl:game:${ipKey}:${Math.floor(Date.now() / 3_600_000)}`;
  const n = await kv().incr(key);
  if (n === 1) await kv().expire(key, 3600);
  return n <= RATE_LIMIT_PER_HOUR;
}

export async function createGame({ playerId, ip }: { playerId?: string | null; ip: string }): Promise<NewGame> {
  const ipKey = hashKey(`ip:${ip}`);
  if (!(await underRateLimit(ipKey))) throw new ApiError("rate-limited", 429);

  const owner = playerId ? playerKey(playerId) : undefined;
  const seenKey = `seen:${owner ?? ipKey}`;
  const seenRaw = await kv().get<string[]>(seenKey);
  const seen = Array.isArray(seenRaw) ? seenRaw.filter((s) => typeof s === "string") : [];
  const photos = await pickGamePhotos(seen);
  if (photos.length < ROUNDS_PER_GAME) throw new ApiError("no-photos", 503);

  const game: StoredGame = { photos, createdAt: Date.now(), owner };
  let id = "";
  for (let attempt = 0; attempt < 3 && !id; attempt++) {
    const candidate = randomBytes(16).toString("base64url");
    if (await kv().set(gameKey(candidate), game, { ex: GAME_TTL_SECONDS, nx: true })) id = candidate;
  }
  if (!id) throw new ApiError("server", 500);

  const ids = photos.map((p) => p.id);
  await kv().set(seenKey, [...ids, ...seen.filter((s) => !ids.includes(s))].slice(0, SEEN_MAX), {
    ex: SEEN_TTL_SECONDS,
  });
  return { id, rounds: photos.map(toRoundPhoto) };
}

export async function gameState(id: string): Promise<GameState> {
  const game = await loadGame(id);
  const guesses = await loadGuesses(id);
  return {
    id,
    rounds: game.photos.map(toRoundPhoto),
    results: guesses.map((_, i) => resultFor(game, guesses, i)),
    done: guesses.length === game.photos.length,
  };
}

export function validGuess(lat: unknown, lng: unknown): LngLat | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * Scores a guess. Rounds must come in order: `round` has to equal the number of guesses so far.
 * Sending an already guessed round again returns the stored result (safe to retry). The hsetnx
 * makes the first guess for a round win even when two requests race.
 */
export async function submitGuess(id: string, round: number, guess: LngLat): Promise<RoundResult> {
  const game = await loadGame(id);
  if (!Number.isInteger(round) || round < 0 || round >= game.photos.length) throw new ApiError("bad-round", 400);
  const guesses = await loadGuesses(id);
  if (round < guesses.length) return resultFor(game, guesses, round);
  if (round > guesses.length) throw new ApiError("out-of-order", 409, { expected: guesses.length });

  const distance = distanceMeters(guess, game.photos[round]);
  const stored: StoredGuess = {
    lat: guess.lat,
    lng: guess.lng,
    distance,
    score: roundScore(distance),
    bullseye: isBullseye(distance),
    at: Date.now(),
  };
  const first = await kv().hsetnx(guessesKey(id), String(round), stored);
  if (first) await kv().expire(guessesKey(id), GAME_TTL_SECONDS);
  return resultFor(game, first ? [...guesses, stored] : await loadGuesses(id), round);
}

/** Server-side totals of a game, for the leaderboard. */
export async function gameTotals(
  id: string,
): Promise<{ complete: boolean; total: number; bullseyes: number; owner?: string }> {
  const game = await loadGame(id);
  const guesses = await loadGuesses(id);
  return {
    complete: guesses.length === game.photos.length,
    total: guesses.reduce((s, g) => s + g.score, 0),
    bullseyes: guesses.filter((g) => g.bullseye).length,
    owner: game.owner,
  };
}
