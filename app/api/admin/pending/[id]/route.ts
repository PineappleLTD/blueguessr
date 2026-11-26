import { sanitizeFaces } from "@/components/contribute/shared";
import { adminGuard } from "@/lib/admin-auth";
import { approvePending, errorResponse, jsonError, rejectPending } from "@/lib/contributions";

type Ctx = { params: Promise<{ id: string }> };

const ID = /^[a-f0-9]{32}$/;

/** Approve. Body: {lat, lng, faces}: the reviewer's final pin and the face boxes to blur. */
export async function POST(req: Request, { params }: Ctx) {
  const denied = await adminGuard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!ID.test(id)) return jsonError(404, "Not found");
  let body: { lat?: unknown; lng?: unknown; faces?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Bad request");
  }
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return jsonError(400, "Missing pin");
  try {
    const photo = await approvePending(id, { lat, lng, faces: sanitizeFaces(body.faces) });
    return Response.json({ ok: true, photo });
  } catch (e) {
    return errorResponse(e, "approve");
  }
}

/** Reject: deletes the submission and its image. */
export async function DELETE(req: Request, { params }: Ctx) {
  const denied = await adminGuard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!ID.test(id)) return jsonError(404, "Not found");
  try {
    await rejectPending(id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "reject");
  }
}
