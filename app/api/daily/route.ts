import { dailyDate } from "@/lib/daily";
import { apiFail, apiJson, PLAYER_ID_PATTERN, playedDaily, readJson } from "@/lib/game";

/** POST /api/daily { playerId? } -> { day, played }: today's daily, and whether this player started it. */
export async function POST(request: Request) {
  try {
    const { playerId } = await readJson(request);
    const played = typeof playerId === "string" && PLAYER_ID_PATTERN.test(playerId) ? await playedDaily(playerId) : false;
    return apiJson({ day: dailyDate(), played });
  } catch (e) {
    return apiFail(e);
  }
}
