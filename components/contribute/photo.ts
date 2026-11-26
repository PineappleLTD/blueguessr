"use client";

import { MAX_EDGE, MAX_UPLOAD_BYTES, MIN_LONG_EDGE, MIN_SHORT_EDGE } from "./shared";

export interface PreparedPhoto {
  blob: Blob;
  width: number;
  height: number;
  /** The exact pixels that get uploaded; face detection runs on this. */
  canvas: HTMLCanvasElement;
}

export class PhotoError extends Error {}

/** Decodes with the camera's rotation applied, falling back to an <img> where options aren't supported. */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Turns a camera photo into the upload: upright, at most MAX_EDGE px on the long edge, saved as
 * WebP (JPEG where the browser can't encode WebP) at ~0.82. Redrawing through a canvas drops
 * the EXIF block, GPS included. The server cleans it again anyway.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (file.type && !file.type.startsWith("image/")) throw new PhotoError("That's not a photo");
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    throw new PhotoError("Can't open that photo. Try a JPEG");
  }
  const sw = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const sh = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  if (Math.max(sw, sh) < MIN_LONG_EDGE || Math.min(sw, sh) < MIN_SHORT_EDGE) {
    if (!(source instanceof HTMLImageElement)) source.close();
    throw new PhotoError("Photo is too small");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const width = Math.round(sw * scale);
  const height = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoError("Can't process photos on this browser");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  if (!(source instanceof HTMLImageElement)) source.close();

  let blob = await toBlob(canvas, "image/webp", 0.82);
  // Browsers that can't encode WebP quietly hand back a PNG instead.
  if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", 0.82);
  if (!blob) throw new PhotoError("Can't process photos on this browser");
  if (blob.size > MAX_UPLOAD_BYTES) blob = await toBlob(canvas, "image/jpeg", 0.7);
  if (!blob || blob.size > MAX_UPLOAD_BYTES) throw new PhotoError("Photo is too big");
  return { blob, width, height, canvas };
}
