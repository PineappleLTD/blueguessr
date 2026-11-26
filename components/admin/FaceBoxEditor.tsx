"use client";

import { X } from "lucide-react";
import { useRef, useState } from "react";
import type { FaceBox } from "@/components/contribute/shared";

export interface EditBox extends FaceBox {
  id: string;
  /** Blur this box on approval. */
  on: boolean;
  /** Found by the face detector (vs drawn by the reviewer). */
  auto: boolean;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * The photo under review with its face boxes. Click a box to switch its blur on or off, drag on
 * the photo to draw a new one, × to delete. Boxes that will be blurred preview the blur live.
 */
export default function FaceBoxEditor({
  src,
  width,
  height,
  boxes,
  onChange,
  show,
  disabled,
}: {
  src: string;
  width: number;
  height: number;
  boxes: EditBox[];
  onChange: (boxes: EditBox[]) => void;
  show: boolean;
  disabled?: boolean;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const [draft, setDraft] = useState<FaceBox | null>(null);
  const nextId = useRef(0);

  const point = (e: React.PointerEvent) => {
    const r = overlayRef.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };
  const rect = (a: { x: number; y: number }, b: { x: number; y: number }): FaceBox => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  });

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || !show || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { ...point(e), pointer: e.pointerId };
    setDraft(null);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (start.current?.pointer !== e.pointerId) return;
    setDraft(rect(start.current, point(e)));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    if (s?.pointer !== e.pointerId) return;
    start.current = null;
    setDraft(null);
    const box = rect(s, point(e));
    if (box.w < 0.012 || box.h < 0.012) return;
    onChange([...boxes, { ...box, id: `drawn-${nextId.current++}`, on: true, auto: false }]);
  };

  return (
    <div
      className="relative mx-auto overflow-hidden rounded-2xl border-2 border-maize/30 bg-mblue-deep shadow-[0_18px_40px_rgba(0,0,0,.45)]"
      style={{
        width: `min(100%, calc(64vh * ${(width / height).toFixed(4)}))`,
        aspectRatio: `${width} / ${height}`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Submitted photo" draggable={false} className="absolute inset-0 h-full w-full object-cover select-none" />
      <div
        ref={overlayRef}
        className={`absolute inset-0 touch-none ${show && !disabled ? "cursor-crosshair" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          start.current = null;
          setDraft(null);
        }}
      >
        {show &&
          boxes.map((b) => (
            <div
              key={b.id}
              className="absolute"
              style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
            >
              <button
                type="button"
                disabled={disabled}
                aria-pressed={b.on}
                aria-label={b.on ? "Blur on: click to skip this box" : "Blur off: click to blur this box"}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onChange(boxes.map((x) => (x.id === b.id ? { ...x, on: !x.on } : x)))}
                className={`absolute inset-0 rounded-[28%] transition ${
                  b.on
                    ? "border-[3px] border-maize bg-maize/10 backdrop-blur-lg hover:bg-maize/25"
                    : "border-2 border-dashed border-white/70 bg-transparent hover:border-white"
                }`}
              />
              <button
                type="button"
                disabled={disabled}
                aria-label="Delete box"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onChange(boxes.filter((x) => x.id !== b.id))}
                className="absolute -top-2.5 -right-2.5 grid size-6 place-items-center rounded-full bg-night text-maize shadow ring-2 ring-maize/70 transition hover:scale-110 hover:bg-maize hover:text-night"
              >
                <X className="size-3.5" strokeWidth={3} aria-hidden />
              </button>
            </div>
          ))}
        {draft && (
          <div
            className="pointer-events-none absolute rounded-[28%] border-[3px] border-dashed border-maize bg-maize/15"
            style={{
              left: `${draft.x * 100}%`,
              top: `${draft.y * 100}%`,
              width: `${draft.w * 100}%`,
              height: `${draft.h * 100}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}
