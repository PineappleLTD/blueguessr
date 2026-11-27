"use client";

import { Check, ChevronsRight, Eye, Loader2, MapPin, Skull, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import GuessMap, { GOLD, MAIZE, type MapPin as Pin } from "@/components/game/GuessMap";
import PhotoCredit from "@/components/game/PhotoCredit";
import PhotoViewer from "@/components/game/PhotoViewer";
import type { LngLat } from "@/lib/types";
import { colorOf, Dots } from "./bits";
import Confetti from "./Confetti";
import FightPanel from "./FightPanel";
import Hud, { MultiplierBadge } from "./Hud";
import { useNow, type RoomSync } from "./hooks";
import type { RoomView } from "./types";
import VersusStyles from "./VersusStyles";

/** Keeps returning the same object while `key` is unchanged (polls hand us fresh copies every second). */
function useStable<T>(value: T, key: string): T {
  const [held, setHeld] = useState({ key, value });
  if (held.key !== key) {
    setHeld({ key, value });
    return value;
  }
  return held.value;
}

const posKey = (p: LngLat | null | undefined) => (p ? `${p.lat.toFixed(7)},${p.lng.toFixed(7)}` : "");

export default function GameStage({
  view,
  offset,
  act,
  poke,
  onLeave,
}: {
  view: RoomView;
  offset: number;
  act: RoomSync["act"];
  poke: () => void;
  onLeave: () => void;
}) {
  const now = useNow();
  const serverNow = now + offset;
  const reveal = view.phase === "reveal" ? view.reveal : null;
  const revealing = !!reveal;
  const roundKey = `${view.game}-${view.round}`;
  const me = view.players.find((p) => p.me) ?? null;
  const myColor = colorOf(me?.color ?? 0);
  const fighting = !!me && !me.out;
  const intro = view.phase === "round" && view.startsAt !== null && serverNow < view.startsAt;
  const msLeft = view.phase === "round" && view.deadline !== null ? Math.max(0, view.deadline - serverNow) : 0;
  const timeUp = view.phase === "round" && !intro && msLeft <= 0;

  // ---- my pin ----
  const [pin, setPin] = useState<{ key: string; pos: LngLat } | null>(null);
  const [sent, setSent] = useState<{ key: string; pos: LngLat } | null>(null);
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState<{ key: string; text: string } | null>(null);
  const myPin = pin?.key === roundKey ? pin.pos : null;
  const lockedNow = view.myGuess ?? (sent?.key === roundKey ? sent.pos : null);
  const locked = useStable(lockedNow, `${roundKey}:${posKey(lockedNow)}`);
  const canPlace = view.phase === "round" && fighting && !locked && !intro && !timeUp;

  const place = useCallback((p: LngLat) => setPin({ key: roundKey, pos: p }), [roundKey]);

  const submit = useCallback(async () => {
    if (!myPin || !canPlace || sending) return;
    setSending(true);
    const r = await act("guess", { round: view.round, game: view.game, lat: myPin.lat, lng: myPin.lng });
    setSending(false);
    if (r.ok || r.error === "already_guessed") setSent({ key: roundKey, pos: myPin });
    else setFlash({ key: roundKey, text: r.error === "too_late" ? "Too late" : "Try again" });
  }, [myPin, canPlace, sending, act, view.round, view.game, roundKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit]);

  // ---- nudge the server the moment a clock runs out (polling would get there within a second) ----
  useEffect(() => {
    if (!timeUp) return;
    const t = setTimeout(poke, 1350);
    return () => clearTimeout(t);
  }, [timeUp, poke]);
  const revealOver = !!reveal && serverNow >= reveal.endsAt;
  useEffect(() => {
    if (revealOver) poke();
  }, [revealOver, poke]);

  // ---- reveal: everyone's pins and the answer, once the map has taken its reveal size ----
  const [answerFor, setAnswerFor] = useState<string | null>(null);
  useEffect(() => {
    if (!revealing) return;
    const t = setTimeout(() => setAnswerFor(roundKey), 180);
    return () => clearTimeout(t);
  }, [revealing, roundKey]);
  const answerNow = reveal && answerFor === roundKey ? { lat: reveal.answer.lat, lng: reveal.answer.lng } : null;
  const answer = useStable(answerNow, `${roundKey}:${posKey(answerNow)}`);
  const pinsNow: Pin[] =
    reveal && answer
      ? reveal.guesses.map((g) => {
          const p = view.players.find((x) => x.pid === g.pid);
          return { id: g.pid, pos: { lat: g.lat, lng: g.lng }, color: colorOf(p?.color ?? 0), label: p?.me ? "You" : p?.name };
        })
      : [];
  const pins = useStable(pinsNow, `${roundKey}:${answer ? "a" : ""}:${pinsNow.map((p) => p.id + posKey(p.pos)).join("|")}`);

  // The reveal plays its animation only if we see it start (not when reloading mid-reveal).
  // Decided once per round, the first time we render its reveal.
  const [freshFor, setFreshFor] = useState<{ key: string; fresh: boolean } | null>(null);
  const freshNow = !!reveal && serverNow - reveal.startedAt < 2500;
  if (reveal && freshFor?.key !== roundKey) setFreshFor({ key: roundKey, fresh: freshNow });
  const fresh = !!reveal && (freshFor?.key === roundKey ? freshFor.fresh : freshNow);
  const myReveal = reveal?.guesses.find((g) => g.pid === me?.pid);
  const guessedCount = Object.values(view.guessed).filter(Boolean).length;
  const guessers = Object.keys(view.guessed).length;
  const myFlash = flash?.key === roundKey ? flash.text : null;

  // Map box: small corner map (desktop) / bottom half (phone) while guessing; big while revealing.
  const mapBox = revealing
    ? "inset-x-0 top-[62px] h-[36%] lg:top-[88px] lg:left-5 lg:right-[476px] lg:bottom-5 lg:h-auto lg:rounded-2xl"
    : "inset-x-0 bottom-0 top-[50%] lg:top-auto lg:left-auto lg:right-5 lg:bottom-5 lg:h-[300px] lg:w-[430px] lg:rounded-2xl lg:hover:h-[480px] lg:hover:w-[680px]";

  return (
    <div className="fixed inset-0 overflow-hidden bg-night text-foreground">
      <VersusStyles />

      {/* Photo */}
      <div
        className={`absolute transition-opacity duration-300 ${
          revealing
            ? "pointer-events-none inset-0 opacity-0"
            : "inset-x-0 top-[62px] bottom-[50%] opacity-100 lg:inset-x-5 lg:top-[92px] lg:bottom-5 lg:overflow-hidden lg:rounded-2xl"
        }`}
      >
        {view.photo && (
          <div className={`h-full w-full transition-[filter,transform] duration-500 ${intro ? "scale-105 blur-2xl" : ""}`}>
            <PhotoViewer photo={view.photo} controlsClassName="right-3 bottom-3 lg:right-auto lg:left-3" />
          </div>
        )}
      </div>

      {/* Map: one MapLibre instance for the whole game */}
      <div
        className={`absolute z-10 overflow-hidden border-maize/30 bg-mblue-deep shadow-[0_20px_50px_rgb(0_0_0/0.5)] transition-[width,height] duration-300 lg:border-2 ${mapBox}`}
      >
        <GuessMap
          guess={revealing ? null : (locked ?? myPin)}
          onGuess={canPlace ? place : undefined}
          answer={answer}
          pins={pins}
          guessColor={myColor}
          resetKey={roundKey}
        />
        {!revealing && (
          <div className="absolute inset-x-3 bottom-[calc(max(0.5rem,env(safe-area-inset-bottom))+1.6rem)] flex justify-center">
            <GuessButton
              fighting={fighting}
              ko={me?.out === "ko"}
              intro={intro}
              timeUp={timeUp}
              locked={!!locked}
              hasPin={!!myPin}
              sending={sending}
              flash={myFlash}
              count={`${guessedCount}/${guessers}`}
              onGuess={submit}
            />
          </div>
        )}
      </div>

      {/* Reveal: the fight */}
      {reveal && (
        <aside className="absolute inset-x-0 top-[calc(62px+36%)] bottom-0 z-20 flex flex-col overflow-y-auto overscroll-contain px-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:top-[88px] lg:right-5 lg:bottom-5 lg:left-auto lg:w-[440px] lg:rounded-2xl lg:border lg:border-maize/20 lg:bg-mblue-deep/80 lg:p-4 lg:backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-display text-3xl text-maize">
              {reveal.final ? "Final round" : `Round ${reveal.round}`}
            </h2>
            <MultiplierBadge multiplier={reveal.multiplier} className="py-1 text-xl" />
          </div>
          <FightPanel
            key={roundKey}
            players={view.players}
            reveal={reveal}
            maxHp={view.maxHp}
            animate={fresh}
            myPid={me?.pid ?? null}
          />
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-night/60 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={reveal.photo.src} alt="" className="h-16 w-24 shrink-0 rounded-xl object-cover" />
            <PhotoCredit reveal={reveal.answer} />
          </div>
          <div className="mt-auto pt-4">
            <NextBar
              host={!!view.me?.host}
              final={reveal.final}
              secondsLeft={Math.max(0, Math.ceil((reveal.endsAt - serverNow) / 1000))}
              onNext={() => void act("next")}
            />
          </div>
        </aside>
      )}

      <Hud view={view} msLeft={msLeft} intro={intro} onLeave={onLeave} />

      {/* Round intro: "Round 3 / x1.5" and a 3-2-1 */}
      {intro && view.startsAt !== null && (
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-[50%] z-20 flex flex-col items-center justify-center lg:bottom-0">
          <p
            key={`r-${roundKey}`}
            className="vs-slam text-display text-[clamp(4rem,16vw,9rem)] text-maize-gradient"
            style={{ filter: "drop-shadow(0 6px 0 var(--gold-deep)) drop-shadow(0 16px 30px rgb(0 0 0 / 0.6))" }}
          >
            Round {view.round}
          </p>
          <span key={`m-${roundKey}`} className="vs-slam mt-2" style={{ animationDelay: "250ms" }}>
            <MultiplierBadge multiplier={view.multiplier} className="px-3 py-2 text-4xl lg:text-5xl" />
          </span>
          <span
            key={`c-${Math.ceil((view.startsAt - serverNow) / 1000)}`}
            className="vs-tick mt-4 font-display text-6xl font-black italic text-white/90"
          >
            {Math.max(1, Math.ceil((view.startsAt - serverNow) / 1000))}
          </span>
        </div>
      )}

      {/* Time's up, waiting on the server */}
      {timeUp && (
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-[50%] z-20 grid place-items-center lg:bottom-0">
          <p className="vs-slam text-display text-[clamp(4.5rem,18vw,10rem)] text-[#ff4d5e]" style={{ filter: "drop-shadow(0 6px 0 #5c0611)" }}>
            Time
          </p>
        </div>
      )}

      {/* A bullseye deserves confetti */}
      {reveal && fresh && myReveal?.bullseye && (
        <Confetti
          className="pointer-events-none fixed inset-0 z-40 h-full w-full"
          colors={[MAIZE, GOLD, myColor, "#ffffff"]}
          burstKey={roundKey}
          origin={{ x: 0.5, y: 0.45 }}
          count={110}
          durationMs={2800}
        />
      )}
    </div>
  );
}

function GuessButton({
  fighting,
  ko,
  intro,
  timeUp,
  locked,
  hasPin,
  sending,
  flash,
  count,
  onGuess,
}: {
  fighting: boolean;
  ko: boolean;
  intro: boolean;
  timeUp: boolean;
  locked: boolean;
  hasPin: boolean;
  sending: boolean;
  flash: string | null;
  count: string;
  onGuess: () => void;
}) {
  const pill =
    "flex items-center gap-2 rounded-2xl bg-night/85 px-5 py-3 font-display text-xl font-extrabold italic uppercase backdrop-blur";
  if (!fighting) {
    return (
      <span className={`${pill} text-maize/80`}>
        {ko ? <Skull className="size-5" /> : <Eye className="size-5" />}
        {ko ? "Knocked out" : "Watching"}
      </span>
    );
  }
  if (locked) {
    return (
      <span className={`${pill} text-[#5ee07a]`}>
        <Check className="size-5" strokeWidth={3} />
        Locked in
        <span className="ml-1 text-foreground/60 tabular-nums">{count}</span>
      </span>
    );
  }
  if (flash) return <span className={`${pill} text-[#ff4d5e]`}>{flash}</span>;
  if (timeUp) return <span className={`${pill} text-[#ff4d5e]`}>Time</span>;
  return (
    <button
      type="button"
      onClick={onGuess}
      disabled={!hasPin || intro || sending}
      className="btn-game w-full max-w-sm py-4 text-2xl shadow-[0_6px_0_var(--gold-deep),0_14px_30px_rgb(0_0_0/0.5)]"
    >
      {sending ? <Loader2 className="size-6 animate-spin" /> : <MapPin className="size-6" />}
      {hasPin ? "Guess" : intro ? "Get ready" : "Drop a pin"}
    </button>
  );
}

function NextBar({ host, final, secondsLeft, onNext }: { host: boolean; final: boolean; secondsLeft: number; onNext: () => void }) {
  if (host) {
    return (
      <button type="button" onClick={onNext} className="btn-game w-full py-4 text-2xl">
        {final ? <Trophy className="size-6" /> : <ChevronsRight className="size-6" />}
        {final ? "Results" : "Next round"}
        <span className="ml-1 rounded-lg bg-mblue/20 px-2 tabular-nums">{secondsLeft}</span>
      </button>
    );
  }
  return (
    <p className="flex items-center justify-center gap-2 rounded-2xl bg-night/70 py-3.5 font-display text-xl font-extrabold italic uppercase text-maize/80">
      {final ? "Results" : "Next round"} <span className="tabular-nums text-maize">{secondsLeft}</span>
      <Dots />
    </p>
  );
}
