import { playerSecret, readJson, roomHint, roomResponse, submitGuess } from "@/lib/rooms";

/** Lock in a guess: { round, lat, lng }. One per player per round. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await readJson(request);
  return roomResponse(await submitGuess(code, playerSecret(request), body, roomHint(request)));
}
