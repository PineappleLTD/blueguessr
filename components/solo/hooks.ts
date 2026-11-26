"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Phone layout: narrow screens, and touch screens up to small-tablet landscape. */
const PHONE_QUERY = "(max-width: 767px), (pointer: coarse) and (max-width: 1100px)";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function mediaStore(query: string) {
  return {
    subscribe(cb: () => void) {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    get: () => window.matchMedia(query).matches,
  };
}
const phone = mediaStore(PHONE_QUERY);
const reduced = mediaStore(REDUCED_QUERY);

export function useIsPhone(): boolean {
  return useSyncExternalStore(phone.subscribe, phone.get, () => false);
}

const wide = mediaStore("(min-width: 1024px)");

/** lg breakpoint and up (two-column layouts). */
export function useIsWide(): boolean {
  return useSyncExternalStore(wide.subscribe, wide.get, () => true);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(reduced.subscribe, reduced.get, () => false);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(REDUCED_QUERY).matches;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Animates a number toward `target` (from wherever it currently is), for scoreboards.
 * Jumps straight there when the player prefers reduced motion.
 */
export function useCountUp(
  target: number,
  { duration = 1000, delay = 0, initial = 0 }: { duration?: number; delay?: number; initial?: number } = {},
): number {
  const [value, setValue] = useState(initial);
  const shown = useRef(initial);
  useEffect(() => {
    const from = shown.current;
    if (from === target) return;
    const instant = prefersReducedMotion();
    const start = performance.now() + (instant ? 0 : delay);
    const dur = instant ? 0 : duration;
    let raf = 0;
    const tick = (now: number) => {
      const t = dur ? Math.min(1, Math.max(0, (now - start) / dur)) : 1;
      const v = Math.round(from + (target - from) * easeOutCubic(t));
      shown.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay]);
  return value;
}

const NEVER = Symbol("never");

/** True once `ms` have passed since `key` last changed (false again right after a change). */
export function useElapsed(key: unknown, ms: number): boolean {
  const [doneFor, setDoneFor] = useState<unknown>(NEVER);
  useEffect(() => {
    const t = setTimeout(() => setDoneFor(key), ms);
    return () => clearTimeout(t);
  }, [key, ms]);
  return doneFor === key;
}

const preloaded = new Set<string>();

/** Warms the browser cache for a photo. Resolves when it is decoded (or failed). */
export function preloadImage(src: string, priority: "high" | "low" = "low"): Promise<void> {
  return new Promise((resolve) => {
    if (preloaded.has(src)) return resolve();
    const img = new Image();
    img.decoding = "async";
    img.fetchPriority = priority;
    img.onload = () => {
      preloaded.add(src);
      img
        .decode()
        .catch(() => {})
        .finally(() => resolve());
    };
    img.onerror = () => resolve();
    img.src = src;
  });
}

/** Formats points with thousands separators: 18,420. */
export const fmt = (n: number) => n.toLocaleString("en-US");
