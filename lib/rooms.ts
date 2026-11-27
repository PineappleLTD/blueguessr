import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  isRoomCode,
  PLAYER_HEADER,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type MeView,
  type OutReason,
  type PlayerView,
  type ResultView,
  type RevealView,
  type RoomError,
  type RoomPhase,
  type RoomResponse,
  type RoomView,
  type Standing,
  type WatcherView,
} from "@/components/versus/types";
import { distanceMeters } from "./geo";
import { kv } from "./kv";
import { cleanName } from "./names";
import { allPhotos, toReveal, toRoundPhoto } from "./photos";
import {
  damageMultiplier,
  isBullseye,
  roundDamage,
  roundScore,
  VERSUS_MAX_PLAYERS,
  VERSUS_ROUND_SECONDS,
  VERSUS_RUSH_SECONDS,
  VERSUS_START_HP,
} from "./scoring";
import type { Photo, RoundPhoto, RoundReveal } from "./types";

/*
 * VERSUS ROOMS: a server-authoritative state machine that advances lazily.
 *
 * There is no game loop. Every request (polls included) loads the room and calls advance(), which
 * performs whatever transition is due: a round whose time is up or that everyone has guessed is
 * scored, a reveal that has run its course starts the next round. Phases:
 *
 *   lobby --start--> round 1 --resolve--> reveal 1 --advance--> round 2 ... reveal N (final)
 *     --advance--> finished --rematch--> round 1 of the next game
 *
 * KEYS (the store has atomic single commands only, no MULTI):
 *   room:{code}              RoomState JSON. Written ONLY by create, start, the round resolver, the
 *                            reveal advancer and rematch, each holding the transition lock below.
 *   room:{id}:members        hash sha256(secret) -> Member. A player only ever writes their own field
 *                            (hsetnx to join, hdel to leave), so joins never touch the room JSON.
 *   room:{id}:names          hash lowercased name -> owner. hsetnx claims a name, so names stay unique
 *                            in the room even when two "Alex"es join at the same moment ("Alex 2").
 *   room:{id}:seq            counter. incr hands out join order: public id "p{seq}" and pin color.
 *   room:{id}:seen           hash pid -> last poll time. Presence: host hand-off, who a round waits for.
 *   room:{id}:g:{game}:{n}   hash pid -> guess for one round. hsetnx: one guess per player, first wins,
 *                            and no guess can overwrite another's.
 *   room:{id}:lock:{v}       set nx, ex 30 s. The one request that sets it performs the single
 *                            transition out of room version v; every other request just reads.
 *   ({id} is random per room, so a code reused after expiry never inherits stale keys.)
 *
 * TRANSITIONS are exactly-once per version: lock -> re-read room -> abort unless still at version v
 * (so a request holding a stale read can never roll the room back) -> build next state -> write
 * v + 1. Builders re-read the hashes they depend on after taking the lock. If a builder decides
 * nothing is due it drops the lock so a later request can retry; if it crashes, the lock expires
 * after 30 s and the room carries on.
 *
 * TIMING: the rush ("someone guessed, 15 s left") is never written down. Everyone derives it as
 * min(deadline, first guess time + RUSH) from the guesses hash, so a guess is a single hsetnx and
 * never needs to write the room. Guesses are accepted up to GUESS_GRACE_MS past the deadline to
 * absorb network latency; the resolver waits a little longer than that before scoring by time.
 *
 * IDENTITY: the browser sends its secret player id in the x-player-id header. It is hashed before
 * it is stored and is never sent back; clients only ever see public pids. The host is not stored:
 * it is the earliest joined member who is online, so it hands over by itself if the host leaves.
 *
 * Every key expires ROOM_TTL_S after the last join or phase change.
 */

const ROOM_TTL_S = 6 * 60 * 60;
const LOCK_TTL_S = 30;
/** "Round N / x1.5" intro before guessing opens. */
const INTRO_MS = 3_000;
const REVEAL_MS = 8_000;
const FINAL_REVEAL_MS = 9_000;
/** The host can skip a reveal once it has been up this long (no accidental double-tap skips). */
const MIN_REVEAL_MS = 1_500;
const GUESS_GRACE_MS = 1_000;
const RESOLVE_SLACK_MS = 250;
/** Polled within this window = online. */
const ONLINE_MS = 20_000;
/** Members seen within this window are lined up when a game starts (phones nap while sharing links). */
const LINEUP_MS = 120_000;
/** Presence is written at most this often per player. */
const SEEN_WRITE_MS = 4_000;
const MAX_MEMBERS = 24;
/** Rounds in a row without a single guess before the game is called (abandoned rooms stop). */
const STALEMATE_ROUNDS = 3;
/** Photos remembered per room so rematches keep showing new places. */
const USED_PHOTOS_KEPT = 400;

