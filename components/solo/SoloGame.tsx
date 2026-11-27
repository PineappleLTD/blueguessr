"use client";

import "./solo.css";
import { Unplug } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import PhotoViewer from "@/components/game/PhotoViewer";
import type { RoundResult, Unranked } from "@/lib/game";
import { getMapSetting } from "@/lib/map-settings";
import type { LngLat, RoundPhoto } from "@/lib/types";
import { ApiFailure, safePlayer, soloApi } from "./api";
import Confetti, { type ConfettiHandle } from "./Confetti";
import ErrorScreen, { type ErrorKind } from "./ErrorScreen";
import { preloadImage, useIsPhone } from "./hooks";
import Hud, { RoundBanner } from "./Hud";
import DotDunes from "./DotDunes";
import MapDock, { DESKTOP_PANEL_PX } from "./MapDock";
import RevealPanel, { BullseyeBurst } from "./RevealPanel";
import StartScreen from "./StartScreen";
import Summary from "./Summary";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Status = "setup" | "loading" | "countdown" | "round" | "reveal" | "summary" | "error";

interface State {
  status: Status;
  /** Bumps every new game; used for keys and to drop stale responses. */
  run: number;
  gameId: string | null;
  rounds: RoundPhoto[];
  results: RoundResult[];
  index: number;
  guess: LngLat | null;
  sending: boolean;
  sendFailed: boolean;
  /** Phone map sheet open. */
  sheet: boolean;
  /** First photo loaded: the countdown may run. */
  ready: boolean;
  error: ErrorKind;
  /** Daily games: the day, and seconds per round. */
  day: string | null;
  roundSeconds: number | null;
  ranked: boolean;
  unranked: Unranked | null;
  /** Timed rounds: when this round's clock runs out (local time), and which round it is for. */
  endsAt: number | null;
  clockFor: number | null;
}

type Action =
  | { type: "setup" }
  | { type: "new" }
  | {
      type: "loaded";
      id: string;
      rounds: RoundPhoto[];
      day: string | null;
      roundSeconds: number | null;
      ranked: boolean;
      unranked: Unranked | null;
    }
  | { type: "clock"; round: number; endsAt: number }
  | { type: "ready" }
  | { type: "go" }
  | { type: "pin"; p: LngLat }
  | { type: "sheet"; open: boolean }
  | { type: "send" }
  | { type: "sent"; result: RoundResult }
  | { type: "send-failed" }
  | { type: "next" }
  | { type: "fail"; error: ErrorKind };

const INITIAL: State = {
  status: "setup",
  run: 0,
  gameId: null,
  rounds: [],
  results: [],
  index: 0,
  guess: null,
  sending: false,
  sendFailed: false,
  sheet: false,
  ready: false,
  error: "server",
  day: null,
  roundSeconds: null,
  ranked: false,
  unranked: null,
  endsAt: null,
  clockFor: null,
};

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "setup":
      return { ...INITIAL, run: s.run + 1 };
    case "new":
      return { ...INITIAL, run: s.run + 1, status: "loading" };
    case "loaded":
      return {
        ...s,
        gameId: a.id,
        rounds: a.rounds,
        results: [],
        index: 0,
        guess: null,
        status: "countdown",
        day: a.day,
        roundSeconds: a.roundSeconds,
        ranked: a.ranked,
        unranked: a.unranked,
      };
    case "clock":
      return a.round === s.index ? { ...s, endsAt: a.endsAt, clockFor: a.round } : s;
    case "ready":
      return { ...s, ready: true };
    case "go":
      return s.status === "countdown" ? { ...s, status: "round" } : s;
    case "pin":
      return s.status === "round" && !s.sending ? { ...s, guess: a.p, sendFailed: false } : s;
    case "sheet":
      return { ...s, sheet: a.open };
    case "send":
      return { ...s, sending: true, sendFailed: false };
    case "sent": {
      if (a.result.round !== s.index || s.status !== "round") return { ...s, sending: false };
      const results = [...s.results];
      results[a.result.round] = a.result;
      return { ...s, results, sending: false, sheet: false, status: "reveal" };
    }
    case "send-failed":
      return { ...s, sending: false, sendFailed: true };
    case "next":
      if (s.status !== "reveal") return s;
      if (s.index >= s.rounds.length - 1) return { ...s, status: "summary" };
      return { ...s, status: "round", index: s.index + 1, guess: null, sheet: false, endsAt: null };
    case "fail":
      return { ...s, status: "error", error: a.error, sending: false };
  }
}

function errorKind(e: unknown): ErrorKind {
  if (!(e instanceof ApiFailure)) return "server";
  if (e.code === "no-photos" || e.code === "rate-limited" || e.code === "network") return e.code;
  return "server";
}

/**
 * The solo game: pick the map helpers and start, countdown, five rounds of guess + reveal, then
 * the summary. `daily` plays the Daily BlueGuessr: today's five photos, 30 seconds a round.
 */
