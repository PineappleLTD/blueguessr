"use client";

import type { FaceDetector } from "@mediapipe/tasks-vision";
import { MAX_FACES, type FaceBox } from "./shared";

// On-device face finding with MediaPipe's BlazeFace (short range). Nothing leaves the phone:
// the boxes only travel with the upload so the reviewer knows what to blur.

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

let detector: Promise<FaceDetector> | null = null;

/** Loads the detector once (wasm + model, a few MB). Safe to call early to warm it up. */
export function loadFaceDetector(): Promise<FaceDetector> {
  if (!detector) {
    detector = (async () => {
      const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.5,
      });
    })();
    detector.catch(() => {
      detector = null; // let a later photo retry
    });
  }
  return detector;
}

interface Hit extends FaceBox {
  score: number;
}

function iou(a: FaceBox, b: FaceBox): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const small = Math.min(a.w * a.h, b.w * b.h);
  // Overlap relative to the smaller box, so a face found at two scales merges into one.
  return small > 0 ? inter / small : 0;
}

/**
 * Finds faces in the photo. BlazeFace short range looks at a 128 px square, so far-away faces
 * vanish on a full photo: it also scans overlapping square tiles at a few zoom levels and
 * merges what it finds. Boxes come back as fractions of the image.
 */
export async function detectFaces(canvas: HTMLCanvasElement): Promise<FaceBox[]> {
  const fd = await loadFaceDetector();
  const W = canvas.width;
  const H = canvas.height;
  const short = Math.min(W, H);
  const work = document.createElement("canvas");
  const SIDE = 256;
  work.width = SIDE;
  work.height = SIDE;
  const ctx = work.getContext("2d");
  if (!ctx) return [];

  const hits: Hit[] = [];
  for (const k of [1, 2, 3, 4]) {
    // Let the page breathe between zoom levels (this runs on the main thread).
    await new Promise((r) => setTimeout(r, 0));
    const tile = Math.min(short, Math.round((short / k) * 1.3));
    const stride = Math.max(1, Math.round(tile * 0.75));
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = 0; ; x += stride) {
      xs.push(Math.min(x, W - tile));
      if (x + tile >= W) break;
    }
    for (let y = 0; ; y += stride) {
      ys.push(Math.min(y, H - tile));
      if (y + tile >= H) break;
    }
    for (const sy of ys) {
      for (const sx of xs) {
        ctx.clearRect(0, 0, SIDE, SIDE);
        ctx.drawImage(canvas, sx, sy, tile, tile, 0, 0, SIDE, SIDE);
        const f = tile / SIDE;
        for (const d of fd.detect(work).detections) {
          const b = d.boundingBox;
          if (!b) continue;
          hits.push({
            x: (sx + b.originX * f) / W,
            y: (sy + b.originY * f) / H,
            w: (b.width * f) / W,
            h: (b.height * f) / H,
            score: d.categories[0]?.score ?? 0,
          });
        }
      }
    }
  }

  // Keep the most confident box of each overlapping cluster.
  hits.sort((a, b) => b.score - a.score);
  const kept: Hit[] = [];
  for (const h of hits) if (kept.every((k) => iou(k, h) < 0.4)) kept.push(h);
  return kept.slice(0, MAX_FACES).map(({ x, y, w, h }) => ({ x, y, w, h }));
}