// ---------------------------------------------------------------- state

interface Member {
  pid: string;
  seq: number;
  name: string;
  joinedAt: number;
}

interface NameClaim {
  k: string;
}

interface GuessRec {
  lat: number;
  lng: number;
  at: number;
}

interface Fighter {
  pid: string;
  name: string;
  color: number;
  hp: number;
  out: OutReason | null;
  outRound: number | null;
}

interface RoundResult {
  round: number;
  multiplier: number;
  photoId: string;
  photo: RoundPhoto;
  answer: RoundReveal;
  guesses: Record<string, GuessRec>;
  distance: Record<string, number>;
  scores: Record<string, number>;
  damage: Record<string, number>;
  hpBefore: Record<string, number>;
  hpAfter: Record<string, number>;
  ko: string[];
  left: string[];
  /** When it was scored. */
  at: number;
}

interface RoomState {
  v: number;
  /** Random per room: namespaces every companion key. */
  id: string;
  code: string;
  createdAt: number;
  updatedAt: number;
  phase: RoomPhase;
  game: number;
  round: number;
  fighters: Fighter[];
  /** Current round's photo, answer included. Server-only: never sent as is. */
  photo: Photo | null;
  startsAt: number;
  deadline: number;
  revealEndsAt: number;
  final: boolean;
  winner: string | null;
  draw: boolean;
  results: RoundResult[];
  usedPhotoIds: string[];
  /** Seconds per round, picked by the host when starting (kept for rematches). */
  roundSeconds?: number;
}

interface Ctx {
  room: RoomState;
  /** By hashed secret. */
  members: Record<string, Member>;
  /** By pid. */
  seen: Record<string, number>;
  /** Current round's guesses by pid (empty outside rounds). */
  guesses: Record<string, GuessRec>;
}

export interface RoomResult {
  status: number;
  body: RoomResponse;
}

const K = {
  room: (code: string) => `room:${code}`,
  members: (id: string) => `room:${id}:members`,
  names: (id: string) => `room:${id}:names`,
  seq: (id: string) => `room:${id}:seq`,
  seen: (id: string) => `room:${id}:seen`,
  guesses: (id: string, game: number, round: number) => `room:${id}:g:${game}:${round}`,
  lock: (id: string, v: number) => `room:${id}:lock:${v}`,
};

const ERROR_STATUS: Record<RoomError, number> = {
  bad_request: 400,
  bad_name: 400,
  bad_code: 400,
  no_player: 401,
  not_found: 404,
  not_member: 403,
  room_full: 403,
  not_host: 403,
  need_players: 409,
  no_photos: 503,
  wrong_phase: 409,
  not_fighting: 403,
  too_early: 409,
  too_late: 409,
  already_guessed: 409,
  busy: 503,
};

// ---------------------------------------------------------------- request helpers

const SECRET_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/** The caller's secret player id, or null. */
export function playerSecret(request: Request): string | null {
  const s = request.headers.get(PLAYER_HEADER);
  return s && SECRET_PATTERN.test(s) ? s : null;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}

export function roomResponse(r: RoomResult): Response {
  return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}

const fail = (error: RoomError, view?: RoomView): RoomResult => ({ status: ERROR_STATUS[error], body: { error, view } });

function memberKey(secret: string): string {
  return createHash("sha256").update(`blueguessr:versus:${secret}`).digest("base64url").slice(0, 24);
}

function randomCode(): string {
  let s = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return s;
}

// ---------------------------------------------------------------- loading

async function loadCtx(code: string): Promise<Ctx | null> {
  const room = await kv().get<RoomState>(K.room(code));
  return room ? loadAround(room) : null;
}

/** Everything around a room JSON we already have. */
async function loadAround(room: RoomState): Promise<Ctx> {
  const db = kv();
  const [members, seen, guesses] = await Promise.all([
    db.hgetall<Member>(K.members(room.id)),
    db.hgetall<number>(K.seen(room.id)),
    room.phase === "round" ? db.hgetall<GuessRec>(K.guesses(room.id, room.game, room.round)) : Promise.resolve({}),
  ]);
  return { room, members, seen, guesses };
}

async function touch(room: RoomState): Promise<void> {
  const db = kv();
  await Promise.all([
    db.expire(K.room(room.code), ROOM_TTL_S),
    db.expire(K.members(room.id), ROOM_TTL_S),
    db.expire(K.names(room.id), ROOM_TTL_S),
    db.expire(K.seq(room.id), ROOM_TTL_S),
    db.expire(K.seen(room.id), ROOM_TTL_S),
  ]);
}

// ---------------------------------------------------------------- derived facts

