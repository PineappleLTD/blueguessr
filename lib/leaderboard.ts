import "server-only";
import { ApiError, GAME_TTL_SECONDS, gameTotals, playerKey, submittedKey } from "./game";
import { kv } from "./kv";
import { claimName, cleanName } from "./names";

// Ranked solo leaderboard: best game per player name, all time and per ISO week (Ann Arbor time).
//
//   lb:all, lb:week:<YYYY-Www>   sorted sets, member "n:<lowercased name>", score = best total
//                               plus a tiny tie-breaker (see encodeScore), raised with ZADD GT
//   <board>:stats               hash member -> { name, games, bullseyes, best }
//
// Members carry an "n:" prefix so a name like "1e3" never comes back from Redis as a number.

export type Period = "all" | "week";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  best: number;
  bullseyes: number;
  games: number;
}

export interface LeaderboardData {
  period: Period;
  /** ISO week of the weekly board, e.g. "2026-W48". */
  week: string;
  entries: LeaderboardEntry[];
  /** Players on this board. */
  players: number;
  /** The asking player's row, when they asked and are on the board. */
  me: LeaderboardEntry | null;
}

export interface SubmitResult {
  name: string;
  /** This game. */
  total: number;
  bullseyes: number;
  /** True when this game beat the player's all-time best. */
  newBest: boolean;
  best: number;
  rank: number;
  players: number;
  weekBest: number;
  weekRank: number;
  weekPlayers: number;
  /** The game had already been posted by this player; nothing changed. */
  already?: boolean;
}

interface Stats {
  name: string;
  games: number;
  bullseyes: number;
  best: number;
}

const ALL_BOARD = "lb:all";
const WEEK_TTL_SECONDS = 60 * 60 * 24 * 7 * 6;
export const LEADERBOARD_SIZE = 50;

const weekBoard = (week: string) => `lb:week:${week}`;
const statsKey = (board: string) => `${board}:stats`;
const memberOf = (name: string) => `n:${name.toLowerCase()}`;

/** ISO 8601 week (Monday start) of a date, in Ann Arbor's time zone: "2026-W48". */
export function isoWeek(date = new Date()): string {
  let y: number, m: number, d: number;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Detroit",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    [y, m, d] = [get("year"), get("month"), get("day")];
  } catch {
    [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  }
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); // Thursday decides the year
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Equal totals rank by who got there first: the fraction shrinks over time and stays below 0.5,
// so Math.floor gives the total back and ZADD GT keeps the earliest of equal scores.
const EPOCH_END = Date.UTC(2100, 0, 1);
const encodeScore = (total: number, at: number) => total + (0.5 * Math.max(0, EPOCH_END - at)) / EPOCH_END;
const decodeScore = (score: number) => Math.floor(score);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Serializes read-modify-write of one player's stats (KV has no MULTI). */
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 30; i++) {
    if (await kv().set(key, { at: Date.now() }, { nx: true, ex: 5 })) {
      try {
        return await fn();
      } finally {
        await kv().del(key);
      }
    }
    await sleep(60 + Math.random() * 60);
  }
  return fn();
}

/** Adds one finished game to both boards. Returns whether it is a new all-time best. */
async function record(name: string, total: number, bullseyes: number): Promise<boolean> {
  const member = memberOf(name);
  const boards = [ALL_BOARD, weekBoard(isoWeek())];
  const score = encodeScore(total, Date.now());
  let newBest = false;
  await withLock(`lb:lock:${member}`, async () => {
    for (const board of boards) {
      const prev = await kv().hget<Stats>(statsKey(board), member);
      if (board === ALL_BOARD) newBest = !prev || total > prev.best;
      const next: Stats = {
        name,
        games: (prev?.games ?? 0) + 1,
        bullseyes: (prev?.bullseyes ?? 0) + bullseyes,
        best: Math.max(prev?.best ?? 0, total),
      };
      await kv().hset(statsKey(board), member, next);
    }
  });
  await Promise.all(boards.map((b) => kv().zadd(b, score, member, { gt: true })));
  const week = boards[1];
  await Promise.all([kv().expire(week, WEEK_TTL_SECONDS), kv().expire(statsKey(week), WEEK_TTL_SECONDS)]);
  return newBest;
}

