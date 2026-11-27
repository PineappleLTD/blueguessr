"use client";

// Types only: these server modules never reach the browser bundle.
import type { GameState, NewGame, RoundClock, RoundResult } from "@/lib/game";
import type { LeaderboardData, Period, SubmitResult } from "@/lib/leaderboard";
import { getPlayer, type LocalPlayer } from "@/lib/player";
import type { LngLat } from "@/lib/types";

export type { GameState, NewGame, RoundClock, RoundResult, Unranked } from "@/lib/game";
export type { LeaderboardData, LeaderboardEntry, Period, SubmitResult } from "@/lib/leaderboard";

/** An API call that failed: `code` is the server's error code, or "network". */
export class ApiFailure extends Error {
  constructor(
    public code: string,
    public status: number,
    public data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

async function call<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new ApiFailure("network", 0);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiFailure(typeof data.error === "string" ? data.error : "server", res.status, data);
  return data as T;
}

export const soloApi = {
  newGame: (body: { playerId?: string; daily: boolean; landmarks: boolean; labels: boolean }) =>
    call<NewGame>("/api/game", { method: "POST", body }),
  daily: (playerId?: string) => call<{ day: string; played: boolean }>("/api/daily", { method: "POST", body: { playerId } }),
  startRound: (id: string, round: number) =>
    call<RoundClock>(`/api/game/${encodeURIComponent(id)}/start`, { method: "POST", body: { round } }),
  state: (id: string) => call<GameState>(`/api/game/${encodeURIComponent(id)}`),
  /** `null` ends a timed round that ran out without a pin. */
  guess: (id: string, round: number, p: LngLat | null) =>
    call<RoundResult>(`/api/game/${encodeURIComponent(id)}/guess`, {
      method: "POST",
      body: p ? { round, lat: p.lat, lng: p.lng } : { round, timeout: true },
    }),
  leaderboard: (period: Period, me?: string) =>
    call<LeaderboardData>(`/api/leaderboard?period=${period}${me ? `&me=${encodeURIComponent(me)}` : ""}`),
  submit: (gameId: string, playerId: string, name: string) =>
    call<SubmitResult>("/api/leaderboard", { method: "POST", body: { gameId, playerId, name } }),
};

/** The local player, or null where storage is blocked. */
export function safePlayer(): LocalPlayer | null {
  try {
    return getPlayer();
  } catch {
    return null;
  }
}