const sortedMembers = (ctx: Ctx) => Object.values(ctx.members).sort((a, b) => a.seq - b.seq);
const isOnline = (ctx: Ctx, pid: string, now: number) => now - (ctx.seen[pid] ?? 0) <= ONLINE_MS;

/** Earliest joined member who is online (or, failing that, the earliest member). */
function hostOf(ctx: Ctx, now: number): Member | null {
  const list = sortedMembers(ctx);
  return list.find((m) => isOnline(ctx, m.pid, now)) ?? list[0] ?? null;
}

/** Who plays if a game starts now: recently seen members in join order, up to the room size. */
function lineup(ctx: Ctx, now: number): Member[] {
  return sortedMembers(ctx)
    .filter((m) => now - (ctx.seen[m.pid] ?? m.joinedAt) <= LINEUP_MS)
    .slice(0, VERSUS_MAX_PLAYERS);
}

/** When the current round closes: the deadline, pulled in to first guess + RUSH once someone guesses. */
function closesAt(room: RoomState, guesses: Record<string, GuessRec>): number {
  let first = Infinity;
  for (const g of Object.values(guesses)) if (g.at < first) first = g.at;
  return Math.min(room.deadline, first + VERSUS_RUSH_SECONDS * 1000);
}

type Due = "resolve" | "advance" | null;

function dueTransition(ctx: Ctx, now: number): Due {
  const { room } = ctx;
  if (room.phase === "round") {
    if (now >= closesAt(room, ctx.guesses) + GUESS_GRACE_MS + RESOLVE_SLACK_MS) return "resolve";
    if (now < room.startsAt) return null;
    const present = new Set(Object.values(ctx.members).map((m) => m.pid));
    const standing = room.fighters.filter((f) => !f.out && present.has(f.pid));
    // Everyone else walked out: nobody left to fight.
    if (standing.length <= 1) return "resolve";
    // Everyone still here has guessed. Offline players aren't waited for (they can still guess
    // until the clock runs out if they come back first).
    const waitingOn = standing.filter((f) => isOnline(ctx, f.pid, now));
    if (standing.some((f) => ctx.guesses[f.pid]) && waitingOn.every((f) => ctx.guesses[f.pid])) return "resolve";
    return null;
  }
  if (room.phase === "reveal" && now >= room.revealEndsAt) return "advance";
  return null;
}

// ---------------------------------------------------------------- photos

/** Neighbourhood for variety: the photo's campus area, or a ~800 m grid cell when it has none. */
function areaOf(p: Photo): string {
  if (p.area && p.area !== "other") return p.area;
  return `cell:${Math.round(p.lat / 0.0072)}:${Math.round(p.lng / 0.0097)}`;
}

/**
 * Picks the next round's photo for a good mix: never near the last few rounds, and weighted by
 * area (square root of each area's size, halved for the area we were just in) so North Campus,
 * the medical campus and the athletic campus come up often without the order being predictable.
 */
export function choosePhoto(pool: Photo[], recent: Photo[], rand: () => number = Math.random): Photo | null {
  if (!pool.length) return null;
  const last = recent.at(-1);
  for (const spacing of [600, 350, 150, 0]) {
    const far = pool.filter((p) => recent.every((q) => distanceMeters(p, q) >= spacing));
    if (!far.length) continue;
    const groups = new Map<string, Photo[]>();
    for (const p of far) {
      const a = areaOf(p);
      const g = groups.get(a);
      if (g) g.push(p);
      else groups.set(a, [p]);
    }
    const weighted = [...groups.entries()].map(([area, photos]) => ({
      photos,
      w: Math.sqrt(photos.length) * (last && areaOf(last) === area ? 0.4 : 1),
    }));
    let r = rand() * weighted.reduce((s, e) => s + e.w, 0);
    const hit = weighted.find((e) => (r -= e.w) <= 0) ?? weighted[weighted.length - 1];
    return hit.photos[Math.floor(rand() * hit.photos.length)] ?? hit.photos[0];
  }
  return pool[Math.floor(rand() * pool.length)];
}

async function pickRoundPhoto(room: RoomState, gamePhotoIds: string[]): Promise<Photo | null> {
  const all = await allPhotos();
  if (!all.length) return null;
  const byId = new Map(all.map((p) => [p.id, p]));
  const used = new Set(room.usedPhotoIds);
  let pool = all.filter((p) => !used.has(p.id));
  if (!pool.length) {
    // The room has seen every photo: start over, minus this game's.
    const inGame = new Set(gamePhotoIds);
    pool = all.filter((p) => !inGame.has(p.id));
    if (!pool.length) pool = all;
  }
  const recent = gamePhotoIds
    .slice(-3)
    .map((id) => byId.get(id))
    .filter((p): p is Photo => !!p);
  return choosePhoto(pool, recent);
}

