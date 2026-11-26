"use client";

import { useEffect, useRef } from "react";

/**
 * Wavy particle dunes (the Pineapple wave motif): rows of maize and gold dots rolling like
 * sand dunes. Fills its positioned parent; draws once and holds still for reduced motion.
 */
export default function DotDunes({ className = "", rows = 9, speed = 1 }: { className?: string; rows?: number; speed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    const t0 = performance.now();

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      const t = ((now - t0) / 1000) * speed;
      ctx.clearRect(0, 0, w, h);
      for (let r = 0; r < rows; r++) {
        const depth = rows === 1 ? 1 : r / (rows - 1); // 0 = far, 1 = near
        const gap = 9 + depth * 9;
        const base = h * (0.22 + 0.7 * depth);
        const amp = h * (0.05 + 0.07 * depth);
        const size = 0.7 + depth * 1.5;
        const drift = (t * (6 + depth * 14)) % gap;
        ctx.fillStyle = depth > 0.55 ? "#FFCB05" : "#E8A317";
        ctx.globalAlpha = 0.12 + depth * 0.5;
        ctx.beginPath();
        for (let x = -gap + drift; x < w + gap; x += gap) {
          const y =
            base +
            amp *
              (Math.sin(x * 0.006 + t * 0.35 + r * 0.9) * 0.62 +
                Math.sin(x * 0.0145 - t * 0.5 + r * 1.7) * 0.28 +
                Math.sin(x * 0.031 + t * 0.8 + r) * 0.1);
          ctx.moveTo(x + size, y);
          ctx.arc(x, y, size, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      draw(now);
      raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => {
      if (!raf && visible && !document.hidden && !still) raf = requestAnimationFrame(loop);
    };

    resize();
    draw(performance.now());
    if (!still) raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      wake();
    });
    io.observe(canvas);
    document.addEventListener("visibilitychange", wake);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", wake);
    };
  }, [rows, speed]);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none block h-full w-full ${className}`} />;
}
