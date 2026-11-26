"use client";

import { useEffect, useRef } from "react";

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  wobble: number;
  round: boolean;
}

/**
 * Canvas confetti. Rains from the top, or bursts from `origin` (fractions of the box).
 * Plays once per `burstKey`. Does nothing for people who prefer reduced motion.
 */
export default function Confetti({
  colors,
  burstKey,
  origin,
  count = 170,
  durationMs = 5200,
  className = "",
}: {
  colors: string[];
  burstKey: string | number;
  origin?: { x: number; y: number };
  count?: number;
  durationMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const colorKey = colors.join(",");
  const ox = origin?.x;
  const oy = origin?.y;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const palette = colorKey.split(",");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const burst = ox !== undefined && oy !== undefined;
    const bits: Bit[] = Array.from({ length: count }, (_, i) => {
      const angle = burst ? -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1 : 0;
      const speed = burst ? 6 + Math.random() * 9 : 0;
      return {
        x: burst ? ox * w : Math.random() * w,
        y: burst ? oy * h : -20 - Math.random() * h * 0.6,
        vx: burst ? Math.cos(angle) * speed : (Math.random() - 0.5) * 2.5,
        vy: burst ? Math.sin(angle) * speed : 2 + Math.random() * 3,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 7,
        h: 9 + Math.random() * 9,
        color: palette[i % palette.length],
        wobble: Math.random() * Math.PI * 2,
        round: Math.random() < 0.25,
      };
    });
    const started = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      const age = t - started;
      ctx.clearRect(0, 0, w, h);
      const fade = Math.max(0, Math.min(1, (durationMs - age) / 900));
      let alive = 0;
      for (const b of bits) {
        b.vy += burst ? 0.28 : 0.06;
        b.vx *= 0.985;
        b.vy = Math.min(b.vy, burst ? 9 : 5);
        b.wobble += 0.12;
        b.x += b.vx + Math.sin(b.wobble) * 0.8;
        b.y += b.vy;
        b.rot += b.vr;
        if (b.y > h + 30) continue;
        alive++;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.color;
        if (b.round) {
          ctx.beginPath();
          ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.scale(1, Math.cos(b.wobble));
          ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        }
        ctx.restore();
      }
      if (age < durationMs && alive > 0) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [burstKey, colorKey, ox, oy, count, durationMs]);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none ${className}`} />;
}