function remember(used: string[], id: string): string[] {
  return [...used.filter((x) => x !== id), id].slice(-USED_PHOTOS_KEPT);
}

function roundStart(round: number, photo: Photo, now: number, seconds: number) {
  const startsAt = now + INTRO_MS;
  return {
    phase: "round" as const,
    round,
    photo,
    startsAt,
    deadline: startsAt + seconds * 1000,
    revealEndsAt: 0,
    final: false,
  };
}

// ---------------------------------------------------------------- transitions

type Build = (fresh: RoomState) => Promise<RoomState | RoomError | null>;

interface Transitioned {
  room: RoomState;
  changed: boolean;
  error?: RoomError;
}

/** Performs the single transition out of `from.v`, if this request wins the lock (see top). */
async function transition(from: RoomState, build: Build): Promise<Transitioned> {
  const db = kv();
  const lock = K.lock(from.id, from.v);
  if (!(await db.set(lock, Date.now(), { nx: true, ex: LOCK_TTL_S }))) {
    // Someone else is on it. Give them a moment so this response can already show the result.
    await new Promise((r) => setTimeout(r, 120));
    const now = await db.get<RoomState>(K.room(from.code));
    return now && now.id === from.id ? { room: now, changed: now.v !== from.v, error: "busy" } : { room: from, changed: false, error: "busy" };
  }
  const fresh = await db.get<RoomState>(K.room(from.code));
  if (!fresh || fresh.id !== from.id) return { room: from, changed: false, error: "not_found" };
  if (fresh.v !== from.v) return { room: fresh, changed: true };

  let next: RoomState | RoomError | null;
  try {
    next = await build(fresh);
  } catch (e) {
    await db.del(lock);
    throw e;
  }
  if (next === null || typeof next === "string") {
    await db.del(lock);
    return { room: fresh, changed: false, error: next ?? undefined };
  }
  const saved: RoomState = { ...next, v: fresh.v + 1, updatedAt: Date.now() };
  await db.set(K.room(saved.code), saved, { ex: ROOM_TTL_S });
  await touch(saved);
  return { room: saved, changed: true };
}

/** Scores the current round: round -> reveal. */
async function resolveRound(fresh: RoomState): Promise<RoomState | null> {
  if (fresh.phase !== "round" || !fresh.photo) return null;
  const ctx = await loadAround(fresh);
  const now = Date.now();
  if (dueTransition(ctx, now) !== "resolve") return null;

  const photo = fresh.photo;
  const round = fresh.round;
  const present = new Set(Object.values(ctx.members).map((m) => m.pid));
  const close = closesAt(fresh, ctx.guesses);
  const fighters = fresh.fighters.map((f) => ({ ...f }));
  const inRound = fighters.filter((f) => !f.out);

  const left: string[] = [];
  for (const f of inRound) {
    if (!present.has(f.pid)) {
      f.out = "left";
      f.outRound = round;
      left.push(f.pid);
    }
  }
  const contenders = inRound.filter((f) => !f.out);

  const scores: Record<string, number> = {};
  const distance: Record<string, number> = {};
  const kept: Record<string, GuessRec> = {};
  for (const f of contenders) {
    const g = ctx.guesses[f.pid];
    if (g && g.at <= close + GUESS_GRACE_MS) {
      const d = distanceMeters(g, photo);
      kept[f.pid] = g;
      distance[f.pid] = d;
      scores[f.pid] = roundScore(d);
    } else {
      scores[f.pid] = 0; // no guess, no points
    }
  }

  const damage = roundDamage(scores, round);
  const hpBefore: Record<string, number> = {};
  const hpAfter: Record<string, number> = {};
  const ko: string[] = [];
  for (const f of contenders) {
    hpBefore[f.pid] = f.hp;
    f.hp = Math.max(0, f.hp - (damage[f.pid] ?? 0));
    hpAfter[f.pid] = f.hp;
    if (f.hp === 0) {
      f.out = "ko";
      f.outRound = round;
      ko.push(f.pid);
    }
  }

  const results: RoundResult[] = [
    ...fresh.results,
    {
      round,
      multiplier: damageMultiplier(round),
      photoId: photo.id,
      photo: toRoundPhoto(photo),
      answer: toReveal(photo),
      guesses: kept,
      distance,
      scores,
      damage,
      hpBefore,
      hpAfter,
      ko,
      left,
      at: now,
    },
  ];

  let final = false;
  let winner: string | null = null;
  let draw = false;
  const standing = fighters.filter((f) => !f.out);
  if (standing.length === 1) {
    final = true;
    winner = standing[0].pid;
  } else if (standing.length === 0) {
    // Everyone left standing went down in the same round: best score this round wins, ties draw.
    final = true;
    const best = Math.max(-1, ...contenders.map((f) => scores[f.pid]));
    const top = contenders.filter((f) => scores[f.pid] === best);
    if (top.length === 1) winner = top[0].pid;
    else draw = true;
  } else if (
    results.length >= STALEMATE_ROUNDS &&
    results.slice(-STALEMATE_ROUNDS).every((r) => Object.keys(r.guesses).length === 0)
  ) {
    // Nobody has guessed for a while: call it on health.
    final = true;
    const top = Math.max(...standing.map((f) => f.hp));
    const leaders = standing.filter((f) => f.hp === top);
    if (leaders.length === 1) winner = leaders[0].pid;
    else draw = true;
  }

  return {
    ...fresh,
    phase: "reveal",
    fighters,
    results,
    revealEndsAt: now + (final ? FINAL_REVEAL_MS : REVEAL_MS),
    final,
    winner,
    draw,
  };
}

