import { getRoom, playerSecret, roomResponse } from "@/lib/rooms";

/** The room as the caller sees it. Clients poll this about once a second. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return roomResponse(await getRoom(code, playerSecret(request)));
}
