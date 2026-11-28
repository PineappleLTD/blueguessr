import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { CAMPUS } from "./campus";
import { campusFeatureAt, distanceMeters } from "./geo";
import { kv } from "./kv";
import { DAILY_ROUND_SECONDS, dailyDate } from "./daily";
import { photoById, pickPhotos, toReveal, toRoundPhoto } from "./photos";
import { isBullseye, ROUNDS_PER_GAME, roundScore } from "./scoring";
import type { LngLat, Photo, RoundPhoto, RoundReveal } from "./types";

// Solo games. A game lives in KV under game:<id> (its five photos, answers included, never sent
// before the matching guess) and its guesses in the hash game:<id>:guesses, one field per round.
// Every score is computed here; the browser only ever sends pins.
//
// Daily games (lib/daily.ts) share one set of photos per day, time each round on the server
// (game:<id>:starts holds when each round began) and are the only games that reach the
// leaderboard: a player's first daily of the day, played without landmarks or map labels.

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
const startsKey = (id: string) => `game:${id}:starts`;
/** The day's five photos, fixed the first time anyone starts that daily. */
const dailyPhotosKey = (day: string) => `daily:${day}:photos`;
/** Set (nx) when a player first starts a day's daily: only that game can be ranked. */
const dailyPlayedKey = (day: string, owner: string) => `daily:${day}:played:${owner}`;
const DAILY_TTL_SECONDS = 60 * 60 * 24 * 3;
/** A timed guess still counts this long after the clock runs out (network lag). */
const GRACE_MS = 2500;
/** Set (nx) when a game is posted to the leaderboard. */
export const submittedKey = (id: string) => `game:${id}:lb`;

export const GAME_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
export const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

// ---------- API shapes (shared with the client via `import type`) ----------

/** Which helpers were on when a game started (they can't change mid-game). */
export interface MapAids {
  landmarks: boolean;
  labels: boolean;
}

/** Why a game can't go on the leaderboard: not a daily, aids on, or not the day's first try. */
export type Unranked = "classic" | "aids" | "replay";

export interface NewGame {
  id: string;
  rounds: RoundPhoto[];
  /** The daily's date ("2026-11-26"), for daily games. */
  day: string | null;
  /** Seconds per round, for timed (daily) games. */
  roundSeconds: number | null;
  ranked: boolean;
  unranked: Unranked | null;
}

/** POST /api/game/[id]/start: the round's clock, for timed games. */
export interface RoundClock {
  round: number;
  endsAt: number;
  serverNow: number;
}

/** One guessed round, as POST /api/game/[id]/guess returns it. */
export interface RoundResult {
  /** 0-based round index. */
  round: number;
  /** Null when the clock ran out before a pin was in. */
  guess: LngLat | null;
  distance: number | null;
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
  day?: string;
  /** Per-round time limit, for timed games. */
  limitMs?: number;
  ranked?: boolean;
  unranked?: Unranked;
}

