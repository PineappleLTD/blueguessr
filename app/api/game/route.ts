import { apiFail, apiJson, clientIp, createGame, PLAYER_ID_PATTERN } from "@/lib/game";

/**
 * POST /api/game { playerId?, daily?, landmarks?, labels? } -> NewGame (lib/game.ts): five photos,
 * no answers. `landmarks` and `labels` say which map helpers are on; anything but `false` counts as on.
 */
export async function POST(request: Request) {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) ?? {};
    } catch {
      // An empty body is fine: a classic game not tied to a player.
    }
    const playerId = typeof body.playerId === "string" && PLAYER_ID_PATTERN.test(body.playerId) ? body.playerId : null;
    return apiJson(
      await createGame({
        playerId,
        ip: clientIp(request.headers),
        daily: body.daily === true,
        aids: { landmarks: body.landmarks !== false, labels: body.labels !== false },
      }),
    );
  } catch (e) {
    return apiFail(e);
  }
}