/** Ends the reveal: next round, or the results after the final round. */
async function advanceReveal(fresh: RoomState, skip: boolean): Promise<RoomState | RoomError | null> {
  if (fresh.phase !== "reveal") return null;
  const now = Date.now();
  if (!skip && now < fresh.revealEndsAt) return null;
  if (fresh.final) return { ...fresh, phase: "finished", photo: null };
  const photo = await pickRoundPhoto(
    fresh,
    fresh.results.map((r) => r.photoId),
  );
  if (!photo) return { ...fresh, phase: "finished", photo: null, final: true, draw: !fresh.winner };
  return {
    ...fresh,
    ...roundStart(fresh.round + 1, photo, now, fresh.roundSeconds ?? VERSUS_ROUND_SECONDS),
    usedPhotoIds: remember(fresh.usedPhotoIds, photo.id),
  };
}

/** A fresh game from the current members: lobby -> round 1 (start), finished -> round 1 (rematch). */
async function newGame(
  fresh: RoomState,
  from: RoomPhase,
  byKey: string,
  seconds: number | null,
): Promise<RoomState | RoomError> {
  if (fresh.phase !== from) return "wrong_phase";
  const ctx = await loadAround(fresh);
  const now = Date.now();
  const me = ctx.members[byKey];
  if (!me) return "not_member";
  if (hostOf(ctx, now)?.pid !== me.pid) return "not_host";
  const line = lineup(ctx, now);
  if (line.length < 2) return "need_players";
  // On a rematch, steer clear of where the last game ended too.
  const photo = await pickRoundPhoto(fresh, fresh.results.slice(-2).map((r) => r.photoId));
  if (!photo) return "no_photos";
  return {
    ...fresh,
    game: fresh.game + 1,
    fighters: line.map((m, i) => ({
      pid: m.pid,
      name: m.name,
      color: i,
      hp: VERSUS_START_HP,
      out: null,
      outRound: null,
    })),
    results: [],
    winner: null,
    draw: false,
    usedPhotoIds: remember(fresh.usedPhotoIds, photo.id),
    roundSeconds: seconds ?? fresh.roundSeconds ?? VERSUS_ROUND_SECONDS,
    ...roundStart(1, photo, now, seconds ?? fresh.roundSeconds ?? VERSUS_ROUND_SECONDS),
  };
}

/** Runs every transition that is due (usually none, sometimes one, at most a couple). */
async function advance(ctx: Ctx): Promise<Ctx> {
  for (let i = 0; i < 3; i++) {
    const due = dueTransition(ctx, Date.now());
    if (!due) break;
    const t = await transition(ctx.room, (fresh) => (due === "resolve" ? resolveRound(fresh) : advanceReveal(fresh, false)));
    if (!t.changed) break;
    ctx = await loadAround(t.room);
  }
  return ctx;
}

// ---------------------------------------------------------------- names

async function claimRoomName(id: string, name: string, key: string): Promise<string> {
  const db = kv();
  for (let n = 1; n <= 30; n++) {
    const suffix = n === 1 ? "" : ` ${n}`;
    const candidate = n === 1 ? name : `${name.slice(0, 20 - suffix.length).trim()}${suffix}`;
    const field = candidate.toLowerCase();
    if (await db.hsetnx(K.names(id), field, { k: key } satisfies NameClaim)) return candidate;
    if ((await db.hget<NameClaim>(K.names(id), field))?.k === key) return candidate;
  }
  return `${name.slice(0, 15).trim()} ${randomInt(1000, 10000)}`;
}

async function releaseName(id: string, name: string, key: string): Promise<void> {
  const db = kv();
  const field = name.toLowerCase();
  if ((await db.hget<NameClaim>(K.names(id), field))?.k === key) await db.hdel(K.names(id), field);
}

