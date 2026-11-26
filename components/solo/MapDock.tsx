"use client";

import { Check, ChevronDown, LoaderCircle, Map as MapIcon, MapPin, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import GuessMap from "@/components/game/GuessMap";
import type { LngLat } from "@/lib/types";
import { useElapsed, useReducedMotion } from "./hooks";

/** Height of the reveal panel on phones; the map gets the rest of the screen. */
export const PHONE_PANEL_DVH = 46;
/** Strip under the desktop reveal map that holds the result panel (keeps pins out from under it). */
export const DESKTOP_PANEL_PX = 240;

const EASE = "cubic-bezier(0.2, 0.85, 0.25, 1)";
const noFocus = (e: React.MouseEvent) => e.preventDefault();

/**
 * The one map of a solo game. It morphs between three shapes and never remounts, so tiles,
 * zoom and the pin survive: a mini map docked bottom-right that grows on hover (desktop) or a
 * bottom sheet (phone) while guessing, then the big reveal map with the answer line.
 */
export default function MapDock({
  phase,
  phone,
  round,
  guess,
  onGuess,
  answer,
  sending,
  onSubmit,
  sheetOpen,
  onSheet,
}: {
  phase: "round" | "reveal";
  phone: boolean;
  round: number;
  guess: LngLat | null;
  onGuess: (p: LngLat) => void;
  answer: LngLat | null;
  sending: boolean;
  onSubmit: () => void;
  sheetOpen: boolean;
  onSheet: (open: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const [hover, setHover] = useState(false);
  const [locked, setLocked] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dockRef = useRef<HTMLDivElement>(null);

  // MapLibre shows its compact credits unfolded until the first drag, which covers half the mini
  // map. Fold them to the (i) button from the start, exactly as a drag would.
  useEffect(() => {
    const root = dockRef.current;
    if (!root) return;
    const fold = () => {
      const el = root.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show");
      el?.classList.remove("maplibregl-compact-show");
      return !!el;
    };
    if (fold()) return;
    const mo = new MutationObserver(() => {
      if (fold()) mo.disconnect();
    });
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    const t = setTimeout(() => mo.disconnect(), 20000);
    return () => {
      mo.disconnect();
      clearTimeout(t);
    };
  }, []);
  const reveal = phase === "reveal";
  // Let the map finish growing before the answer zooms in, so the fit uses the final size.
  const grown = useElapsed(reveal ? `reveal-${round}` : null, reduced ? 0 : 520);

  const big = !reveal && (hover || locked);
  let style: CSSProperties;
  if (phone) {
    style = reveal
      ? { left: 0, right: 0, bottom: `${PHONE_PANEL_DVH}dvh`, height: `${100 - PHONE_PANEL_DVH}dvh`, transform: "translateY(0)" }
      : {
          left: 0,
          right: 0,
          bottom: 0,
          height: "68dvh",
          transform: sheetOpen ? "translateY(0)" : "translateY(calc(100% + 40px))",
        };
  } else {
    style = reveal
      ? { right: 0, bottom: DESKTOP_PANEL_PX, width: "100vw", height: `calc(100dvh - ${DESKTOP_PANEL_PX}px)` }
      : big
        ? { right: 20, bottom: 20, width: "min(660px, calc(100vw - 40px))", height: "min(540px, calc(100dvh - 120px))" }
        : { right: 20, bottom: 20, width: 340, height: 312 };
  }
  style.transition = reduced
    ? "none"
    : `width 300ms ${EASE}, height 340ms ${EASE}, right 340ms ${EASE}, bottom 340ms ${EASE}, transform 340ms ${EASE}`;

  const hasPin = !!guess;
  const guessButton = (
    <button
      type="button"
      onMouseDown={noFocus}
      onClick={onSubmit}
      disabled={!hasPin || sending}
      className={`btn-game w-full shrink-0 ${phone ? "py-4 text-2xl" : "py-3.5 text-2xl"}`}
    >
      {sending ? (
        <LoaderCircle className="size-6 animate-spin" strokeWidth={3} />
      ) : hasPin ? (
        <>
          Guess
          {!phone && (
            <kbd className="rounded-md border border-mblue/30 bg-mblue/10 px-1.5 py-0.5 font-sans text-[11px] font-bold not-italic tracking-normal">
              Space
            </kbd>
          )}
        </>
      ) : (
        <>
          <MapPin className="size-5" strokeWidth={2.6} />
          Place a pin
        </>
      )}
    </button>
  );

  return (
    <>
      <div
        ref={dockRef}
        className={`fixed z-30 flex flex-col ${phone && !reveal ? "rounded-t-[1.75rem] border-t-2 border-maize/50 bg-night/95 shadow-[0_-20px_60px_rgba(0,0,0,.55)] backdrop-blur-md" : ""} ${!phone && !reveal ? "gap-2.5" : ""}`}
        style={style}
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse" || reveal) return;
          clearTimeout(leaveTimer.current);
          setHover(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse") return;
          clearTimeout(leaveTimer.current);
          leaveTimer.current = setTimeout(() => setHover(false), 380);
        }}
        inert={phone && !reveal && !sheetOpen}
      >
        {phone && !reveal && (
          <div className="flex shrink-0 items-center justify-between px-4 pt-2.5 pb-2">
            <span className="w-10" />
            <span className="h-1.5 w-12 rounded-full bg-foreground/25" />
            <button
              type="button"
              aria-label="Close map"
              onClick={() => onSheet(false)}
              className="grid size-10 place-items-center rounded-full bg-mblue text-maize active:scale-95"
            >
              <ChevronDown className="size-6" strokeWidth={2.6} />
            </button>
          </div>
        )}

        <div
          className={`relative min-h-0 flex-1 overflow-hidden bg-mblue-deep ${
            reveal ? "" : phone ? "mx-3 rounded-2xl border border-maize/25" : `rounded-2xl border-2 shadow-[0_18px_50px_rgba(0,0,0,.55)] transition-colors ${big ? "border-maize" : "border-maize/40"}`
          }`}
        >
          <GuessMap
            guess={guess}
            onGuess={reveal ? undefined : onGuess}
            answer={reveal && grown ? answer : null}
            resetKey={round}
          />
          {!phone && !reveal && (
            <button
              type="button"
              onMouseDown={noFocus}
              onClick={() => setLocked((v) => !v)}
              aria-label={locked ? "Shrink map" : "Keep map big"}
              aria-pressed={locked}
              className="absolute top-2 left-2 grid size-9 place-items-center rounded-xl border border-maize/30 bg-night/80 text-maize backdrop-blur transition hover:bg-mblue active:scale-95"
            >
              {locked ? <Minimize2 className="size-4.5" /> : <Maximize2 className="size-4.5" />}
            </button>
          )}
        </div>

        {!reveal && (
          <div className={phone ? "shrink-0 px-3 pt-3 pb-[calc(0.85rem+env(safe-area-inset-bottom))]" : "shrink-0"}>
            {guessButton}
          </div>
        )}
      </div>

      {phone && !reveal && !sheetOpen && (
        <button
          type="button"
          onClick={() => onSheet(true)}
          className="btn-game fixed right-4 z-30 rounded-full px-6 py-4 text-2xl"
          style={{ bottom: "calc(1.1rem + env(safe-area-inset-bottom))" }}
        >
          <span className={hasPin ? "" : "sg-nudge"}>
            <MapIcon className="size-6" strokeWidth={2.6} />
          </span>
          {hasPin ? "Guess" : "Map"}
          {hasPin && (
            <span className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full border-2 border-night bg-mblue text-maize">
              <Check className="size-3.5" strokeWidth={4} />
            </span>
          )}
        </button>
      )}
    </>
  );
}
