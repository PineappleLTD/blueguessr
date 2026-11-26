import { adminGuard } from "@/lib/admin-auth";
import { errorResponse, reviewData } from "@/lib/contributions";

/** The review queue and the live player photos. */
export async function GET(req: Request) {
  const denied = await adminGuard(req);
  if (denied) return denied;
  try {
    return Response.json(await reviewData(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e, "review queue");
  }
}