export default function SoloGame({ daily = false }: { daily?: boolean }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const phone = useIsPhone();
  const confetti = useRef<ConfettiHandle>(null);
  const stateRef = useRef(state);
  const runRef = useRef(0);
  const revealAt = useRef(0);

  useLayoutEffect(() => {
    stateRef.current = state;
  });

  const start = useCallback(async () => {
    const token = ++runRef.current;
    dispatch({ type: "new" });
    try {
      const game = await soloApi.newGame({
        playerId: safePlayer()?.id,
        daily,
        landmarks: getMapSetting("landmarks"),
        labels: getMapSetting("labels"),
      });
      if (token !== runRef.current) return;
      dispatch({ type: "loaded", ...game });
      await Promise.race([preloadImage(game.rounds[0].src, "high"), sleep(3500)]);
      if (token !== runRef.current) return;
      dispatch({ type: "ready" });
      if (game.rounds[1]) void preloadImage(game.rounds[1].src);
    } catch (e) {
      if (token === runRef.current) dispatch({ type: "fail", error: errorKind(e) });
    }
  }, [daily]);

  // Daily: whether this player already started today's (only the first try is ranked).
  const [dailyStatus, setDailyStatus] = useState<{ day: string; played: boolean } | null>(null);
  const atSetup = state.status === "setup";
  useEffect(() => {
    if (!daily || !atSetup) return;
    let alive = true;
    soloApi
      .daily(safePlayer()?.id)
      .then((d) => alive && setDailyStatus(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [daily, atSetup]);

  // Timed rounds: start the server's clock when a round begins (the server keeps the time).
  const clockRound = state.status === "round" && state.roundSeconds && state.clockFor !== state.index ? state.index : null;
  const clockGame = state.gameId;
  useEffect(() => {
    if (clockRound === null || !clockGame) return;
    const token = runRef.current;
    soloApi
      .startRound(clockGame, clockRound)
      .then((c) => {
        if (token === runRef.current) dispatch({ type: "clock", round: c.round, endsAt: Date.now() + (c.endsAt - c.serverNow) });
      })
      .catch(() => {
        if (token === runRef.current) dispatch({ type: "send-failed" });
      });
  }, [clockRound, clockGame]);

  /** Sends the pin. `timeUp`: the round's clock ran out, so send whatever there is (maybe nothing). */
  const sendGuess = useCallback(async (timeUp = false) => {
    const s = stateRef.current;
    if (s.status !== "round" || s.sending || !s.gameId) return;
    if (!s.guess && !timeUp) return;
    const { gameId, index, guess } = s;
    const token = runRef.current;
    dispatch({ type: "send" });
    try {
      // A guess right as the round opens can beat its clock to the server: start it first.
      if (s.roundSeconds && s.clockFor !== index) await soloApi.startRound(gameId, index).catch(() => {});
      let result: RoundResult;
      try {
        result = await soloApi.guess(gameId, index, guess);
      } catch (e) {
        if (!(e instanceof ApiFailure) || e.code !== "network") throw e;
        await sleep(800); // one retry; the server treats a repeat as a no-op
        result = await soloApi.guess(gameId, index, guess);
      }
      if (token === runRef.current) dispatch({ type: "sent", result });
    } catch (e) {
      if (token !== runRef.current) return;
      if (e instanceof ApiFailure && e.status === 404) dispatch({ type: "fail", error: "expired" });
      else if (e instanceof ApiFailure && e.code === "out-of-order") dispatch({ type: "fail", error: "server" });
      else dispatch({ type: "send-failed" });
    }
  }, []);

  // Timed rounds: when the clock runs out, the pin (or no pin) goes in by itself.
  const { endsAt } = state;
  useEffect(() => {
    if (state.status !== "round" || endsAt === null) return;
    const t = setTimeout(() => void sendGuess(true), Math.max(0, endsAt - Date.now()));
    return () => clearTimeout(t);
  }, [state.status, endsAt, sendGuess]);

  const onGuess = useCallback((p: LngLat) => dispatch({ type: "pin", p }), []);
  const onSheet = useCallback((open: boolean) => dispatch({ type: "sheet", open }), []);
  const go = useCallback(() => dispatch({ type: "go" }), []);
  const next = useCallback(() => dispatch({ type: "next" }), []);
  const playAgain = useCallback(() => dispatch({ type: "setup" }), []);
  const retry = useCallback(() => void start(), [start]);
  const begin = useCallback(() => void start(), [start]);
  const celebrate = useCallback((power: number) => {
    confetti.current?.burst({ x: 0.28, y: 0.4, power });
    setTimeout(() => confetti.current?.burst({ x: 0.72, y: 0.45, power: power * 0.8 }), 160);
  }, []);

  // Space / Enter: guess, next, skip the countdown. Buttons and fields keep their own keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== " " && e.key !== "Enter") || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, button, a, [contenteditable='true']")) return;
      const s = stateRef.current;
      if (s.status === "round" && s.guess && !s.sending) {
        e.preventDefault();
        void sendGuess();
      } else if (s.status === "reveal" && performance.now() - revealAt.current > 700) {
        e.preventDefault();
        dispatch({ type: "next" });
      } else if (s.status === "countdown" && s.ready) {
        e.preventDefault();
        dispatch({ type: "go" });
      } else if (s.status === "setup") {
        e.preventDefault();
        void start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sendGuess, start]);

  // Per-round side effects: preload the photo after this one, celebrate bullseyes, forget finished games.
  const { status, index, rounds, results, run } = state;
  useEffect(() => {
    if (status === "round" && rounds[index + 1]) void preloadImage(rounds[index + 1].src);
    if (status !== "reveal") return;
    revealAt.current = performance.now();
    if (!results[index]?.bullseye) return;
    const t = setTimeout(() => {
      confetti.current?.burst({ x: 0.5, y: phone ? 0.3 : 0.38, power: 1.3, spread: 1.4 });
      confetti.current?.burst({ x: 0.5, y: phone ? 0.6 : 0.85, power: 0.8 });
    }, 750);
    return () => clearTimeout(t);
  }, [status, index, rounds, results, phone, run]);

  // No pull-to-refresh or rubber-banding while playing on a phone.
  useEffect(() => {
    if (status === "summary" || status === "error") return;
    const html = document.documentElement;
    const prev = html.style.overscrollBehavior;
    html.style.overscrollBehavior = "none";
    return () => {
      html.style.overscrollBehavior = prev;
    };
  }, [status]);

  const photo = rounds[index];
  const result = results[index];
  // Stable object: the map refits whenever the answer prop changes identity.
  const answer = useMemo(() => (result ? { lat: result.reveal.lat, lng: result.reveal.lng } : null), [result]);

  if (status === "error") return <ErrorScreen kind={state.error} onRetry={retry} />;

  if (status === "summary" && state.gameId) {
    return (
      <>
        <Summary
          key={state.gameId}
          gameId={state.gameId}
          rounds={rounds}
          results={results}
          daily={!!state.day}
          ranked={state.ranked}
          unranked={state.unranked}
          onPlayAgain={playAgain}
          celebrate={celebrate}
        />
        <Confetti ref={confetti} />
      </>
    );
  }

  const playing = status === "round" || status === "reveal";
  const total = results.reduce((s, r) => s + (r?.score ?? 0), 0);

  return (
    <div className="fixed inset-0 overflow-hidden bg-night">
      {photo && (status === "countdown" || status === "round") && (
        <div
          className="sg-photo absolute inset-0"
          // Zoom buttons must not keep focus, or Space would press them instead of guessing.
          onMouseDownCapture={(e) => {
            if ((e.target as HTMLElement).closest("button")) e.preventDefault();
          }}
        >
          <PhotoViewer photo={photo} />
        </div>
      )}

      {playing && (
        <Hud
          index={index}
          count={rounds.length}
          results={results}
          total={total}
          endsAt={status === "round" ? state.endsAt : null}
          seconds={state.roundSeconds}
        />
      )}
      {status === "round" && <RoundBanner key={`banner-${run}-${index}`} n={index + 1} last={index === rounds.length - 1} />}

      {state.gameId && status !== "loading" && (
        <MapDock
          key={`map-${run}`}
          phase={status === "reveal" ? "reveal" : "round"}
          phone={phone}
          round={index}
          guess={status === "reveal" && result ? result.guess : state.guess}
          onGuess={onGuess}
          answer={answer}
          sending={state.sending}
          onSubmit={() => void sendGuess()}
          sheetOpen={state.sheet}
          onSheet={onSheet}
          waiting={status === "countdown"}
        />
      )}

      {status === "reveal" && !phone && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 opacity-60" style={{ height: DESKTOP_PANEL_PX }}>
          <DotDunes rows={6} speed={0.8} />
        </div>
      )}
      {status === "reveal" && result && photo && (
        <RevealPanel
          key={`reveal-${run}-${index}`}
          result={result}
          photo={photo}
          isLast={index === rounds.length - 1}
          phone={phone}
          onNext={next}
        />
      )}
      {status === "reveal" && result?.bullseye && <BullseyeBurst key={`bull-${run}-${index}`} phone={phone} />}

      {state.sendFailed && status === "round" && (
        <div className="sg-up fixed inset-x-0 top-24 z-50 flex justify-center px-4" role="alert">
          <span className="text-display flex items-center gap-2 rounded-full border border-maize/40 bg-mblue px-4 py-2 text-xl text-maize shadow-xl">
            <Unplug className="size-5" strokeWidth={2.4} />
            Connection lost
          </span>
        </div>
      )}

      {(status === "setup" || status === "loading" || status === "countdown") && (
        <StartScreen
          phase={status === "setup" ? "setup" : "countdown"}
          daily={daily}
          day={dailyStatus?.day ?? null}
          playedToday={!!dailyStatus?.played}
          ready={status === "countdown" && state.ready}
          onStart={begin}
          onGo={go}
        />
      )}
      <Confetti ref={confetti} />
    </div>
  );
}
