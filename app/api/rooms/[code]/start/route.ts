import { playerSecret, roomResponse, startGame } from "@/lib/rooms";
import { versusRoundSeconds } from "@/lib/scoring";

/** Host only: start the first game (needs two players). `{ roundSeconds }` picks the round time. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let body: { roundSeconds?: unknown } = {};
  try {
    body = await request.json();
  } catch {}
  return roomResponse(await startGame(code, playerSecret(request), "start", versusRoundSeconds(body?.roundSeconds)));
}
