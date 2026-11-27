"use client";

import { Check, ChevronDown, LoaderCircle, Map as MapIcon, MapPin, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import GuessMap from "@/components/game/GuessMap";
import type { LngLat } from "@/lib/types";
import { useElapsed, useReducedMotion } from "./hooks";

/** Height of the reveal panel on phones; the map gets the rest of the screen. */
export const PHONE_PANEL_DVH = 46;
/** Strip under the desktop reveal map that holds the result panel (keeps pins out from under it). */
export const DESKTOP_PANEL_PX = 240;

// Desktop while guessing: just the Map/Guess button in the corner, and the map opens above it on hover.
const BUTTON_PX = 60;
const GAP_PX = 10;
const CLOSED_W_PX = 230;
const OPEN_W = "min(660px, calc(100vw - 40px))";
const OPEN_MAP_H = "min(470px, calc(100dvh - 190px))";

const EASE = "cubic-bezier(0.2, 0.85, 0.25, 1)";
const noFocus = (e: React.MouseEvent) => e.preventDefault();

/**
 * The one map of a solo game. It morphs between shapes and never remounts, so tiles, zoom and
 * the pin survive: while guessing, a button in the bottom-right corner that opens into the map
 * on hover (desktop) or a bottom sheet (phone); then the big reveal map with the answer line.
 * It mounts during the countdown, out of sight, so the tiles are ready when the round starts.
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
  waiting = false,
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
  /** Countdown still running: keep the map loaded but out of sight. */
  waiting?: boolean;
}) {
  const reduced = useReducedMotion();
  const [hover, setHover] = useState(false);
  const [locked, setLocked] = useState(false);
  // Every round starts with the small map in the corner, even if the last one was made big.
  const [dockRound, setDockRound] = useState(round);
  if (round !== dockRound) {
    setDockRound(round);
    setHover(false);
    setLocked(false);
  }
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

  // Where the mouse was when this round began. The browser reports a hover when the dock shrinks
  // back under a cursor that never moved, so the map only grows once the mouse really moves.
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const stillAt = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const track = (e: PointerEvent) => {
      lastPointer.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", track, { passive: true });
    return () => window.removeEventListener("pointermove", track);
  }, []);
  useLayoutEffect(() => {
    stillAt.current = lastPointer.current;
  }, [round]);
  const hoverIn = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse" || reveal) return;
    const s = stillAt.current;
    if (s && Math.abs(e.clientX - s.x) < 3 && Math.abs(e.clientY - s.y) < 3) return;
    stillAt.current = null;
    clearTimeout(leaveTimer.current);
    setHover(true);
  };
  // Let the map finish growing before the answer zooms in, so the fit uses the final size.
  const grown = useElapsed(reveal ? `reveal-${round}` : null, reduced ? 0 : 520);

  const big = !reveal && (hover || locked);
  const corner = !phone && !reveal;
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
      ? { right: 0, bottom: DESKTOP_PANEL_PX, width: "100vw", height: `calc(100dvh - ${DESKTOP_PANEL_PX}px)`, rowGap: 0 }
      : big
        ? { right: 20, bottom: 20, width: OPEN_W, height: `calc(${OPEN_MAP_H} + ${BUTTON_PX + GAP_PX}px)`, rowGap: GAP_PX }
        : { right: 20, bottom: 20, width: CLOSED_W_PX, height: BUTTON_PX, rowGap: 0 };
    style.transform = waiting ? "translateY(24px)" : "translateY(0)";
  }
  if (waiting) {
    style.opacity = 0;
    style.visibility = "hidden";
  }
  style.transition = reduced
    ? "none"
    : `width 300ms ${EASE}, height 340ms ${EASE}, right 340ms ${EASE}, bottom 340ms ${EASE}, row-gap 340ms ${EASE}, transform 340ms ${EASE}, opacity 260ms ease-out`;

  const hasPin = !!guess;
  // Closed on desktop with no pin yet: a "Map" button that opens it (for touch screens and keyboards).
  const opener = corner && !big && !hasPin;
  const guessButton = (
    <button
      type="button"
      onMouseDown={noFocus}
      onClick={opener ? () => setLocked(true) : onSubmit}
      disabled={!opener && (!hasPin || sending)}
      className={`btn-game w-full shrink-0 ${phone ? "py-4 text-2xl" : "h-15 py-0 text-2xl"}`}
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
      ) : opener ? (
        <>
          <MapIcon className="size-5" strokeWidth={2.6} />
          Map
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
        className={`fixed z-30 flex flex-col ${phone && !reveal ? "rounded-t-[1.75rem] border-t-2 border-maize/50 bg-night/95 shadow-[0_-20px_60px_rgba(0,0,0,.55)] backdrop-blur-md" : ""}`}
        style={style}
        onPointerEnter={hoverIn}
        onPointerMove={hoverIn}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse") return;
          clearTimeout(leaveTimer.current);
          leaveTimer.current = setTimeout(() => setHover(false), 380);
        }}
        inert={waiting || (phone && !reveal && !sheetOpen)}
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
            reveal
              ? ""
              : phone
                ? "mx-3 rounded-2xl border border-maize/25"
                : `rounded-2xl shadow-[0_18px_50px_rgba(0,0,0,.55)] transition-[border-color,border-width,opacity] duration-300 ${big ? "border-maize" : "border-maize/40"}`
          }`}
          style={corner ? { borderWidth: big ? 2 : 0, opacity: big ? 1 : 0 } : undefined}
          inert={corner && !big}
        >
          {/* In the corner the map keeps its open size and the box clips it, so opening and closing
              never resize MapLibre. */}
          <div
            className={corner ? "absolute right-0 bottom-0" : "absolute inset-0"}
            style={corner ? { width: `calc(${OPEN_W} - 4px)`, height: `calc(${OPEN_MAP_H} - 4px)` } : undefined}
          >
            <GuessMap
              guess={guess}
              onGuess={reveal ? undefined : onGuess}
              answer={reveal && grown ? answer : null}
              resetKey={round}
            />
          </div>
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

      {phone && !reveal && !sheetOpen && !waiting && (
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
