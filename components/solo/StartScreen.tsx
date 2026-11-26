"use client";

import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import MapOptions from "@/components/game/MapOptions";
import DotDunes from "./DotDunes";
import { prefersReducedMotion } from "./hooks";

const STEP_MS = 560;
const LABELS = ["3", "2", "1", "Go!"];

/**
 * Pre-game screen: a bouncing pin while the game loads, then a 3-2-1-GO pop.
 * Click or Space skips ahead once the first photo is ready.
 */
export default function StartScreen({ ready, onGo }: { ready: boolean; onGo: () => void }) {
  const [step, setStep] = useState(-1);

  useEffect(() => {
    if (!ready) return;
    if (prefersReducedMotion()) {
      const t = setTimeout(onGo, 0);
      return () => clearTimeout(t);
    }
    const timers = LABELS.map((_, i) => setTimeout(() => setStep(i), i * STEP_MS));
    timers.push(setTimeout(onGo, LABELS.length * STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, [ready, onGo]);

  const label = step >= 0 ? LABELS[step] : null;
  const go = step === LABELS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-night"
      onClick={() => ready && onGo()}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(60% 50% at 50% 42%, oklch(0.87 0.18 93 / 0.16), transparent 70%)" }}
      />
      <div className="absolute inset-x-0 bottom-0 h-[46%] opacity-80">
        <DotDunes rows={10} />
      </div>
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-[max(2rem,env(safe-area-inset-bottom))] left-1/2 z-10 -translate-x-1/2"
      >
        <MapOptions size="lg" align="center" />
      </div>

      <div className="relative grid size-[min(78vw,380px)] place-items-center">
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
    </div>
  );
}
