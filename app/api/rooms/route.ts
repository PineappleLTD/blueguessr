import { createRoom, playerSecret, readJson, roomResponse } from "@/lib/rooms";

/** Create a room: { name } -> { code, view }. The creator joins it and is the host. */
export async function POST(request: Request) {
  const body = await readJson(request);
  return roomResponse(await createRoom(playerSecret(request), body.name));
}
