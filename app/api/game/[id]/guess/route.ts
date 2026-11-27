import { ApiError, apiFail, apiJson, readJson, submitGuess, validGuess } from "@/lib/game";

/**
 * POST /api/game/[id]/guess { round, lat, lng }
 *   -> { round, guess, distance, score, bullseye, total, reveal, done }
 * `round` is 0-based and must be the next unguessed round; repeating a guessed round is a no-op.
 * In a timed game, `{ round, timeout: true }` ends a round that ran out without a pin.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJson(request);
    const guess = body.timeout === true ? null : validGuess(body.lat, body.lng);
    if ((!guess && body.timeout !== true) || typeof body.round !== "number") throw new ApiError("bad-request", 400);
    return apiJson(await submitGuess(id, body.round, guess));
  } catch (e) {
    return apiFail(e);
  }
}
