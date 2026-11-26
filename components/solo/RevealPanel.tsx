"use client";

import { ArrowRight, Flag, Ruler, Target } from "lucide-react";
import PhotoCredit from "@/components/game/PhotoCredit";
import type { RoundResult } from "@/lib/game";
import { formatDistance } from "@/lib/geo";
import { MAX_ROUND_SCORE } from "@/lib/scoring";
import type { RoundPhoto } from "@/lib/types";
import { fmt, useCountUp } from "./hooks";
import { PHONE_PANEL_DVH } from "./MapDock";
import { reaction } from "./tiers";

const noFocus = (e: React.MouseEvent) => e.preventDefault();

/** After a guess: count-up score, distance, 0–5000 bar, photo credit and NEXT. */
export default function RevealPanel({
  result,
  photo,
  isLast,
  phone,
  onNext,
}: {
  result: RoundResult;
  photo: RoundPhoto;
  isLast: boolean;
  phone: boolean;
  onNext: () => void;
}) {
  const shown = useCountUp(result.score, { duration: 1150, delay: 650 });
  const pct = (shown / MAX_ROUND_SCORE) * 100;
  const bull = result.bullseye;

  const score = (
    <div className="min-w-0">
      <p className={`text-display sg-up text-xl ${bull ? "text-maize" : "text-maize-soft/80"}`} style={{ animationDelay: "500ms" }}>
        {reaction(result.distance, bull)}
      </p>
      <p className="text-display flex items-baseline gap-1.5 text-maize-gradient">
        <span className={`tabular-nums ${phone ? "text-6xl" : "text-7xl"}`}>{fmt(shown)}</span>
        <span className="text-2xl">pts</span>
      </p>
    </div>
  );

  const distance = (
    <div
      className={`sg-up flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2 ${bull ? "border-maize bg-maize text-mblue" : "border-maize/30 bg-mblue/70 text-maize"}`}
      style={{ animationDelay: "350ms" }}
    >
      {bull ? <Target className="size-5" strokeWidth={2.6} /> : <Ruler className="size-5" strokeWidth={2.4} />}
      <span className="text-display text-3xl tabular-nums">{formatDistance(result.distance)}</span>
    </div>
  );

  const bar = (
    <div
      className="relative h-4 overflow-hidden rounded-full border border-maize/25 bg-mblue-deep"
      role="meter"
      aria-label="Round score"
      aria-valuemin={0}
      aria-valuemax={MAX_ROUND_SCORE}
      aria-valuenow={result.score}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold-deep via-gold to-maize"
        style={{ width: `${pct}%` }}
      >
        <div className="sg-sheen absolute inset-0 rounded-full" />
      </div>
      {[0.25, 0.5, 0.75].map((f) => (
        <span key={f} className="absolute inset-y-0 w-px bg-night/50" style={{ left: `${f * 100}%` }} />
      ))}
    </div>
  );

  const next = (
    <button
      type="button"
      onMouseDown={noFocus}
      onClick={onNext}
      className={`btn-game ${phone ? "w-full py-4 text-2xl" : "shrink-0 self-stretch px-7 text-2xl"}`}
    >
      {isLast ? (
        <>
          Results <Flag className="size-5" strokeWidth={2.6} />
        </>
      ) : (
        <>
          Next <ArrowRight className="size-6" strokeWidth={2.8} />
        </>
      )}
      {!phone && (
        <kbd className="rounded-md border border-mblue/30 bg-mblue/10 px-1.5 py-0.5 font-sans text-[11px] font-bold not-italic tracking-normal">
          Space
        </kbd>
      )}
    </button>
  );

  if (phone) {
    return (
      <div
        className={`panel sg-up fixed inset-x-0 bottom-0 z-40 flex flex-col gap-3 overflow-y-auto rounded-t-[1.75rem] rounded-b-none px-4 pt-4 pb-[calc(0.9rem+env(safe-area-inset-bottom))] ${bull ? "sg-glow" : ""}`}
        style={{ height: `${PHONE_PANEL_DVH}dvh` }}
      >
        <div className="flex items-end justify-between gap-3">
          {score}
          {distance}
        </div>
        {bar}
        <PhotoCredit reveal={result.reveal} />
        <div className="mt-auto">{next}</div>
      </div>
    );
  }

  return (
    <div
      className={`panel sg-up fixed bottom-6 left-1/2 z-40 w-[min(820px,calc(100vw-48px))] -translate-x-1/2 p-4 ${bull ? "sg-glow" : ""}`}
    >
      <div className="flex items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.src}
          alt=""
          className="hidden h-[104px] w-[150px] shrink-0 rounded-xl border border-maize/25 object-cover lg:block"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-end justify-between gap-4">
            {score}
            {distance}
          </div>
          {bar}
        </div>
        {next}
      </div>
      <PhotoCredit reveal={result.reveal} className="mt-3 border-t border-maize/10 pt-2.5" />
    </div>
  );
}

/** Big "BULLSEYE" stamp and a maize flash over the map. */
export function BullseyeBurst({ phone }: { phone: boolean }) {
  return (
    <>
      <div className="sg-flash pointer-events-none fixed inset-0 z-[45] bg-maize" style={{ animationDelay: "650ms" }} aria-hidden />
      <div
        className="pointer-events-none fixed inset-x-0 z-[55] flex justify-center"
        style={{ top: phone ? "20dvh" : "30dvh" }}
        role="status"
      >
        <div className="sg-bull" style={{ animationDelay: "700ms" }}>
          <div className="text-display flex items-center gap-3 rounded-3xl border-4 border-mblue bg-gradient-to-b from-maize-soft via-maize to-gold px-7 py-3 text-6xl text-mblue shadow-[0_14px_0_var(--gold-deep),0_30px_60px_rgba(0,0,0,.5)] sm:text-8xl">
            <Target className="size-12 sm:size-16" strokeWidth={2.6} />
            Bullseye
          </div>
        </div>
      </div>
    </>
  );
}
