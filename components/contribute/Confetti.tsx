"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#FFCB05", "#E8A317", "#FFE680", "#FFFFFF", "#4FC3F7", "#00274C"];

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  w: number;
  h: number;
  color: string;
}

/** A one-shot burst of maize and blue confetti from the given point (fractions of the viewport). */
export default function Confetti({ originX = 0.5, originY = 0.35 }: { originX?: number; originY?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const bits: Bit[] = Array.from({ length: 160 }, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const speed = 7 + Math.random() * 11;
      return {
        x: W * originX,
        y: H * originY,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 3,
        spin: (Math.random() - 0.5) * 0.4,
        angle: Math.random() * Math.PI,
        w: 6 + Math.random() * 7,
        h: 3 + Math.random() * 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    });

    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, W, H);
      const fade = Math.max(0, 1 - Math.max(0, frame - 90) / 60);
      for (const b of bits) {
        b.vy += 0.35;
        b.vx *= 0.985;
        b.vy *= 0.985;
        b.x += b.vx;
        b.y += b.vy;
        b.angle += b.spin;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle);
        ctx.scale(1, Math.abs(Math.cos(b.angle * 1.7)) + 0.2);
        ctx.fillStyle = b.color;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      }
      if (fade > 0) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [originX, originY]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-50 h-full w-full" />;
}
