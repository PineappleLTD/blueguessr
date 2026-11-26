import { playerSecret, roomResponse, startGame } from "@/lib/rooms";

/** Host only: same room, fresh health and photos. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return roomResponse(await startGame(code, playerSecret(request), "rematch"));
}
