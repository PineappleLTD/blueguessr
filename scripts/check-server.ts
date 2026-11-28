// Run: npx tsx --conditions=react-server scripts/check-server.ts
// In-memory store only: refuses to run when Redis credentials are in the environment.
if (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) {
  console.error("Unset KV_REST_API_URL / UPSTASH_REDIS_REST_URL first: this script must never touch the real database.");
  process.exit(1);
}
// Behavior checks for BlueGuessr's server logic; must pass on the old and the new code alike.
import * as rooms from "@/lib/rooms";
import * as game from "@/lib/game";
import * as lb from "@/lib/leaderboard";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
function ok(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  checks++;
}
type V = { code: string; rid?: string; v: number; phase: string; game: number; round: number; startsAt: number | null;
  players: { pid: string; hp: number; out: string | null }[]; reveal: unknown; result: unknown };
const hintOf = (v: V) => (v.rid ? { rid: v.rid, game: v.phase === "round" ? v.game : null, round: v.phase === "round" ? v.round : null } : undefined);
const getRoom = rooms.getRoom as unknown as (c: string, s: string | null, h?: unknown) => ReturnType<typeof rooms.getRoom>;
const guess = rooms.submitGuess as unknown as (c: string, s: string, b: Record<string, unknown>, h?: unknown) => ReturnType<typeof rooms.submitGuess>;

async function versus() {
  const A = "secretAAAAAAAAAAAAAAAAAAAAAA", B = "secretBBBBBBBBBBBBBBBBBBBBBB", C = "secretCCCCCCCCCCCCCCCCCCCCCC";
  const code = ((await rooms.createRoom(A, "Alex")).body.view as unknown as V).code;
  const jb = await rooms.joinRoom(code, B, "Alex"); // same name: must become "Alex 2"
  ok(JSON.stringify(jb.body.view).includes("Alex 2"), "duplicate name gets a suffix");
  ok((await rooms.startGame(code, B, "start", 15)).status === 403, "non-host can't start");
  let v = (await rooms.startGame(code, A, "start", 15)).body.view as unknown as V;
  ok(v.phase === "round" && v.round === 1, "start -> round 1");
  // Stale and foreign hints must not break polls.
  for (const h of [hintOf(v), { rid: "AAAAAAAAAAAA", game: 1, round: 1 }, { rid: v.rid ?? "x", game: 9, round: 9 }, undefined]) {
    const r = await getRoom(code, A, h);
    ok(r.status === 200 && (r.body.view as unknown as V).round === 1, "poll with hint " + JSON.stringify(h));
  }
  ok((await guess(code, A, { round: 1, game: v.game, lat: 42.278, lng: -83.738 }, hintOf(v))).status === 409, "guess during intro is too early");
  let rounds = 0;
  while (v.phase !== "finished" && rounds < 12) {
    rounds++;
    await sleep(Math.max(0, (v.startsAt ?? 0) - Date.now()) + 30);
    const g1 = await guess(code, A, { round: v.round, game: v.game, lat: 42.2780, lng: -83.7382 }, hintOf(v));
    ok(g1.status === 200, `round ${v.round}: A guesses`);
    const dup = await guess(code, A, { round: v.round, game: v.game, lat: 42.2, lng: -83.7 }, hintOf(v));
    ok(dup.status === 409 && dup.body.error === "already_guessed", "second guess rejected");
    const g2 = await guess(code, B, { round: v.round, game: v.game, lat: 42.2920, lng: -83.7160 }, hintOf(v));
    v = g2.body.view as unknown as V;
    ok(v.phase === "reveal" && v.reveal, `round ${rounds}: both guessed -> reveal`);
    // Watcher C joins mid-game and polls with an old hint.
    if (rounds === 1) ok((await rooms.joinRoom(code, C, "Cam")).status === 200, "watcher joins mid-game");
    await sleep(1600);
    v = (await rooms.skipReveal(code, A)).body.view as unknown as V;
    const polled = (await getRoom(code, C, { rid: v.rid, game: v.game, round: Math.max(1, v.round - 1) })).body.view as unknown as V;
    ok(polled.phase === v.phase && polled.round === v.round, "poll after a round change sees the new round");
  }
  ok(v.phase === "finished" && v.result, `game finishes (after ${rounds} rounds)`);
  const hp = v.players.map((p) => p.hp);
  ok(hp.some((h) => h <= 0) || v.players.some((p) => p.out), "someone is out at the end: " + JSON.stringify(hp));
  const re = (await rooms.startGame(code, A, "rematch", 15)).body.view as unknown as V;
  ok(re.phase === "round" && re.game === 2 && re.round === 1, "rematch -> game 2 round 1");
  ok((await getRoom(code, B, { rid: v.rid, game: null, round: null })).status === 200, "poll with finished-phase hint after rematch");
  await rooms.leaveRoom(code, B);
  await sleep(50);
  const afterLeave = (await getRoom(code, A, hintOf(re))).body.view as unknown as V;
  ok(afterLeave.phase !== "round" || afterLeave.players.find((p) => p.out === "left"), "leaving mid-round forfeits");
}