// ---------------------------------------------------------------- views

function buildView(ctx: Ctx, viewerKey: string | null, now: number): RoomView {
  const { room } = ctx;
  const meMember = viewerKey ? (ctx.members[viewerKey] ?? null) : null;
  const myPid = meMember?.pid ?? null;
  const hostPid = hostOf(ctx, now)?.pid ?? null;
  const present = new Set(Object.values(ctx.members).map((m) => m.pid));

  let players: PlayerView[];
  let watchers: WatcherView[];
  if (room.phase === "lobby") {
    const line = lineup(ctx, now);
    const inLine = new Set(line.map((m) => m.pid));
    players = line.map((m, i) => ({
      pid: m.pid,
      name: m.name,
      color: i,
      hp: VERSUS_START_HP,
      out: null,
      outRound: null,
      online: isOnline(ctx, m.pid, now),
      host: m.pid === hostPid,
      me: m.pid === myPid,
    }));
    watchers = sortedMembers(ctx)
      .filter((m) => !inLine.has(m.pid))
      .map((m) => ({ pid: m.pid, name: m.name, me: m.pid === myPid }));
  } else {
    const fighting = new Set(room.fighters.map((f) => f.pid));
    players = room.fighters.map((f) => ({
      pid: f.pid,
      name: f.name,
      color: f.color,
      hp: f.hp,
      // Walked out but not scored yet: show it right away.
      out: f.out ?? (present.has(f.pid) ? null : "left"),
      outRound: f.outRound ?? (present.has(f.pid) ? null : room.round),
      online: isOnline(ctx, f.pid, now),
      host: f.pid === hostPid,
      me: f.pid === myPid,
    }));
    watchers = sortedMembers(ctx)
      .filter((m) => !fighting.has(m.pid))
      .map((m) => ({ pid: m.pid, name: m.name, me: m.pid === myPid }));
  }

  const mine = players.find((p) => p.me);
  const me: MeView | null = meMember
    ? { pid: meMember.pid, name: meMember.name, fighter: !!mine, out: mine?.out ?? null, host: meMember.pid === hostPid }
    : null;

  const view: RoomView = {
    code: room.code,
    v: room.v,
    serverNow: now,
    phase: room.phase,
    game: room.game,
    round: room.round,
    multiplier: room.round ? damageMultiplier(room.round) : 1,
    maxHp: VERSUS_START_HP,
    maxPlayers: VERSUS_MAX_PLAYERS,
    roundSeconds: room.roundSeconds ?? VERSUS_ROUND_SECONDS,
    me,
    players,
    watchers,
    canStart: room.phase === "lobby" && !!me?.host && players.length >= 2,
    canRematch: room.phase === "finished" && !!me?.host && lineup(ctx, now).length >= 2,
    photo: null,
    startsAt: null,
    deadline: null,
    rushed: false,
    guessed: {},
    myGuess: null,
    reveal: null,
    result: null,
  };

  if (room.phase === "round" && room.photo) {
    const close = closesAt(room, ctx.guesses);
    view.photo = toRoundPhoto(room.photo);
    view.startsAt = room.startsAt;
    view.deadline = close;
    view.rushed = close < room.deadline;
    view.guessed = Object.fromEntries(room.fighters.filter((f) => !f.out).map((f) => [f.pid, !!ctx.guesses[f.pid]]));
    const g = myPid ? ctx.guesses[myPid] : undefined;
    view.myGuess = g ? { lat: g.lat, lng: g.lng } : null;
  }

  const last = room.results.at(-1);
  if (room.phase === "reveal" && last) view.reveal = revealView(room, last);
  if (room.phase === "finished") view.result = resultView(room);
  return view;
}

function revealView(room: RoomState, r: RoundResult): RevealView {
  return {
    round: r.round,
    multiplier: r.multiplier,
    photo: r.photo,
    answer: r.answer,
    guesses: Object.entries(r.guesses).map(([pid, g]) => ({
      pid,
      lat: g.lat,
      lng: g.lng,
      distance: r.distance[pid],
      score: r.scores[pid] ?? 0,
      bullseye: isBullseye(r.distance[pid]),
    })),
    scores: r.scores,
    damage: r.damage,
    hpBefore: r.hpBefore,
    hpAfter: r.hpAfter,
    ko: r.ko,
    left: r.left,
    startedAt: r.at,
    endsAt: room.revealEndsAt,
    final: room.final,
  };
}