interface StoredGuess {
  lat: number | null;
  lng: number | null;
  distance: number | null;
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

/** The game and its guesses, read together in one round trip. */
async function loadGameAndGuesses(id: string): Promise<[StoredGame, StoredGuess[]]> {
  if (!GAME_ID_PATTERN.test(id)) throw new ApiError("not-found", 404);
  return Promise.all([loadGame(id), loadGuesses(id)]);
}

function resultFor(game: StoredGame, guesses: StoredGuess[], round: number): RoundResult {
  const g = guesses[round];
  let total = 0;
  for (let i = 0; i <= round; i++) total += guesses[i].score;
  return {
    round,
    guess: g.lat === null || g.lng === null ? null : { lat: g.lat, lng: g.lng },
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

function shuffle<T>(a: T[], rand: () => number = Math.random): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
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
export function chooseVaried(candidates: Photo[], n: number, rand: () => number = Math.random): Photo[] {
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
    let r = rand() * weights.reduce((s, w) => s + w, 0);
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
    const order = shuffle([...picked], rand);
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

/** A repeatable random sequence (mulberry32) from a string seed. */
function seededRandom(seed: string): () => number {
  let a = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The day's five photos: drawn from a seed only the server knows (so nobody can work them out
 * ahead of time), then stored so a deploy mid-day can't change them.
 */
async function dailyPhotos(day: string, stored: unknown): Promise<Photo[]> {
  if (Array.isArray(stored) && stored.length === ROUNDS_PER_GAME) {
    const photos = await Promise.all(stored.map((id) => photoById(id)));
    if (photos.every(Boolean)) return photos as Photo[];
  }
  const rand = seededRandom(hashKey(`daily:${day}`));
  const picked = chooseVaried(await pickPhotos(CANDIDATES, { minSpacingM: 150, rand }), ROUNDS_PER_GAME, rand);
  if (picked.length < ROUNDS_PER_GAME) return [];
  // First start of the day: store our pick unless someone beat us to it, and read back whichever won.
  const [, winner] = await Promise.all([
    kv().set(dailyPhotosKey(day), picked.map((p) => p.id), { nx: true, ex: DAILY_TTL_SECONDS }),
    kv().get<string[]>(dailyPhotosKey(day)),
  ]);
  const ids = winner ?? picked.map((p) => p.id);
  const photos = await Promise.all(ids.map((id) => photoById(id)));
  return photos.every(Boolean) ? (photos as Photo[]) : picked;
}

/** Whether this player has already started today's daily. */
export async function playedDaily(playerId: string): Promise<boolean> {
  return !!(await kv().get(dailyPlayedKey(dailyDate(), playerKey(playerId))));
}

// ---------- public operations ----------

async function underRateLimit(ipKey: string): Promise<boolean> {
  const key = `rl:game:${ipKey}:${Math.floor(Date.now() / 3_600_000)}`;
  // SET NX creates the hour's counter with its expiry; INCR (which keeps the expiry) counts this
  // request. Sent together, so the limit check costs one round trip.
  const [, n] = await Promise.all([kv().set(key, 0, { nx: true, ex: 3600 }), kv().incr(key)]);
  return n <= RATE_LIMIT_PER_HOUR;
}

export async function createGame({
  playerId,
  ip,
  daily = false,
  aids = { landmarks: true, labels: true },
}: {
  playerId?: string | null;
  ip: string;
  daily?: boolean;
  aids?: MapAids;
}): Promise<NewGame> {
  const ipKey = hashKey(`ip:${ip}`);
  const owner = playerId ? playerKey(playerId) : undefined;
  const day = daily ? dailyDate() : null;
  const seenKey = day ? null : `seen:${owner ?? ipKey}`;
  // Round trip 1: the rate limit, plus the day's photos (daily) or the player's recent photos (classic).
  const [allowed, firstRead] = await Promise.all([
    underRateLimit(ipKey),
    kv().get<unknown>(day ? dailyPhotosKey(day) : seenKey!),
  ]);
  if (!allowed) throw new ApiError("rate-limited", 429);

  let game: StoredGame;
  let seen: string[] = [];
  if (day) {
    const photos = await dailyPhotos(day, firstRead);
    if (photos.length < ROUNDS_PER_GAME) throw new ApiError("no-photos", 503);
    // One shot a day: whatever the first daily start was, later ones only replay it.
    const first = owner ? await kv().set(dailyPlayedKey(day, owner), 1, { nx: true, ex: DAILY_TTL_SECONDS }) : false;
    const unranked: Unranked | undefined = !first ? "replay" : aids.landmarks || aids.labels ? "aids" : undefined;
    game = { photos, createdAt: Date.now(), owner, day, limitMs: DAILY_ROUND_SECONDS * 1000, ranked: !unranked, unranked };
  } else {
    seen = Array.isArray(firstRead) ? firstRead.filter((s): s is string => typeof s === "string") : [];
    const photos = await pickGamePhotos(seen);
    if (photos.length < ROUNDS_PER_GAME) throw new ApiError("no-photos", 503);
    game = { photos, createdAt: Date.now(), owner, ranked: false, unranked: "classic" };
  }

  // Last round trip: store the game and (classic) the player's recent photos side by side.
  const ids = game.photos.map((p) => p.id);
  const seenWrite = seenKey
    ? kv().set(seenKey, [...ids, ...seen.filter((s) => !ids.includes(s))].slice(0, SEEN_MAX), { ex: SEEN_TTL_SECONDS })
    : Promise.resolve(true);
  let id = "";
  for (let attempt = 0; attempt < 3 && !id; attempt++) {
    const candidate = randomBytes(16).toString("base64url");
    if (await kv().set(gameKey(candidate), game, { ex: GAME_TTL_SECONDS, nx: true })) id = candidate;
  }
  await seenWrite;
  if (!id) throw new ApiError("server", 500);
  return {
    id,
    rounds: game.photos.map(toRoundPhoto),
    day: game.day ?? null,
    roundSeconds: game.limitMs ? game.limitMs / 1000 : null,
    ranked: !!game.ranked,
    unranked: game.ranked ? null : (game.unranked ?? "classic"),
  };
}

/** Starts a timed round's clock (once: asking again returns the same clock). */
export async function startRound(id: string, round: number): Promise<RoundClock> {
  const [game, guesses] = await loadGameAndGuesses(id);
  if (!game.limitMs) throw new ApiError("untimed", 400);
  if (!Number.isInteger(round) || round < 0 || round >= game.photos.length) throw new ApiError("bad-round", 400);
  if (round > guesses.length) throw new ApiError("out-of-order", 409, { expected: guesses.length });
  // One round trip, run in order: claim the start time (the first ask wins), keep it a day, read the winner.
  const [, , startedAt] = await Promise.all([
    kv().hsetnx(startsKey(id), String(round), Date.now()),
    kv().expire(startsKey(id), GAME_TTL_SECONDS),
    kv().hget<number>(startsKey(id), String(round)),
  ]);
  return { round, endsAt: Number(startedAt) + game.limitMs, serverNow: Date.now() };
}

export async function gameState(id: string): Promise<GameState> {
  const [game, guesses] = await loadGameAndGuesses(id);
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
export async function submitGuess(id: string, round: number, guess: LngLat | null): Promise<RoundResult> {
  if (!GAME_ID_PATTERN.test(id)) throw new ApiError("not-found", 404);
  if (!Number.isInteger(round) || round < 0) throw new ApiError("bad-round", 400);
  // Round trip 1: the game, its guesses and this round's start time (only timed games use it).
  const [game, guesses, startedAt] = await Promise.all([
    loadGame(id),
    loadGuesses(id),
    kv().hget<number>(startsKey(id), String(round)),
  ]);
  if (round >= game.photos.length) throw new ApiError("bad-round", 400);
  if (round < guesses.length) return resultFor(game, guesses, round);
  if (round > guesses.length) throw new ApiError("out-of-order", 409, { expected: guesses.length });

  // Timed rounds: a pin that lands after the clock (plus a little grace) scores nothing.
  let pin = guess;
  if (game.limitMs) {
    if (startedAt === null || startedAt === undefined) throw new ApiError("not-started", 409);
    if (Date.now() > Number(startedAt) + game.limitMs + GRACE_MS) pin = null;
  } else if (!pin) {
    throw new ApiError("bad-guess", 400);
  }

  const distance = pin ? distanceMeters(pin, game.photos[round]) : null;
  const stored: StoredGuess = {
    lat: pin?.lat ?? null,
    lng: pin?.lng ?? null,
    distance,
    score: distance === null ? 0 : roundScore(distance),
    bullseye: distance !== null && isBullseye(distance),
    at: Date.now(),
  };
  // Round trip 2: store the guess (the first write wins a race) and keep it a day.
  const [first] = await Promise.all([
    kv().hsetnx(guessesKey(id), String(round), stored),
    kv().expire(guessesKey(id), GAME_TTL_SECONDS),
  ]);
  return resultFor(game, first ? [...guesses, stored] : await loadGuesses(id), round);
}

/** Server-side totals of a game, for the leaderboard. */
export async function gameTotals(id: string): Promise<{
  complete: boolean;
  total: number;
  bullseyes: number;
  owner?: string;
  day?: string;
  ranked: boolean;
}> {
  const [game, guesses] = await loadGameAndGuesses(id);
  return {
    complete: guesses.length === game.photos.length,
    total: guesses.reduce((s, g) => s + g.score, 0),
    bullseyes: guesses.filter((g) => g.bullseye).length,
    owner: game.owner,
    day: game.day,
    ranked: !!game.ranked && !!game.day,
  };
}
