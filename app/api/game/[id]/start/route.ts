import { ApiError, apiFail, apiJson, readJson, startRound } from "@/lib/game";

/** POST /api/game/[id]/start { round } -> { round, endsAt, serverNow }: starts a timed round's clock. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJson(request);
    if (typeof body.round !== "number") throw new ApiError("bad-request", 400);
    return apiJson(await startRound(id, body.round));
  } catch (e) {
    return apiFail(e);
  }
}
