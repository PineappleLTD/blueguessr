"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RoundPhoto } from "@/lib/types";

/**
 * Fills its container with the round's photo. Scroll / pinch / buttons to zoom,
 * drag to pan, double-click to reset. A blurred copy fills any letterboxing.
 */
export default function PhotoViewer({ photo, className = "" }: { photo: RoundPhoto; className?: string }) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [gesturing, setGesturing] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; scale: number } | null>(null);

  // New photo: reset view and show the loading shimmer again. Adjusting state during
  // render (not in an effect) is React's recommended way to reset on a prop change.
  const [shownId, setShownId] = useState(photo.id);
  if (shownId !== photo.id) {
    setShownId(photo.id);
    setView({ scale: 1, x: 0, y: 0 });
    setLoaded(false);
  }

  const clamp = useCallback((s: number, x: number, y: number) => {
    const box = boxRef.current;
    const scale = Math.min(5, Math.max(1, s));
    if (!box) return { scale, x, y };
    const mx = ((scale - 1) * box.clientWidth) / 2;
    const my = ((scale - 1) * box.clientHeight) / 2;
    return { scale, x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
  }, []);

  const zoomBy = useCallback(
    (f: number) => setView((v) => clamp(v.scale * f, v.x * f, v.y * f)),
    [clamp],
  );

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setGesturing(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const s = (pinch.current.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.d;
      setView((v) => clamp(s, (v.x * s) / v.scale, (v.y * s) / v.scale));
    } else if (drag.current) {
      const d = drag.current;
      setView((v) => clamp(v.scale, d.vx + e.clientX - d.x, d.vy + e.clientY - d.y));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      setGesturing(false);
    }
  };

  return (
    <div
      ref={boxRef}
      className={`relative h-full w-full touch-none overflow-hidden bg-mblue-deep select-none ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => setView({ scale: 1, x: 0, y: 0 })}
      style={{ cursor: view.scale > 1 ? "grab" : "zoom-in" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.src}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl"
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={photo.id}
        src={photo.src}
        alt="Where on campus is this?"
        width={photo.width}
        height={photo.height}
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transition: gesturing ? "none" : "transform 120ms ease-out, opacity 300ms",
        }}
      />
      {!loaded && (
        <div
          className="absolute inset-0 animate-pulse bg-gradient-to-br from-mblue/60 via-mblue-deep to-mblue/60"
          aria-hidden
        />
      )}
      <div className="absolute right-3 bottom-3 flex flex-col gap-2" onPointerDown={(e) => e.stopPropagation()}>
        {[
          { icon: Plus, label: "Zoom in", on: () => zoomBy(1.4) },
          { icon: Minus, label: "Zoom out", on: () => zoomBy(1 / 1.4) },
          { icon: RotateCcw, label: "Reset view", on: () => setView({ scale: 1, x: 0, y: 0 }) },
        ].map(({ icon: Icon, label, on }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            onClick={on}
            className="grid size-10 place-items-center rounded-xl border border-maize/30 bg-night/80 text-maize backdrop-blur transition hover:bg-mblue hover:text-maize-soft active:scale-95"
          >
            <Icon className="size-5" />
          </button>
        ))}
      </div>
    </div>
  );
}
