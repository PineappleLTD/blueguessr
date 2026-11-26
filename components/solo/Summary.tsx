"use client";

import Link from "next/link";
import { RotateCcw, Target, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import PhotoCredit from "@/components/game/PhotoCredit";
import Header from "@/components/site/Header";
import type { RoundResult } from "@/lib/game";
import { formatDistance } from "@/lib/geo";
import { MAX_GAME_SCORE, MAX_ROUND_SCORE } from "@/lib/scoring";
import type { RoundPhoto } from "@/lib/types";
import DotDunes from "./DotDunes";
import { fmt, useCountUp, useElapsed, useIsWide } from "./hooks";
import SubmitScore from "./SubmitScore";
import SummaryMap, { type SummaryRound } from "./SummaryMap";
import { tierFor, type Tier } from "./tiers";

const COUNT_MS = 1700;

function TierBadge({ tier }: { tier: Tier }) {
  const Icon = tier.icon;
  return (
    <div
      className="sg-stamp inline-flex items-center gap-3 rounded-2xl p-1.5 pr-5"
      style={{
        background: `linear-gradient(180deg, ${tier.from}, ${tier.to})`,
        boxShadow: "0 6px 0 oklch(0 0 0 / 0.35), 0 16px 34px oklch(0 0 0 / 0.35)",
      }}
    >
      <span className="grid size-14 place-items-center rounded-xl bg-white/25 shadow-inner">
        <Icon className="size-8" strokeWidth={2.4} style={{ color: tier.ink }} />
      </span>
      <span className="text-display text-3xl sm:text-4xl" style={{ color: tier.ink }}>
        {tier.name}
      </span>
    </div>
  );
}

/** End of a game: total, tier badge, rounds, map of every answer, leaderboard post, play again. */
export default function Summary({
  gameId,
  rounds,
  results,
  onPlayAgain,
  celebrate,
}: {
  gameId: string;
  rounds: RoundPhoto[];
  results: RoundResult[];
  onPlayAgain: () => void;
  celebrate: (power: number) => void;
}) {
  const total = results.reduce((s, r) => s + r.score, 0);
  const bullseyes = results.filter((r) => r.bullseye).length;
  const tier = tierFor(total);
  const shown = useCountUp(total, { duration: COUNT_MS, delay: 250 });
  const showTier = useElapsed(gameId, COUNT_MS + 300);
  const wide = useIsWide();
  const [focus, setFocus] = useState<number | null>(null);
  const mapRounds = useMemo<SummaryRound[]>(
    () => results.map((r) => ({ guess: r.guess, answer: { lat: r.reveal.lat, lng: r.reveal.lng }, bullseye: r.bullseye })),
    [results],
  );

  useEffect(() => {
    if (total < 15000 && bullseyes < 2) return;
    const t = setTimeout(() => celebrate(total >= 20000 ? 1.6 : 1), COUNT_MS + 350);
    return () => clearTimeout(t);
  }, [gameId, total, bullseyes, celebrate]);

  const map = (
    <section className="panel h-full overflow-hidden p-1.5">
      <div className="h-full overflow-hidden rounded-[1rem]">
        <SummaryMap rounds={mapRounds} focus={focus} onFocus={setFocus} />
      </div>
    </section>
  );

  return (
    <div className="relative flex min-h-dvh flex-col bg-night">
      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-[36vh] opacity-35">
        <DotDunes rows={8} speed={0.5} />
      </div>
      <Header />
      <main className="relative z-10 mx-auto grid w-full max-w-6xl gap-5 px-4 pb-14 sm:px-6 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="panel sg-up relative overflow-hidden p-5 sm:p-6">
            <div
              className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full opacity-40 blur-3xl"
              style={{ background: "radial-gradient(circle, var(--maize), transparent 65%)" }}
            />
            <p className="text-display text-xl text-maize-soft/70">Final score</p>
            <div className="flex flex-wrap items-end gap-x-3">
              <span className="text-display text-[5.5rem] leading-[0.85] text-maize-gradient tabular-nums sm:text-[7rem]">
                {fmt(shown)}
              </span>
              <span className="text-display mb-1.5 text-2xl text-maize-soft/45 tabular-nums">/ {fmt(MAX_GAME_SCORE)}</span>
            </div>
            <div className="mt-4 flex min-h-[4.5rem] flex-wrap items-center gap-3">
              {showTier && <TierBadge tier={tier} />}
              {showTier && bullseyes > 0 && (
                <span className="text-display sg-up inline-flex items-center gap-1.5 rounded-xl border border-maize/40 bg-mblue px-3 py-2 text-2xl text-maize">
                  <Target className="size-5" strokeWidth={2.6} />
                  {bullseyes}×
                </span>
              )}
            </div>
          </section>

          <SubmitScore gameId={gameId} />

          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={onPlayAgain} className="btn-game py-4 text-2xl">
              <RotateCcw className="size-5" strokeWidth={2.8} />
              Play again
            </button>
            <Link href="/leaderboard" className="btn-game btn-game-blue py-4 text-2xl">
              <Trophy className="size-5" strokeWidth={2.6} />
              Leaderboard
            </Link>
          </div>

          {!wide && <div className="h-[48vh] min-h-72">{map}</div>}

          <ol className="flex flex-col gap-2.5">
            {results.map((r, i) => (
              <li key={i} className="sg-up" style={{ animationDelay: `${150 + i * 90}ms` }}>
                <button
                  type="button"
                  onClick={() => setFocus(focus === i ? null : i)}
                  aria-pressed={focus === i}
                  className={`panel flex w-full items-center gap-3 p-2.5 text-left transition hover:border-maize/60 ${focus === i ? "!border-maize" : ""}`}
                >
                  <span
                    className={`text-display grid size-11 shrink-0 place-items-center rounded-xl text-2xl ${r.bullseye ? "bg-maize text-mblue" : "bg-mblue text-maize"}`}
                  >
                    {i + 1}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={rounds[i]?.src}
                    alt=""
                    className="h-12 w-[4.5rem] shrink-0 rounded-lg border border-maize/20 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-display text-2xl text-maize tabular-nums">{fmt(r.score)}</span>
                      <span className="text-display flex items-center gap-1 text-lg text-maize-soft/70 tabular-nums">
                        {r.bullseye && <Target className="size-4 text-maize" strokeWidth={2.8} />}
                        {formatDistance(r.distance)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-mblue-deep">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-gold-deep via-gold to-maize"
                        style={{ width: `${(r.score / MAX_ROUND_SCORE) * 100}%` }}
                      />
                    </div>
                  </div>
                </button>
                <PhotoCredit reveal={r.reveal} className="px-2 pt-1.5" />
              </li>
            ))}
          </ol>
        </div>

        {wide && <div className="sticky top-4 h-[calc(100dvh-2rem)] max-h-[860px] min-h-[520px]">{map}</div>}
      </main>
    </div>
  );
}
