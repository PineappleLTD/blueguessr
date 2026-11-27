"use client";

import { CalendarDays, MapPin, Play, Timer, Trophy } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import MapOptions from "@/components/game/MapOptions";
import ParticleDunes from "@/components/landing/ParticleDunes";
import BackLink from "@/components/site/BackLink";
import { DAILY_ROUND_SECONDS, dailyDate, dailyLabel } from "@/lib/daily";
import { useMapSetting } from "@/lib/map-settings";
import { prefersReducedMotion } from "./hooks";

const STEP_MS = 1000;
const noSubscribe = () => () => {};
const LABELS = ["3", "2", "1", "Go!"];

/** Whether this daily can reach the leaderboard, from the map choices and today's earlier tries. */
function RankedChip({ played }: { played: boolean }) {
  const landmarks = useMapSetting("landmarks");
  const labels = useMapSetting("labels");
  const ranked = !played && !landmarks && !labels;
  const text = played ? "Played today: not ranked" : ranked ? "Ranked" : "Ranked: landmarks and map labels off";
  return (
    <p
      role="status"
      className={`text-display flex items-center gap-2 rounded-xl border px-3.5 py-2 text-lg ${
        ranked ? "border-maize bg-maize text-mblue shadow-[0_4px_0_var(--gold-deep)]" : "border-maize/25 bg-night/70 text-maize-soft/70"
      }`}
    >
      <Trophy className="size-4.5 shrink-0" strokeWidth={2.6} />
      {text}
    </p>
  );
}

function Chip({ icon: Icon, children }: { icon: typeof Timer; children: React.ReactNode }) {
  return (
    <span className="text-display flex items-center gap-1.5 rounded-xl border border-maize/30 bg-night/70 px-3 py-1.5 text-lg text-maize">
      <Icon className="size-4.5" strokeWidth={2.6} />
      {children}
    </span>
  );
}

/**
 * Before a game: pick the map helpers, then Start Game. After that the same screen shows a
 * bouncing pin while the game loads and a 3-2-1-GO once the first photo is ready (click or
 * Space skips ahead).
 */
export default function StartScreen({
  phase,
  daily,
  day,
  playedToday,
  ready,
  onStart,
  onGo,
}: {
  phase: "setup" | "countdown";
  daily: boolean;
  day: string | null;
  playedToday: boolean;
  ready: boolean;
  onStart: () => void;
  onGo: () => void;
}) {
  const [step, setStep] = useState(-1);
  // Today's date is only known in the browser (the page shell is built ahead of time).
  const today = useSyncExternalStore(noSubscribe, () => dailyDate(), () => null);
  const shownDay = day ?? today;
  const counting = phase === "countdown" && ready;

  useEffect(() => {
    if (!counting) return;
    if (prefersReducedMotion()) {
      const t = setTimeout(onGo, 0);
      return () => clearTimeout(t);
    }
    const timers = LABELS.map((_, i) => setTimeout(() => setStep(i), i * STEP_MS));
    timers.push(setTimeout(onGo, LABELS.length * STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, [counting, onGo]);

  const label = phase === "countdown" && step >= 0 ? LABELS[step] : null;
  const go = step === LABELS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 isolate flex items-center justify-center overflow-hidden bg-night"
      onClick={() => counting && onGo()}
    >
      <div className="lp-sky" aria-hidden />
      <ParticleDunes className="scene-dunes" />

      {phase === "setup" ? (
        <>
          <BackLink className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-4 z-20 sm:left-6" />
          <div className="sg-up relative z-10 flex w-full max-w-xl flex-col items-center gap-5 px-5 pb-[12svh] text-center">
            <h1
              className="text-display text-[clamp(4.2rem,17vw,7.5rem)] leading-none text-maize-gradient"
              style={{ filter: "drop-shadow(0 6px 0 var(--gold-deep)) drop-shadow(0 18px 30px rgb(0 0 0 / 0.55))" }}
            >
              {daily ? "Daily" : "Solo"}
            </h1>
            {daily && (
              <div className="flex gap-2">
                {shownDay && <Chip icon={CalendarDays}>{dailyLabel(shownDay)}</Chip>}
                <Chip icon={Timer}>{DAILY_ROUND_SECONDS}s</Chip>
              </div>
            )}
            <MapOptions size="lg" align="center" />
            {daily && <RankedChip played={playedToday} />}
            <button type="button" onClick={onStart} className="btn-game mt-2 px-10 py-5 text-3xl">
              <Play className="size-7 fill-current" strokeWidth={2.4} />
              Start Game
            </button>
          </div>
        </>
      ) : (
        <>
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(60% 50% at 50% 42%, oklch(0.87 0.18 93 / 0.16), transparent 70%)" }}
          />
          <div className="relative z-10 grid size-[min(78vw,380px)] place-items-center">
            {!label && (
              <div className="flex flex-col items-center gap-5" aria-label="Loading">
                <MapPin className="sg-dot size-20 fill-maize/90 text-gold-deep drop-shadow-[0_10px_20px_rgba(0,0,0,.5)]" strokeWidth={1.6} />
                <div className="flex gap-2">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="sg-dot size-3 rounded-full bg-maize" style={{ animationDelay: `${i * 140}ms` }} />
                  ))}
                </div>
              </div>
            )}
            {label && (
              <>
                <span key={`ring-${step}`} className="sg-ring absolute inset-[18%] rounded-full border-[6px] border-maize/70" />
                <span
                  key={step}
                  className={`${go ? "sg-go" : "sg-count"} text-display relative block leading-none text-maize-gradient drop-shadow-[0_12px_30px_rgba(0,0,0,.45)] ${go ? "text-[min(30vw,190px)]" : "text-[min(52vw,300px)]"}`}
                >
                  {label}
                </span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
