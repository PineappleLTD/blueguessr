import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, put } from "@vercel/blob";
import sharp, { type Metadata, type OutputInfo, type OverlayOptions } from "sharp";
import {
  MAX_ASPECT,
  MAX_EDGE,
  MIN_LONG_EDGE,
  MIN_SHORT_EDGE,
  type FaceBox,
} from "@/components/contribute/shared";

/**
 * Where player photos live, and the image processing they go through.
 *
 * Storage is Vercel Blob when BLOB_READ_WRITE_TOKEN is set. Without it, local development
 * writes to public/_dev-uploads/ (git-ignored); a deployment without the token refuses uploads.
 * Every file gets a random 128-bit name, so URLs can't be guessed and reveal nothing.
 */

/** Uploads can't be stored here (deployed without a Blob token). */
export class UploadsUnavailableError extends Error {}

/** The upload isn't a photo we can use. The message is shown to the player. */
export class BadImageError extends Error {}

export interface ProcessedImage {
  data: Buffer;
  width: number;
  height: number;
}

export type ImageKind = "pending" | "photo";

const DEV_DIR = "_dev-uploads";
const DEV_SRC = /^\/_dev-uploads\/(pending|photo)-[a-f0-9]{32}\.webp$/;
const BLOB_HOST = /\.public\.blob\.vercel-storage\.com$/;

export const newId = () => randomBytes(16).toString("hex");

function storage(): "blob" | "dev" | "off" {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (!process.env.VERCEL) return "dev";
  return "off";
}

export const uploadsAvailable = () => storage() !== "off";

/** Stores a WebP under an unguessable name and returns the URL the browser loads. */
export async function storeImage(data: Buffer, kind: ImageKind, id: string = newId()): Promise<string> {
  const where = storage();
  if (where === "blob") {
    const blob = await put(`${kind === "pending" ? "pending" : "photos"}/${id}.webp`, data, {
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: false,
      // Each URL holds one image forever, so browsers may keep game photos for a year.
      cacheControlMaxAge: kind === "photo" ? 31_536_000 : 300,
    });
    return blob.url;
  }
  if (where === "dev") {
    const dir = path.join(process.cwd(), "public", DEV_DIR);
    await mkdir(dir, { recursive: true });
    const file = `${kind}-${id}.webp`;
    await writeFile(path.join(dir, file), data);
    return `/${DEV_DIR}/${file}`;
  }
  throw new UploadsUnavailableError("Uploads are off on this deployment.");
}

function isOurBlob(src: string): boolean {
  try {
    const u = new URL(src);
    return u.protocol === "https:" && BLOB_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

/** Reads back an image this module stored. Refuses anything else (no SSRF, no path tricks). */
export async function readImage(src: string): Promise<Buffer> {
  if (DEV_SRC.test(src)) return readFile(path.join(process.cwd(), "public", src));
  if (isOurBlob(src)) {
    const res = await fetch(src, { cache: "no-store" });
    if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("Not an uploaded image");
}

/** Deletes an image this module stored. Leaves other URLs (e.g. static photos) alone. */
export async function deleteImage(src: string): Promise<void> {
  if (DEV_SRC.test(src)) {
    await unlink(path.join(process.cwd(), "public", src)).catch(() => {});
  } else if (isOurBlob(src) && process.env.BLOB_READ_WRITE_TOKEN) {
    await del(src);
  }
}

/**
 * Decodes an untrusted upload and saves it again as a plain WebP: turned upright, at most
 * MAX_EDGE px, and with no metadata at all. A JPEG with GPS tags would otherwise hand players
 * the answer, so this runs on every upload whatever the browser already did.
 */
export async function cleanPhoto(input: Buffer): Promise<ProcessedImage> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new BadImageError("That file isn't a photo we can read");
  }
  if (meta.format !== "jpeg" && meta.format !== "webp") throw new BadImageError("Photo must be WebP or JPEG");
  if ((meta.pages ?? 1) > 1) throw new BadImageError("Animated images can't be used");

  let out: { data: Buffer; info: OutputInfo };
  try {
    out = await sharp(input, { limitInputPixels: 50_000_000, autoOrient: true })
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new BadImageError("That file isn't a photo we can read");
  }
  const { width, height } = out.info;
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (long < MIN_LONG_EDGE || short < MIN_SHORT_EDGE) throw new BadImageError("Photo is too small");
  if (long / short > MAX_ASPECT) throw new BadImageError("Photo is too stretched");
  return { data: out.data, width, height };
}

/** Pixel rectangle for a face box, grown so hair, ears and chin are covered too. */
function faceRegion(f: FaceBox, W: number, H: number) {
  const cx = (f.x + f.w / 2) * W;
  const cy = (f.y + f.h / 2) * H;
  const w = f.w * W * 1.35;
  const h = f.h * H * 1.45;
  const left = Math.max(0, Math.floor(cx - w / 2));
  const top = Math.max(0, Math.floor(cy - h / 2));
  const right = Math.min(W, Math.ceil(cx + w / 2));
  const bottom = Math.min(H, Math.ceil(cy + h / 2));
  if (right - left < 2 || bottom - top < 2) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Blurs each face box beyond recognition (pixelate, then a heavy Gaussian blur, with soft
 * rounded corners) and saves the result as a fresh WebP with no metadata.
 */
export async function blurFaces(input: Buffer, faces: FaceBox[]): Promise<ProcessedImage> {
  const { width: W = 0, height: H = 0 } = await sharp(input).metadata();
  const overlays: OverlayOptions[] = [];
  for (const face of faces) {
    const r = faceRegion(face, W, H);
    if (!r) continue;
    const region = await sharp(input).extract(r).toBuffer();
    const tiny = await sharp(region)
      .resize(Math.max(1, Math.round(r.width / 10)), Math.max(1, Math.round(r.height / 10)), { fit: "fill" })
      .toBuffer();
    const blurred = await sharp(tiny)
      .resize(r.width, r.height, { fit: "fill", kernel: "cubic" })
      .blur(Math.max(3, Math.min(r.width, r.height) / 7))
      .toBuffer();
    const radius = Math.round(Math.min(r.width, r.height) * 0.3);
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}">` +
        `<rect width="${r.width}" height="${r.height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
    );
    const shaped = await sharp(blurred)
      .ensureAlpha()
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
    overlays.push({ input: shaped, left: r.left, top: r.top });
  }
  const { data, info } = await sharp(input)
    .composite(overlays)
    .webp({ quality: 84 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
