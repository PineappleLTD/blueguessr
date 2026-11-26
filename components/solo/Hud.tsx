"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import type { RoundResult } from "@/lib/game";
import { MAX_ROUND_SCORE } from "@/lib/scoring";
import { fmt, useCountUp } from "./hooks";

/** In-game top bar: home, round counter with progress pips, running score. */
export default function Hud({
  index,
  count,
  results,
  total,
}: {
  index: number;
  count: number;
  results: RoundResult[];
  total: number;
}) {
  const shown = useCountUp(total, { duration: 900, delay: 900, initial: total });
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-start justify-between gap-2 bg-gradient-to-b from-night/85 via-night/35 to-transparent px-3 pt-[calc(0.6rem+env(safe-area-inset-top))] pb-10 sm:px-5 sm:pt-4">
      <Link
        href="/"
        aria-label="BlueGuessr home"
        className="group pointer-events-auto flex items-center gap-2 rounded-full py-1 pr-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="size-9 drop-shadow-lg transition-transform group-hover:-rotate-12 group-hover:scale-110" />
        <span className="text-display hidden text-2xl text-maize-gradient md:inline">BlueGuessr</span>
      </Link>

      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-baseline gap-2 rounded-full border border-maize/30 bg-night/75 px-4 py-1.5 shadow-lg backdrop-blur-md">
          <span className="text-display text-sm text-maize-soft/70">Round</span>
          <span className="text-display text-2xl text-maize tabular-nums">
            {index + 1}
            <span className="text-lg text-maize-soft/60"> / {count}</span>
          </span>
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {Array.from({ length: count }, (_, i) => {
            const r = results[i];
            if (r?.bullseye)
              return <Star key={i} className="size-3.5 fill-maize text-maize drop-shadow" strokeWidth={2.5} />;
            if (r)
              return (
                <span
                  key={i}
                  className="mt-0.5 size-2.5 rounded-full border border-maize/60"
                  style={{ background: `color-mix(in oklch, var(--maize) ${Math.round((r.score / MAX_ROUND_SCORE) * 100)}%, var(--mblue))` }}
                />
              );
            return (
              <span
                key={i}
                className={`mt-0.5 size-2.5 rounded-full ${i === index ? "animate-pulse bg-maize-soft" : "bg-foreground/20"}`}
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-baseline gap-2 rounded-full border border-maize/30 bg-night/75 px-4 py-1.5 shadow-lg backdrop-blur-md">
        <span className="text-display hidden text-sm text-maize-soft/70 sm:inline">Score</span>
        <span className="text-display text-2xl text-maize tabular-nums">{fmt(shown)}</span>
      </div>
    </div>
  );
}

/** "ROUND 3" slam at the start of each round. Remount (key) to replay. */
export function RoundBanner({ n, last }: { n: number; last: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[22%] z-30 flex justify-center" aria-hidden>
      <div className="sg-banner text-display rounded-2xl border-2 border-maize/50 bg-night/70 px-7 py-3 text-5xl text-maize-gradient shadow-2xl backdrop-blur-md sm:text-6xl">
        {last ? "Final round" : `Round ${n}`}
      </div>
    </div>
  );
}
