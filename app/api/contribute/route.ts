import { MAX_PENDING_PER_PLAYER, MAX_UPLOAD_BYTES, sanitizeFaces } from "@/components/contribute/shared";
import {
  addPending,
  campusSpot,
  clientKey,
  errorResponse,
  jsonError,
  pendingCount,
  PLAYER_ID_PATTERN,
  releaseSlot,
  reserveSlot,
  underLimit,
} from "@/lib/contributions";
import { claimName, cleanName } from "@/lib/names";
import {
  BadImageError,
  cleanPhoto,
  deleteImage,
  newId,
  storeImage,
  uploadsAvailable,
  UploadsUnavailableError,
} from "@/lib/uploads";

const IMAGE_TYPES = ["image/webp", "image/jpeg"];

/**
 * A player submits a photo for review (multipart form):
 * name, playerId, lat, lng, consent="yes", faces (JSON boxes, optional), photo (WebP or JPEG).
 */
export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) {
    return jsonError(413, "Photo is too big (4 MB max)");
  }
  if (!uploadsAvailable()) return jsonError(503, "Uploads are off right now");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "Bad upload");
  }

  if (form.get("consent") !== "yes") return jsonError(400, "Tick the box to release your photo");
  const name = cleanName(form.get("name"));
  if (!name) return jsonError(400, "Names are 2–20 letters, numbers, spaces, . _ or -");
  const playerId = form.get("playerId");
  if (typeof playerId !== "string" || !PLAYER_ID_PATTERN.test(playerId)) return jsonError(400, "Bad player id");
  const lat = Number(form.get("lat"));
  const lng = Number(form.get("lng"));
  if (!campusSpot({ lat, lng })) return jsonError(400, "Put the pin on campus");
  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return jsonError(400, "Add a photo");
  if (photo.size > MAX_UPLOAD_BYTES) return jsonError(413, "Photo is too big (4 MB max)");
  if (!IMAGE_TYPES.includes(photo.type)) return jsonError(415, "Photo must be WebP or JPEG");
  const faces = sanitizeFaces(form.get("faces"));

  try {
    if (!(await underLimit(`contrib:ip:${clientKey(req)}`, 30, 60 * 60))) {
      return jsonError(429, "Whoa, lots of photos! Try again in an hour");
    }
    if (!(await underLimit("contrib:all", 500, 24 * 60 * 60))) {
      return jsonError(503, "The review pile is full today. Try tomorrow");
    }
    if (!(await claimName(name, playerId))) return jsonError(409, "That name is taken");
  } catch (e) {
    return errorResponse(e, "contribute checks");
  }

  const id = newId();
  if (!(await reserveSlot(playerId, id))) {
    return jsonError(429, `You already have ${MAX_PENDING_PER_PLAYER} photos waiting for review`);
  }
  let src: string | null = null;
  try {
    const clean = await cleanPhoto(Buffer.from(await photo.arrayBuffer()));
    src = await storeImage(clean.data, "pending", id);
    await addPending({
      id,
      src,
      width: clean.width,
      height: clean.height,
      lat,
      lng,
      name,
      playerId,
      faces,
      createdAt: Date.now(),
    });
    return Response.json({ ok: true, waiting: await pendingCount(playerId) }, { status: 201 });
  } catch (e) {
    await releaseSlot(playerId, id).catch(() => {});
    if (src) await deleteImage(src).catch(() => {});
    if (e instanceof BadImageError) return jsonError(422, e.message);
    if (e instanceof UploadsUnavailableError) return jsonError(503, "Uploads are off right now");
    return errorResponse(e, "contribute");
  }
}
