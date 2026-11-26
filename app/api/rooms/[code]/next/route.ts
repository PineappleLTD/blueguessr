import { playerSecret, roomResponse, skipReveal } from "@/lib/rooms";

/** Host only: skip the rest of the reveal. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return roomResponse(await skipReveal(code, playerSecret(request)));
}
