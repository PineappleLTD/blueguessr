import { endSession, sameOrigin } from "@/lib/admin-auth";
import { jsonError } from "@/lib/contributions";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "Wrong origin");
  await endSession();
  return Response.json({ ok: true });
}
