import { apiFail, apiJson, clientIp, createGame, PLAYER_ID_PATTERN } from "@/lib/game";

/** POST /api/game { playerId? } -> { id, rounds } — starts a solo game: five photos, no answers. */
export async function POST(request: Request) {
  try {
    let playerId: string | null = null;
    try {
      const body = await request.json();
      if (typeof body?.playerId === "string" && PLAYER_ID_PATTERN.test(body.playerId)) playerId = body.playerId;
    } catch {
      // An empty body is fine: the game just isn't tied to a player.
    }
    return apiJson(await createGame({ playerId, ip: clientIp(request.headers) }));
  } catch (e) {
    return apiFail(e);
  }
}
