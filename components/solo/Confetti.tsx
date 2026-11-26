"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { prefersReducedMotion } from "./hooks";

export interface BurstOptions {
  /** 0..1 of the viewport. */
  x?: number;
  y?: number;
  /** Scales count and speed. */
  power?: number;
  /** Cone width, 1 = about 160°. */
  spread?: number;
}

export interface ConfettiHandle {
  burst(opts?: BurstOptions): void;
}

const COLORS = ["#FFCB05", "#FFCB05", "#E8A317", "#FFE27A", "#00274C", "#2F65A7", "#FFFFFF"];

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  tilt: number;
  vt: number;
  color: string;
  round: boolean;
  age: number;
}

/** The particle simulation, kept outside React: it mutates freely and only touches its canvas. */
class Engine {
  private bits: Bit[] = [];
  private raf = 0;
  private last = 0;
  constructor(private canvas: HTMLCanvasElement) {}

  burst({ x = 0.5, y = 0.6, power = 1, spread = 1 }: BurstOptions = {}) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const speed = Math.min(w, h) / 46;
    for (let i = 0, n = Math.round(150 * power); i < n; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9 * spread;
      const v = speed * (0.45 + Math.random() * 0.75) * Math.sqrt(power);
      this.bits.push({
        x: x * w + (Math.random() - 0.5) * 30,
        y: y * h + (Math.random() - 0.5) * 16,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        w: 6 + Math.random() * 7,
        h: 4 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        tilt: Math.random() * Math.PI,
        vt: 0.08 + Math.random() * 0.14,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        round: Math.random() < 0.22,
        age: 0,
      });
    }
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.bits = [];
  }

  private frame = (now: number) => {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return void (this.raf = 0);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const dt = Math.min(2.5, (now - this.last) / 16.67);
    this.last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const drag = Math.pow(0.986, dt);
    this.bits = this.bits.filter((b) => {
      b.age += dt;
      b.vy += 0.32 * dt;
      b.vx *= drag;
      b.vy *= drag;
      b.tilt += b.vt * dt;
      b.rot += b.vr * dt;
      b.x += (b.vx + Math.sin(b.tilt) * 0.8) * dt;
      b.y += b.vy * dt;
      if (b.y > h + 30 || b.age > 420) return false;
      ctx.globalAlpha = b.age > 300 ? Math.max(0, 1 - (b.age - 300) / 120) : 1;
      ctx.fillStyle = b.color;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      if (b.round) {
        ctx.beginPath();
        ctx.arc(0, 0, b.h / 2 + 1, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.scale(1, Math.cos(b.tilt));
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      }
      ctx.restore();
      return true;
    });
    ctx.globalAlpha = 1;
    this.raf = this.bits.length ? requestAnimationFrame(this.frame) : 0;
  };
}

/** Full-screen canvas confetti in maize, gold and blue. Hand-rolled: no dependency. */
export default function Confetti({ ref }: { ref?: Ref<ConfettiHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);

  useEffect(() => {
    const e = canvasRef.current ? new Engine(canvasRef.current) : null;
    engine.current = e;
    return () => {
      e?.stop();
      engine.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    burst(opts) {
      if (!prefersReducedMotion()) engine.current?.burst(opts);
    },
  }));

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[60] h-full w-full" />;
}
