import { joinRoom, playerSecret, readJson, roomResponse } from "@/lib/rooms";

/** Join with { name }. After the game has started, joiners watch until the rematch. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await readJson(request);
  return roomResponse(await joinRoom(code, playerSecret(request), body.name));
}
