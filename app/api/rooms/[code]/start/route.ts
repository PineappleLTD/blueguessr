import { playerSecret, roomResponse, startGame } from "@/lib/rooms";

/** Host only: start the first game (needs two players). */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return roomResponse(await startGame(code, playerSecret(request), "start"));
}
