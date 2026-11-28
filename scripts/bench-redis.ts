// Run: npx tsx --conditions=react-server scripts/bench-redis.ts
// In-memory store only: refuses to run when Redis credentials are in the environment.
if (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) {
  console.error("Unset KV_REST_API_URL / UPSTASH_REDIS_REST_URL first: this script must never touch the real database.");
  process.exit(1);
}
// Counts Redis round trips and commands per request for BlueGuessr's hot paths.
// Runs the real lib/ functions against the in-memory KV, with every KV call delayed by RTT ms.
// Calls issued together overlap (like Upstash auto-pipelining), calls that wait on each other add up,
// so elapsed / RTT = sequential round trips on the request's critical path.
import { kv } from "@/lib/kv";
import * as rooms from "@/lib/rooms";
import * as game from "@/lib/game";
import * as lb from "@/lib/leaderboard";

const RTT = 100;
let cmds = 0;
let live = false; // latency and counting only while measuring
const db = kv() as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
for (const name of Object.keys(db)) {
  const orig = db[name];
  db[name] = async (...args: unknown[]) => {
    if (live) {
      cmds++;
      await new Promise((r) => setTimeout(r, RTT));
    }
    return orig(...args);
  };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const rows: { op: string; trips: number; cmds: number }[] = [];
async function measure<T>(op: string, fn: () => Promise<T>): Promise<T> {
  await sleep(RTT * 3); // let background writes from the last step land
  live = true;
  const c0 = cmds;
  const t0 = performance.now();
  const out = await fn();
  const ms = performance.now() - t0;
  await sleep(RTT * 3); // background writes still count as commands
  live = false;
  rows.push({ op, trips: Math.round(ms / RTT), cmds: cmds - c0 });
  return out;
}

type View = { code: string; game: number; round: number; rid?: string; phase: string; players: { pid: string }[] };
const hintOf = (v: View) =>
  v.rid ? { rid: v.rid, game: v.phase === "round" ? v.game : null, round: v.phase === "round" ? v.round : null } : undefined;
// getRoom's third argument only exists after the change; older code ignores it.
const getRoom = rooms.getRoom as unknown as (code: string, secret: string | null, hint?: unknown) => ReturnType<typeof rooms.getRoom>;
const guess = rooms.submitGuess as unknown as (c: string, s: string, b: Record<string, unknown>, hint?: unknown) => ReturnType<typeof rooms.submitGuess>;

async function main() {
  const A = "secretAAAAAAAAAAAAAAAAAAAAAA";
  const B = "secretBBBBBBBBBBBBBBBBBBBBBB";
  const created = await rooms.createRoom(A, "Alice");
  const code = (created.body.view as unknown as View).code;
  await measure("versus join", () => rooms.joinRoom(code, B, "Bob"));
  const started = await rooms.startGame(code, A, "start", 15);
  let view = started.body.view as unknown as View;

  // Polls: one where the 4 s presence write is due, one where it isn't.
  await measure("versus poll", () => getRoom(code, B, hintOf(view)));
  await sleep(4100);
  await measure("versus poll (presence write due)", () => getRoom(code, B, hintOf(view)));

  // Wait out the 3 s intro, then guess: first guess (round goes on), last guess (scores the round).
  await sleep(Math.max(0, (started.body.view as unknown as { startsAt: number }).startsAt - Date.now()) + 50);
  const g = { round: view.round, game: view.game, lat: 42.2780, lng: -83.7382 };
  await measure("versus guess (round goes on)", () => guess(code, A, g, hintOf(view)));
  const last = await measure("versus guess (last one, scores round)", () => guess(code, B, g, hintOf(view)));
  view = last.body.view as unknown as View;
  if (view.phase !== "reveal") throw new Error(`expected reveal after both guesses, got ${view.phase}`);

  // Solo
  const pid = "playerXXXXXXXXXXXXXXXXXXXX";
  const classic = await measure("solo new game", () => game.createGame({ playerId: pid, ip: "1.2.3.4" }));
  const daily = await measure("solo new daily", () =>
    game.createGame({ playerId: pid + "d", ip: "1.2.3.5", daily: true, aids: { landmarks: false, labels: false } }),
  );
  await measure("solo new daily (day's photos already picked)", () =>
    game.createGame({ playerId: pid + "e", ip: "1.2.3.6", daily: true, aids: { landmarks: false, labels: false } }),
  );
  await measure("solo start round (daily clock)", () => game.startRound(daily.id, 0));
  await measure("solo guess", () => game.submitGuess(classic.id, 0, { lat: 42.278, lng: -83.738 }));
  await measure("solo guess (daily, timed)", () => game.submitGuess(daily.id, 0, { lat: 42.278, lng: -83.738 }));

  // Leaderboard with 50+ players on today's board.
  for (let i = 0; i < 55; i++) {
    const p = `lbplayer${String(i).padStart(20, "0")}`;
    const ng = await game.createGame({ playerId: p, ip: `9.9.${i}.1`, daily: true, aids: { landmarks: false, labels: false } });
    for (let r = 0; r < 5; r++) {
      await game.startRound(ng.id, r);
      await game.submitGuess(ng.id, r, { lat: 42.27 + i / 1e4, lng: -83.738 });
    }
    await lb.submitScore(ng.id, p, `Player ${i}`);
  }
  await measure("leaderboard (top 50)", () => lb.getLeaderboard("today"));
  await measure("leaderboard (top 50 + my rank)", () => lb.getLeaderboard("today", "Nobody Here"));

  console.log(JSON.stringify(rows));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
