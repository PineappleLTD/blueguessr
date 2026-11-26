"use client";

import { Crown, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDistance } from "@/lib/geo";
import { Avatar, colorOf, fmt, Tag } from "./bits";
import type { PlayerView, RevealView } from "./types";

/** Animates a number from `from` to `to` once `run` turns true (jumps there when not animating). */
function useCountTo(from: number, to: number, run: boolean, animate: boolean, ms = 650): number {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (!run || !animate || from === to) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setValue(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, animate, from, to, ms]);
  if (!run) return from;
  if (!animate || from === to) return to;
  return value;
}

/** Chunky HP bar: the fill drops at once, a red ghost of the lost health drains after it. */
export function HealthBar({
  before,
  after,
  max,
  hit,
  color,
  size = "lg",
}: {
  before: number;
  after: number;
  max: number;
  hit: boolean;
  color: string;
  size?: "lg" | "sm";
}) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const now = hit ? after : before;
  const low = now / max <= 0.25 && now > 0;
  return (
    <div
      className={`relative overflow-hidden rounded-full bg-night ring-2 ring-black/40 ${size === "lg" ? "h-5" : "h-2"}`}
      style={{ boxShadow: "inset 0 2px 4px rgb(0 0 0 / 0.6)" }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-[#ff4d5e]"
        style={{ width: pct(now), transition: hit ? "width 800ms cubic-bezier(.6,0,.4,1) 500ms" : "none" }}
      />
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${low ? "vs-low" : ""}`}
        style={{
          width: pct(now),
          transition: "width 160ms ease-out",
          background: low
            ? "linear-gradient(180deg, #ffb199, #ff6b4a 60%, #d9412b)"
            : `linear-gradient(180deg, color-mix(in oklch, ${color} 55%, white), ${color} 55%, color-mix(in oklch, ${color} 75%, black))`,
        }}
      />
      {size === "lg" && (
        <div className="pointer-events-none absolute inset-x-2 top-[3px] h-[5px] rounded-full bg-white/30" aria-hidden />
      )}
    </div>
  );
}

function FighterRow({
  p,
  reveal,
  maxHp,
  stage,
  best,
  animate,
}: {
  p: PlayerView;
  reveal: RevealView;
  maxHp: number;
  /** 0 entering, 1 scores, 2 damage, 3 knockouts */
  stage: number;
  best: boolean;
  animate: boolean;
}) {
  const inRound = p.pid in reveal.scores;
  const leftNow = reveal.left.includes(p.pid);
  const before = reveal.hpBefore[p.pid] ?? p.hp;
  const after = reveal.hpAfter[p.pid] ?? p.hp;
  const dmg = reveal.damage[p.pid] ?? 0;
  const score = reveal.scores[p.pid] ?? 0;
  const guess = reveal.guesses.find((g) => g.pid === p.pid);
  const ko = reveal.ko.includes(p.pid);
  const color = colorOf(p.color);
  const hit = stage >= 2;
  const shownScore = useCountTo(0, score, stage >= 1, animate);
  const shownHp = useCountTo(before, after, hit, animate);

  if (!inRound) {
    // Already out before this round (or walked out now).
    return (
      <li className="flex items-center gap-3 rounded-2xl px-3 py-2 opacity-50">
        <Avatar name={p.name} color={p.color} size={30} dim />
        <span className="min-w-0 flex-1 truncate font-display text-lg font-extrabold italic uppercase">{p.name}</span>
        <Tag className="bg-foreground/10 text-foreground/70">{leftNow || p.out === "left" ? "Left" : `KO R${p.outRound}`}</Tag>
      </li>
    );
  }

  return (
    <li
      className={`relative rounded-2xl border-2 bg-mblue/55 px-3 pt-2.5 pb-3 ${hit && dmg > 0 ? "vs-shake" : ""}`}
      style={{ borderColor: p.me ? color : "transparent" }}
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={p.name} color={p.color} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-display text-xl leading-tight font-extrabold italic uppercase">{p.name}</span>
            {best && score > 0 && <Crown className="size-4 shrink-0 fill-maize text-gold-deep" aria-label="Best this round" />}
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-foreground/60">
            {guess ? (
              <>
                <span className="tabular-nums">{formatDistance(guess.distance)}</span>
                {guess.bullseye && (
                  <Tag className="bg-maize px-1.5 text-mblue">
                    <Target className="size-3" /> Bullseye
                  </Tag>
                )}
              </>
            ) : (
              <span className="font-display text-sm font-bold italic uppercase text-destructive-foreground/80">No guess</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <span className="block font-display text-3xl leading-none font-black italic tabular-nums text-maize">{fmt(shownScore)}</span>
        </div>
      </div>
      <div className="relative mt-2">
        <HealthBar before={before} after={after} max={maxHp} hit={hit} color={color} />
        {hit && dmg > 0 && (
          <span
            className="vs-float-up pointer-events-none absolute top-0 left-1/2 z-10 font-display text-4xl font-black italic text-[#ff4d5e]"
            style={{ textShadow: "0 3px 0 #2a0008, 0 0 18px rgb(255 77 94 / 0.6)" }}
          >
            -{fmt(dmg)}
          </span>
        )}
        {stage >= 3 && ko && (
          <span
            className="vs-stamp pointer-events-none absolute top-1/2 left-1/2 z-20 rounded-lg border-4 border-[#ff4d5e] bg-night/85 px-3 font-display text-4xl leading-tight font-black italic text-[#ff4d5e]"
            style={{ boxShadow: "0 0 0 3px rgb(0 0 0 / 0.5)" }}
          >
            KO
          </span>
        )}
      </div>
      <div className="mt-1 flex justify-between font-display text-sm font-bold italic uppercase text-foreground/55 tabular-nums">
        <span>{fmt(shownHp)} HP</span>
        {dmg > 0 && <span className="text-[#ff8a95]">x{reveal.multiplier}</span>}
      </div>
    </li>
  );
}

/**
 * The health-bar fight after each round. Plays scores -> damage -> knockouts once, when it
 * mounts within a moment of the reveal starting (`animate`), otherwise shows the end state.
 */
export default function FightPanel({
  players,
  reveal,
  maxHp,
  animate,
  myPid,
}: {
  players: PlayerView[];
  reveal: RevealView;
  maxHp: number;
  animate: boolean;
  myPid: string | null;
}) {
  // Whether to play is decided when the panel mounts; later prop changes don't restart or cut it.
  const [animated] = useState(animate);
  const [stage, setStage] = useState(animated ? 0 : 3);
  const myDamage = myPid ? (reveal.damage[myPid] ?? 0) : 0;
  useEffect(() => {
    if (!animated) return;
    const timers = [
      setTimeout(() => setStage(1), 450),
      setTimeout(() => {
        setStage(2);
        if (myDamage > 0) navigator.vibrate?.(120);
      }, 1500),
      setTimeout(() => setStage(3), 2300),
    ];
    return () => timers.forEach(clearTimeout);
  }, [animated, myDamage]);

  const bestScore = Math.max(0, ...Object.values(reveal.scores));
  const rows = [...players].sort((a, b) => {
    const ia = a.pid in reveal.scores ? 0 : 1;
    const ib = b.pid in reveal.scores ? 0 : 1;
    return ia - ib || (reveal.scores[b.pid] ?? -1) - (reveal.scores[a.pid] ?? -1);
  });

  return (
    <ul className="space-y-2">
      {rows.map((p) => (
        <FighterRow
          key={p.pid}
          p={p}
          reveal={reveal}
          maxHp={maxHp}
          stage={stage}
          animate={animated}
          best={(reveal.scores[p.pid] ?? -1) === bestScore}
        />
      ))}
    </ul>
  );
}
