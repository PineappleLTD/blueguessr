import type { NextRequest } from "next/server";
import { ApiError, apiFail, apiJson, GAME_ID_PATTERN, PLAYER_ID_PATTERN, readJson } from "@/lib/game";
import { getLeaderboard, submitScore } from "@/lib/leaderboard";

/** GET /api/leaderboard?period=today|all[&me=<name>] -> top 50 of the daily board (+ the asking player's row). */
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams;
    const period = q.get("period") === "all" ? "all" : "today";
    return apiJson(await getLeaderboard(period, q.get("me")));
  } catch (e) {
    return apiFail(e);
  }
}

/** POST /api/leaderboard { gameId, playerId, name } -> rank and best after posting a finished game. */
export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const { gameId, playerId, name } = body;
    if (typeof gameId !== "string" || !GAME_ID_PATTERN.test(gameId)) throw new ApiError("not-found", 404);
    if (typeof playerId !== "string" || !PLAYER_ID_PATTERN.test(playerId)) throw new ApiError("bad-request", 400);
    return apiJson(await submitScore(gameId, playerId, name));
  } catch (e) {
    return apiFail(e);
  }
}
