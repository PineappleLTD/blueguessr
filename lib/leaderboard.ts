import "server-only";
import { ApiError, GAME_TTL_SECONDS, gameTotals, playerKey, submittedKey } from "./game";
import { dailyDate } from "./daily";
import { kv } from "./kv";
import { claimName, cleanName } from "./names";

// The leaderboard is the Daily BlueGuessr's: each player's first daily of the day, played without
// landmarks or map labels (lib/game.ts decides). One board per day, and the best daily ever.
// (lb:all and lb:week:* hold scores from before, when any solo game counted; nothing reads them.)
//
//   lbd:all, lbd:day:<YYYY-MM-DD>  sorted sets, member "n:<lowercased name>", score = best total
//                                 plus a tiny tie-breaker (see encodeScore), raised with ZADD GT
//   <board>:stats                 hash member -> { name, games, bullseyes, best }
//
// Members carry an "n:" prefix so a name like "1e3" never comes back from Redis as a number.

export type Period = "today" | "all";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  best: number;
  bullseyes: number;
  games: number;
}

export interface LeaderboardData {
  period: Period;
  /** Today's daily, e.g. "2026-11-26". */
  day: string;
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
  /** Today's board. */
  dayRank: number;
  dayPlayers: number;
  /** The game had already been posted by this player; nothing changed. */
  already?: boolean;
}

interface Stats {
  name: string;
  games: number;
  bullseyes: number;
  best: number;
}

const ALL_BOARD = "lbd:all";
const DAY_TTL_SECONDS = 60 * 60 * 24 * 45;
export const LEADERBOARD_SIZE = 50;

const dayBoard = (day: string) => `lbd:day:${day}`;
const statsKey = (board: string) => `${board}:stats`;
const memberOf = (name: string) => `n:${name.toLowerCase()}`;

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

/** Adds one finished daily to its day's board and the all-time one. Returns whether it is a new best. */
async function record(name: string, day: string, total: number, bullseyes: number): Promise<boolean> {
  const member = memberOf(name);
  const boards = [ALL_BOARD, dayBoard(day)];
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
  const today = boards[1];
  await Promise.all([kv().expire(today, DAY_TTL_SECONDS), kv().expire(statsKey(today), DAY_TTL_SECONDS)]);
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
  game: { total: number; bullseyes: number; day?: string },
  extra: { newBest: boolean; already?: boolean },
): Promise<SubmitResult> {
  const member = memberOf(name);
  const [all, today] = await Promise.all([standing(ALL_BOARD, member), standing(dayBoard(game.day ?? dailyDate()), member)]);
  return {
    name,
    total: game.total,
    bullseyes: game.bullseyes,
    best: all.best,
    rank: all.rank,
    players: all.players,
    dayRank: today.rank,
    dayPlayers: today.players,
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
  if (!game.ranked || !game.day) throw new ApiError("unranked", 403);
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
    newBest = await record(name, game.day, game.total, game.bullseyes);
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
  const day = dailyDate();
  const board = period === "today" ? dayBoard(day) : ALL_BOARD;
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
  return { period, day, entries, players, me };
}