function resultView(room: RoomState): ResultView {
  const total = (pid: string) => room.results.reduce((s, r) => s + (r.scores[pid] ?? 0), 0);
  const bulls = (pid: string) => room.results.filter((r) => pid in r.distance && isBullseye(r.distance[pid])).length;
  const rows = room.fighters.map((f) => ({ f, total: total(f.pid), bulls: bulls(f.pid) }));
  // Winner, then whoever is still standing (by HP), then whoever lasted longest.
  const tier = (f: Fighter) => (f.pid === room.winner ? 0 : f.out === null ? 1 : 2);
  rows.sort(
    (a, b) =>
      tier(a.f) - tier(b.f) ||
      b.f.hp - a.f.hp ||
      (b.f.outRound ?? 0) - (a.f.outRound ?? 0) ||
      (a.f.out === "left" ? 1 : 0) - (b.f.out === "left" ? 1 : 0) ||
      b.total - a.total,
  );
  const standings: Standing[] = rows.map(({ f, total, bulls }, i) => ({
    pid: f.pid,
    name: f.name,
    color: f.color,
    rank: i + 1,
    hp: f.hp,
    totalScore: total,
    bullseyes: bulls,
    out: f.out,
    outRound: f.outRound,
    winner: f.pid === room.winner,
  }));
  return { winner: room.winner, draw: room.draw, rounds: room.results.length, standings };
}

// ---------------------------------------------------------------- API

const ok = (ctx: Ctx, key: string | null, extra?: Partial<RoomResponse>): RoomResult => ({
  status: 200,
  body: { ...extra, view: buildView(ctx, key, Date.now()) },
});

/** Loads the room, records the viewer's presence and runs anything that is due. */
async function open(code: string, secret: string | null): Promise<{ ctx: Ctx; key: string | null; me: Member | null } | RoomResult> {
  if (!isRoomCode(code)) return fail("bad_code");
  const loaded = await loadCtx(code);
  if (!loaded) return fail("not_found");
  let ctx = loaded;
  const key = secret ? memberKey(secret) : null;
  const me = key ? (ctx.members[key] ?? null) : null;
  const now = Date.now();
  if (me && now - (ctx.seen[me.pid] ?? 0) > SEEN_WRITE_MS) {
    await kv().hset(K.seen(ctx.room.id), me.pid, now);
    ctx = { ...ctx, seen: { ...ctx.seen, [me.pid]: now } };
  }
  ctx = await advance(ctx);
  return { ctx, key, me };
}

export async function createRoom(secret: string | null, rawName: unknown): Promise<RoomResult> {
  if (!secret) return fail("no_player");
  const name = cleanName(rawName);
  if (!name) return fail("bad_name");
  const now = Date.now();
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    const room: RoomState = {
      v: 1,
      id: randomBytes(9).toString("base64url"),
      code,
      createdAt: now,
      updatedAt: now,
      phase: "lobby",
      game: 0,
      round: 0,
      fighters: [],
      photo: null,
      startsAt: 0,
      deadline: 0,
      revealEndsAt: 0,
      final: false,
      winner: null,
      draw: false,
      results: [],
      usedPhotoIds: [],
    };
    if (await kv().set(K.room(code), room, { nx: true, ex: ROOM_TTL_S })) {
      const joined = await joinRoom(code, secret, name);
      return { ...joined, body: { ...joined.body, code } };
    }
  }
  return fail("busy");
}

export async function getRoom(code: string, secret: string | null): Promise<RoomResult> {
  const o = await open(code, secret);
  if ("status" in o) return o;
  return ok(o.ctx, o.key);
}

export async function joinRoom(code: string, secret: string | null, rawName: unknown): Promise<RoomResult> {
  if (!secret) return fail("no_player");
  const name = cleanName(rawName);
  if (!name) return fail("bad_name");
  const o = await open(code, secret);
  if ("status" in o) return o;
  let { ctx } = o;
  const { key } = o;
  const k = key!;
  const db = kv();
  const id = ctx.room.id;
  let me = o.me;
  if (!me) {
    if (Object.keys(ctx.members).length >= MAX_MEMBERS) return fail("room_full", buildView(ctx, k, Date.now()));
    const seq = await db.incr(K.seq(id));
    const unique = await claimRoomName(id, name, k);
    const candidate: Member = { pid: `p${seq}`, seq, name: unique, joinedAt: Date.now() };
    if (await db.hsetnx(K.members(id), k, candidate)) {
      me = candidate;
    } else {
      // Double submit: the other request joined us first. Keep its record, return our name claim.
      me = await db.hget<Member>(K.members(id), k);
      if (!me) return fail("busy");
      if (me.name.toLowerCase() !== unique.toLowerCase()) await releaseName(id, unique, k);
    }
    const now = Date.now();
    await db.hset(K.seen(id), me.pid, now);
    await touch(ctx.room);
    ctx = { ...ctx, members: { ...ctx.members, [k]: me }, seen: { ...ctx.seen, [me.pid]: now } };
  }
  return ok(ctx, k);
}

