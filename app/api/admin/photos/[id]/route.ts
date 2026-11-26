import { adminGuard } from "@/lib/admin-auth";
import { errorResponse, jsonError, removeApproved } from "@/lib/contributions";

/** Removes an approved player photo from the game and deletes its image. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await adminGuard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id)) return jsonError(404, "Not found");
  try {
    await removeApproved(id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "remove photo");
  }
}
