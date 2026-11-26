import { leaveRoom, playerSecret, roomResponse } from "@/lib/rooms";

/** Leave the room. Mid-game this forfeits the fight. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return roomResponse(await leaveRoom(code, playerSecret(request)));
}
