import { apiFail, apiJson, gameState } from "@/lib/game";

/** GET /api/game/[id] -> { id, rounds, results, done } — resumes a game after a reload. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return apiJson(await gameState(id));
  } catch (e) {
    return apiFail(e);
  }
}
