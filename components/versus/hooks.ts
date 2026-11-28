"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getPlayer, setPlayerName, type LocalPlayer } from "@/lib/player";
import { PLAYER_HEADER, type RoomError, type RoomResponse, type RoomView } from "./types";

// ---------------------------------------------------------------- local player

const PLAYER_EVENT = "blueguessr:player";
let playerCache: { raw: string | null; value: LocalPlayer } | null = null;

function readPlayer(): LocalPlayer | null {
  try {
    const raw = localStorage.getItem("blueguessr:player");
    if (playerCache && playerCache.raw === raw) return playerCache.value;
    const value = getPlayer(); // creates the secret id on first visit
    playerCache = { raw: localStorage.getItem("blueguessr:player"), value };
    return value;
  } catch {
    return null;
  }
}

function subscribePlayer(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(PLAYER_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(PLAYER_EVENT, cb);
  };
}

/** The local player (secret id + name), or null before hydration. */
export function useLocalPlayer(): LocalPlayer | null {
  return useSyncExternalStore(subscribePlayer, readPlayer, () => null);
}

export function saveName(name: string): LocalPlayer {
  const p = setPlayerName(name);
  window.dispatchEvent(new Event(PLAYER_EVENT));
  return p;
}

// ---------------------------------------------------------------- clock

let tickNow = 0;
let tickTimer: ReturnType<typeof setInterval> | undefined;
const tickListeners = new Set<() => void>();

function subscribeTick(cb: () => void) {
  tickListeners.add(cb);
  if (!tickTimer) {
    tickNow = Date.now();
    tickTimer = setInterval(() => {
      tickNow = Date.now();
      tickListeners.forEach((l) => l());
    }, 100);
  }
  return () => {
    tickListeners.delete(cb);
    if (!tickListeners.size && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = undefined;
    }
  };
}
const tickSnapshot = () => tickNow || Date.now();

/** Local time, re-rendering ten times a second. 0 on the server. */
export function useNow(): number {
  return useSyncExternalStore(subscribeTick, tickSnapshot, () => 0);
}

// ---------------------------------------------------------------- API

export interface ApiResult {
  status: number;
  data: RoomResponse;
  sentAt: number;
  receivedAt: number;
}

/** What we last saw of the room, for ?h=: lets the server read the room in one round trip. */
function hintFor(view: RoomView | null): string {
  if (!view?.rid) return "";
  const h = view.phase === "round" ? `${view.rid}.${view.game}.${view.round}` : view.rid;
  return `?h=${encodeURIComponent(h)}`;
}

export async function roomApi(path: string, body?: unknown, seen: RoomView | null = null): Promise<ApiResult> {
  const sentAt = Date.now();
  const res = await fetch(`/api/rooms${path}${hintFor(seen)}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      [PLAYER_HEADER]: getPlayer().id,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  let data: RoomResponse = {};
  try {
    data = (await res.json()) as RoomResponse;
  } catch {}
  return { status: res.status, data, sentAt, receivedAt: Date.now() };
}

// ---------------------------------------------------------------- room sync

const POLL_MS = 1000;

export type RoomStatus = "loading" | "ok" | "not_found" | "offline";

export interface RoomSync {
  view: RoomView | null;
  status: RoomStatus;
  /** serverNow ≈ Date.now() + offset. */
  offset: number;
  /** Runs a mutation and applies the view it returns. */
  act: (action: string, body?: Record<string, unknown>) => Promise<{ ok: boolean; error?: RoomError }>;
  /** Poll right now (e.g. the moment a countdown runs out). */
  poke: () => void;
}

/** Polls the room about once a second while `enabled`, keeping a server clock offset. */
export function useRoom(code: string, enabled: boolean): RoomSync {
  const [view, setView] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<RoomStatus>("loading");
  const [offset, setOffset] = useState(0);
  const samples = useRef<{ rtt: number; offset: number }[]>([]);
  const latest = useRef<RoomView | null>(null);
  const pokeRef = useRef<() => void>(() => {});

  const apply = useCallback((r: ApiResult) => {
    if (r.status === 404) {
      setStatus("not_found");
      return;
    }
    const next = r.data.view;
    if (!next) return;
    // Clock: keep the offset from the fastest of the recent round trips.
    const rtt = r.receivedAt - r.sentAt;
    samples.current = [...samples.current, { rtt, offset: next.serverNow - (r.sentAt + rtt / 2) }].slice(-10);
    const best = samples.current.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    setOffset((o) => (Math.abs(o - best.offset) > 25 ? best.offset : o));
    // Never step back to an older picture of the room (responses can arrive out of order).
    const cur = latest.current;
    if (cur && (next.v < cur.v || (next.v === cur.v && next.serverNow < cur.serverNow))) return;
    latest.current = next;
    setView(next);
    setStatus("ok");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const run = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      clearTimeout(timer);
      try {
        const r = await roomApi(`/${code}`, undefined, latest.current);
        if (stopped) return;
        failures = 0;
        apply(r);
      } catch {
        failures++;
        if (!stopped && failures >= 3) setStatus("offline");
      } finally {
        inFlight = false;
        if (!stopped) timer = setTimeout(run, POLL_MS);
      }
    };
    pokeRef.current = () => void run();
    void run();
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      pokeRef.current = () => {};
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [code, enabled, apply]);

  const act = useCallback(
    async (action: string, body: Record<string, unknown> = {}) => {
      try {
        const r = await roomApi(`/${code}/${action}`, body, latest.current);
        apply(r);
        return { ok: r.status < 400, error: r.data.error };
      } catch {
        return { ok: false, error: "busy" as const };
      }
    },
    [code, apply],
  );

  const poke = useCallback(() => pokeRef.current(), []);

  return { view, status, offset, act, poke };
}
