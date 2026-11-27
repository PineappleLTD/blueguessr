"use client";

import { Check, Eye, LogOut, Skull, X, Zap } from "lucide-react";
import { useState } from "react";
import { Avatar, colorOf } from "./bits";
import { HealthBar } from "./FightPanel";
import type { PlayerView, RoomView } from "./types";

export function MultiplierBadge({ multiplier, className = "" }: { multiplier: number; className?: string }) {
  const hot = multiplier > 1;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-lg px-1.5 font-display font-black italic leading-none ${
        hot ? "bg-[#ff4d5e] text-white shadow-[0_3px_0_#8f1022]" : "bg-maize/15 text-maize"
      } ${className}`}
    >
      {hot && <Zap className="size-[0.8em] fill-current" />}x{multiplier}
    </span>
  );
}

function Timer({ msLeft, rushed, intro, seconds }: { msLeft: number; rushed: boolean; intro: boolean; seconds: number }) {
  const s = Math.ceil(msLeft / 1000);
  const urgent = !intro && (rushed || s <= 10);
  return (
    <div className="flex flex-col items-end">
      <div
        className={`flex items-center gap-1.5 rounded-2xl px-3 py-1 font-display font-black italic tabular-nums ${
          urgent ? "bg-[#ff4d5e] text-white shadow-[0_4px_0_#8f1022]" : "bg-mblue text-maize shadow-[0_4px_0_var(--mblue-deep)]"
        }`}
      >
        {rushed && !intro && <Zap className="size-5 fill-current" aria-label="Rush" />}
        <span className={`text-4xl leading-none lg:text-5xl ${urgent && s > 0 ? "vs-pulse-red" : ""}`}>{intro ? seconds : s}</span>
      </div>
    </div>
  );
}

function FighterChip({ p, guessed, showGuess, maxHp }: { p: PlayerView; guessed: boolean; showGuess: boolean; maxHp: number }) {
  const out = !!p.out;
  return (
    <li className={`relative flex min-w-0 items-center gap-2 ${out ? "opacity-45" : ""}`} title={p.name}>
      <span className="relative">
        <Avatar name={p.name} color={p.color} size={30} dim={out || !p.online} />
        {showGuess && guessed && (
          <span className="animate-pop absolute -right-1.5 -bottom-1 grid size-[18px] place-items-center rounded-full bg-[#5ee07a] text-night ring-2 ring-night">
            <Check className="size-3" strokeWidth={4} />
          </span>
        )}
        {out && (
          <span className="absolute -right-1.5 -bottom-1 grid size-[18px] place-items-center rounded-full bg-night text-[#ff4d5e] ring-2 ring-night">
            {p.out === "left" ? <X className="size-3" strokeWidth={4} /> : <Skull className="size-3" />}
          </span>
        )}
      </span>
      <span className="hidden w-[clamp(4.5rem,8vw,7.5rem)] min-w-0 lg:block">
        <span className={`block truncate font-display text-base leading-tight font-extrabold italic uppercase ${p.me ? "text-maize" : ""}`}>
          {p.name}
        </span>
        <HealthBar before={p.hp} after={p.hp} max={maxHp} hit={false} color={colorOf(p.color)} size="sm" />
      </span>
      <span className="absolute -bottom-1.5 left-0 w-[30px] lg:hidden">
        <HealthBar before={p.hp} after={p.hp} max={maxHp} hit={false} color={colorOf(p.color)} size="sm" />
      </span>
    </li>
  );
}

/** Top bar during rounds and reveals: round + multiplier, everyone's health, the clock, leave. */
export default function Hud({
  view,
  msLeft,
  intro,
  onLeave,
}: {
  view: RoomView;
  msLeft: number;
  intro: boolean;
  onLeave: () => void;
}) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const round = view.phase === "round";
  const me = view.players.find((p) => p.me);
  const watching = !me || !!me.out;
  const fraction = round && !intro ? Math.max(0, Math.min(1, msLeft / (view.roundSeconds * 1000))) : round ? 1 : 0;

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-night via-night/85 to-night/0 pb-5">
      <div className="pointer-events-auto flex items-center gap-2 px-2.5 pt-2 lg:gap-4 lg:px-5 lg:pt-3">
        <div className="flex shrink-0 flex-col items-start leading-none">
          <span className="font-display text-sm font-extrabold italic uppercase text-maize/70 lg:text-base">Round</span>
          <span className="flex items-center gap-1.5">
            <span className="font-display text-3xl font-black italic text-maize lg:text-4xl">{view.round}</span>
            <MultiplierBadge multiplier={view.multiplier} className="py-1 text-base lg:text-lg" />
          </span>
        </div>

        <ul className="flex min-w-0 flex-1 items-center justify-center gap-2.5 pb-1 lg:gap-5">
          {view.players.map((p) => (
            <FighterChip key={p.pid} p={p} guessed={!!view.guessed[p.pid]} showGuess={round} maxHp={view.maxHp} />
          ))}
        </ul>

        {round && <Timer seconds={view.roundSeconds} msLeft={msLeft} rushed={view.rushed} intro={intro} />}
        {watching && (
          <span className="hidden items-center gap-1 rounded-full bg-mblue px-2.5 py-1 font-display text-sm font-extrabold italic uppercase text-maize/80 sm:inline-flex">
            {me?.out === "ko" ? <Skull className="size-4" /> : <Eye className="size-4" />}
            {me?.out === "ko" ? "KO" : "Watching"}
          </span>
        )}
        {confirmLeave ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={onLeave}
              className="rounded-full bg-[#ff4d5e] px-3 py-1.5 font-display text-base font-extrabold italic uppercase text-white"
            >
              Leave
            </button>
            <button
              type="button"
              aria-label="Stay"
              onClick={() => setConfirmLeave(false)}
              className="grid size-9 place-items-center rounded-full bg-mblue text-maize"
            >
              <X className="size-4" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            aria-label="Leave game"
            onClick={() => setConfirmLeave(true)}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-mblue/80 text-foreground/60 transition hover:text-maize"
          >
            <LogOut className="size-4" />
          </button>
        )}
      </div>
      {round && (
        <div className="pointer-events-none mx-2.5 mt-2 h-1.5 overflow-hidden rounded-full bg-mblue/70 lg:mx-5">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ease-linear ${view.rushed ? "bg-[#ff4d5e]" : "bg-maize"}`}
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
      )}
    </header>
  );
}