async function solo() {
  const pid = "regressPlayerXXXXXXXXXXXXX";
  const g = await game.createGame({ playerId: pid, ip: "5.5.5.5" });
  ok(g.rounds.length === 5 && !g.ranked, "classic game: 5 rounds, unranked");
  await game.submitGuess(g.id, 1, { lat: 42.27, lng: -83.73 }).then(() => ok(false, "out of order allowed"), (e) => ok(e.status === 409, "out-of-order guess rejected"));
  const r0 = await game.submitGuess(g.id, 0, { lat: 42.278, lng: -83.738 });
  const again = await game.submitGuess(g.id, 0, { lat: 40, lng: -80 });
  ok(JSON.stringify(r0) === JSON.stringify(again), "repeat guess returns stored result");
  for (let r = 1; r < 5; r++) await game.submitGuess(g.id, r, { lat: 42.28, lng: -83.74 });
  const st = await game.gameState(g.id);
  ok(st.done && st.results.length === 5, "game state done after 5 guesses");
  const g2 = await game.createGame({ playerId: pid, ip: "5.5.5.5" });
  ok(g.rounds.every((p) => !g2.rounds.some((q) => q.id === p.id)), "next classic game avoids seen photos");
  await game.startRound("not-a-real-id!!", 0).then(() => ok(false, "bad id"), (e) => ok(e.status === 404, "bad id -> 404"));
  await game.submitGuess("AAAAAAAAAAAAAAAAAAAAAA", 0, { lat: 42.27, lng: -83.73 }).then(() => ok(false, "missing game"), (e) => ok(e.status === 404, "missing game -> 404"));

  const d = await game.createGame({ playerId: pid, ip: "5.5.5.6", daily: true, aids: { landmarks: false, labels: false } });
  ok(d.ranked && d.day && d.roundSeconds === 30, "first daily is ranked and timed");
  const d2 = await game.createGame({ playerId: pid, ip: "5.5.5.6", daily: true, aids: { landmarks: false, labels: false } });
  ok(!d2.ranked && d2.unranked === "replay", "second daily is a replay");
  ok(JSON.stringify(d.rounds) === JSON.stringify(d2.rounds), "everyone gets the same daily photos");
  await game.submitGuess(d.id, 0, { lat: 42.27, lng: -83.73 }).then(() => ok(false, "unstarted"), (e) => ok(e.status === 409, "guess before round start rejected"));
  const c1 = await game.startRound(d.id, 0);
  await sleep(20);
  const c2 = await game.startRound(d.id, 0);
  ok(c1.endsAt === c2.endsAt && c1.endsAt > Date.now(), "round clock starts once");
  for (let r = 0; r < 5; r++) {
    if (r) await game.startRound(d.id, r);
    await game.submitGuess(d.id, r, { lat: 42.278, lng: -83.738 });
  }
  const sub = await lb.submitScore(d.id, pid, "Regress");
  ok(sub.rank >= 1 && sub.name === "Regress", "score submitted");
  const board = await lb.getLeaderboard("today", "Regress");
  ok(board.me && board.me.name === "Regress" && board.me.games === 1, "leaderboard finds me with stats");
  ok(board.entries.every((e) => e.name && e.games >= 1), "every row has its stats");
  const none = await lb.getLeaderboard("today", "Nobody");
  ok(none.me === null, "unknown name -> no row");
  // Rate limit: 120 games an hour per IP.
  let limited = false;
  for (let i = 0; i < 125 && !limited; i++) {
    await game.createGame({ ip: "7.7.7.7" }).catch((e) => { if (e.status === 429) limited = true; else throw e; });
    if (limited) ok(i === 120, "rate limit trips on game 121, not " + (i + 1));
  }
  ok(limited, "rate limit reached");
}

(async () => {
  await solo();
  await versus();
  console.log(`all ${checks} checks passed`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