export async function leaveRoom(code: string, secret: string | null): Promise<RoomResult> {
  if (!secret) return fail("no_player");
  if (!isRoomCode(code)) return fail("bad_code");
  const room = await kv().get<RoomState>(K.room(code));
  if (!room) return { status: 200, body: {} };
  const k = memberKey(secret);
  const db = kv();
  const me = await db.hget<Member>(K.members(room.id), k);
  if (me) {
    await db.hdel(K.members(room.id), k);
    await releaseName(room.id, me.name, k);
    await db.hdel(K.seen(room.id), me.pid);
    // A fighter who walks out forfeits; the fight may be over now.
    await advance(await loadAround(room));
  }
  return { status: 200, body: {} };
}

export async function startGame(
  code: string,
  secret: string | null,
  kind: "start" | "rematch",
  seconds: number | null = null,
): Promise<RoomResult> {
  if (!secret) return fail("no_player");
  const o = await open(code, secret);
  if ("status" in o) return o;
  const { key } = o;
  let { ctx } = o;
  if (!o.me) return fail("not_member", buildView(ctx, key, Date.now()));
  const from: RoomPhase = kind === "start" ? "lobby" : "finished";
  if (ctx.room.phase !== from) {
    // Already started (double click, or someone else's click won): just show where things are.
    return ctx.room.phase === "lobby" || ctx.room.phase === "finished" ? fail("wrong_phase", buildView(ctx, key, Date.now())) : ok(ctx, key);
  }
  const t = await transition(ctx.room, (fresh) => newGame(fresh, from, key!, seconds));
  if (t.changed) ctx = await loadAround(t.room);
  if (t.error && t.error !== "busy") return fail(t.error, buildView(ctx, key, Date.now()));
  return ok(ctx, key);
}

export async function skipReveal(code: string, secret: string | null): Promise<RoomResult> {
  if (!secret) return fail("no_player");
  const o = await open(code, secret);
  if ("status" in o) return o;
  const { key } = o;
  let { ctx } = o;
  if (!o.me) return fail("not_member", buildView(ctx, key, Date.now()));
  if (ctx.room.phase !== "reveal") return ok(ctx, key);
  const now = Date.now();
  if (hostOf(ctx, now)?.pid !== o.me.pid) return fail("not_host", buildView(ctx, key, now));
  const last = ctx.room.results.at(-1);
  if (last && now - last.at < MIN_REVEAL_MS) return fail("too_early", buildView(ctx, key, now));
  const t = await transition(ctx.room, (fresh) => advanceReveal(fresh, true));
  if (t.changed) ctx = await loadAround(t.room);
  return ok(ctx, key);
}

/** Rough box around Ann Arbor: anything outside it can't be a real pin on the campus map. */
const inAnnArbor = (lat: number, lng: number) => lat > 42.15 && lat < 42.4 && lng > -83.9 && lng < -83.55;

export async function submitGuess(code: string, secret: string | null, body: Record<string, unknown>): Promise<RoomResult> {
  if (!secret) return fail("no_player");
  const { round, lat, lng, game } = body;
  if (
    typeof round !== "number" ||
    !Number.isInteger(round) ||
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !inAnnArbor(lat, lng) ||
    (game !== undefined && typeof game !== "number")
  ) {
    return fail("bad_request");
  }
  const o = await open(code, secret); // closes the round first if its time is up
  if ("status" in o) return o;
  const { key } = o;
  let { ctx } = o;
  const me = o.me;
  const view = () => buildView(ctx, key, Date.now());
  if (!me) return fail("not_member", view());
  const { room } = ctx;
  if (room.phase !== "round" || room.round !== round || (game !== undefined && room.game !== game)) {
    return fail(room.phase === "lobby" ? "wrong_phase" : "too_late", view());
  }
  const fighter = room.fighters.find((f) => f.pid === me.pid);
  if (!fighter || fighter.out) return fail("not_fighting", view());
  const now = Date.now();
  if (now < room.startsAt - 250) return fail("too_early", view());
  if (now > closesAt(room, ctx.guesses) + GUESS_GRACE_MS) return fail("too_late", view());

  const db = kv();
  const gk = K.guesses(room.id, room.game, room.round);
  const written = await db.hsetnx(gk, me.pid, { lat, lng, at: now } satisfies GuessRec);
  if (written) await db.expire(gk, ROOM_TTL_S);
  // Re-read so that of two players guessing at once, at least one sees both guesses and ends the round.
  ctx = { ...ctx, guesses: await db.hgetall<GuessRec>(gk) };
  ctx = await advance(ctx);
  return written ? ok(ctx, key) : fail("already_guessed", view());
}