async function standing(board: string, member: string) {
  const [rank, score, players] = await Promise.all([
    kv().zrevrank(board, member),
    kv().zscore(board, member),
    kv().zcard(board),
  ]);
  return {
    rank: rank === null ? 0 : rank + 1,
    best: score === null ? 0 : decodeScore(Number(score)),
    players,
  };
}

async function result(
  name: string,
  game: { total: number; bullseyes: number },
  extra: { newBest: boolean; already?: boolean },
): Promise<SubmitResult> {
  const member = memberOf(name);
  const [all, week] = await Promise.all([standing(ALL_BOARD, member), standing(weekBoard(isoWeek()), member)]);
  return {
    name,
    total: game.total,
    bullseyes: game.bullseyes,
    best: all.best,
    rank: all.rank,
    players: all.players,
    weekBest: week.best,
    weekRank: week.rank,
    weekPlayers: week.players,
    ...extra,
  };
}

/**
 * Posts a finished solo game. The total is the server's own sum of the stored round scores.
 * Each game posts once (nx lock); the name must be free or already belong to this player.
 */
export async function submitScore(gameId: string, playerId: string, rawName: unknown): Promise<SubmitResult> {
  const game = await gameTotals(gameId);
  if (!game.complete) throw new ApiError("not-finished", 409);
  const me = playerKey(playerId);
  if (game.owner && game.owner !== me) throw new ApiError("not-yours", 403);

  const lock = submittedKey(gameId);
  const posted = async () => {
    const prev = await kv().get<{ by: string; name: string }>(lock);
    if (!prev) return null;
    if (prev.by !== me) throw new ApiError("already-submitted", 409);
    return result(prev.name, game, { newBest: false, already: true });
  };
  const earlier = await posted();
  if (earlier) return earlier;

  const name = cleanName(rawName);
  if (!name) throw new ApiError("bad-name", 400);
  if (!(await claimName(name, playerId))) throw new ApiError("name-taken", 409);

  if (!(await kv().set(lock, { by: me, name }, { nx: true, ex: GAME_TTL_SECONDS }))) {
    const raced = await posted();
    if (raced) return raced;
    throw new ApiError("already-submitted", 409);
  }
  let newBest: boolean;
  try {
    newBest = await record(name, game.total, game.bullseyes);
  } catch (e) {
    await kv().del(lock); // let them try again
    throw e;
  }
  return result(name, game, { newBest });
}

function toEntry(rank: number, member: string, score: number, stats: Stats | null): LeaderboardEntry {
  return {
    rank,
    name: stats?.name ?? member.replace(/^n:/, ""),
    best: decodeScore(score),
    bullseyes: stats?.bullseyes ?? 0,
    games: stats?.games ?? 0,
  };
}

export async function getLeaderboard(period: Period, meName?: string | null): Promise<LeaderboardData> {
  const week = isoWeek();
  const board = period === "week" ? weekBoard(week) : ALL_BOARD;
  const [top, players] = await Promise.all([kv().zrevrange(board, 0, LEADERBOARD_SIZE - 1), kv().zcard(board)]);
  const stats = await Promise.all(top.map((t) => kv().hget<Stats>(statsKey(board), t.member)));
  const entries = top.map((t, i) => toEntry(i + 1, t.member, t.score, stats[i]));

  let me: LeaderboardEntry | null = null;
  const name = meName ? cleanName(meName) : null;
  if (name) {
    const member = memberOf(name);
    const i = top.findIndex((t) => t.member === member);
    if (i >= 0) me = entries[i];
    else {
      const [rank, score, s] = await Promise.all([
        kv().zrevrank(board, member),
        kv().zscore(board, member),
        kv().hget<Stats>(statsKey(board), member),
      ]);
      if (rank !== null && score !== null) me = toEntry(rank + 1, member, Number(score), s);
    }
  }
  return { period, week, entries, players, me };
}
