// Wire types for versus rooms: what GET /api/rooms/[code] and the room mutations return.
// Client-safe (no server imports). Built by lib/rooms.ts for one viewer at a time.

import type { LngLat, RoundPhoto, RoundReveal } from "@/lib/types";

export type RoomPhase = "lobby" | "round" | "reveal" | "finished";

/** Why a fighter is out of the current game. */
export type OutReason = "ko" | "left";

export interface PlayerView {
  /** Public id for this room ("p3"). Never the player's secret. */
  pid: string;
  name: string;
  /** Index into PLAYER_COLORS: join order. */
  color: number;
  hp: number;
  out: OutReason | null;
  /** Round the player went out in. */
  outRound: number | null;
  /** Polled in the last few seconds. */
  online: boolean;
  host: boolean;
  me: boolean;
}

export interface WatcherView {
  pid: string;
  name: string;
  me: boolean;
}

export interface RevealGuess extends LngLat {
  pid: string;
  distance: number;
  score: number;
  bullseye: boolean;
}

export interface RevealView {
  round: number;
  multiplier: number;
  photo: RoundPhoto;
  answer: RoundReveal;
  /** Only the players who guessed. */
  guesses: RevealGuess[];
  /** Every fighter who was still in at the start of the round (0 = no guess). */
  scores: Record<string, number>;
  damage: Record<string, number>;
  hpBefore: Record<string, number>;
  hpAfter: Record<string, number>;
  /** Knocked out this round. */
  ko: string[];
  /** Left the room before this round was scored. */
  left: string[];
  /** Server time the round was scored (the reveal started). */
  startedAt: number;
  /** Server time the next round (or the results) starts. */
  endsAt: number;
  /** Last round of the game: the results come next. */
  final: boolean;
}

export interface Standing {
  pid: string;
  name: string;
  color: number;
  rank: number;
  hp: number;
  totalScore: number;
  bullseyes: number;
  out: OutReason | null;
  outRound: number | null;
  winner: boolean;
}

export interface ResultView {
  /** pid of the winner; null for a draw. */
  winner: string | null;
  draw: boolean;
  rounds: number;
  standings: Standing[];
}

export interface MeView {
  pid: string;
  name: string;
  /** Fighting in the current game (or lined up to, in the lobby). */
  fighter: boolean;
  out: OutReason | null;
  host: boolean;
}

export interface RoomView {
  code: string;
  /** Random room id. Polls send it back (with game and round) so the server reads the room in one round trip. */
  rid: string;
  /** Room version: goes up by one on every phase change. */
  v: number;
  serverNow: number;
  phase: RoomPhase;
  /** 1-based game number in this room (rematches add one); 0 before the first start. */
  game: number;
  round: number;
  /** Damage multiplier of the current round. */
  multiplier: number;
  maxHp: number;
  maxPlayers: number;
  me: MeView | null;
  /** Lobby: who will play if the host starts now. In a game: the fighters. Join order. */
  players: PlayerView[];
  /** Everyone else in the room (late joiners, or more than the room can fit). */
  watchers: WatcherView[];
  /** Lobby: the viewer is the host and enough players are in. */
  canStart: boolean;
  /** Finished: the viewer is the host and enough players are still here for another game. */
  canRematch: boolean;

  // ---- round ----
  photo: RoundPhoto | null;
  /** Guessing opens at this server time (after the round intro). */
  startsAt: number | null;
  /** Server time the round closes, with the rush applied. */
  deadline: number | null;
  /** Seconds per round in this room's game. */
  roundSeconds: number;
  /** Someone guessed, so the clock dropped to the rush timer. */
  rushed: boolean;
  /** pid -> has guessed. Booleans only until the reveal. */
  guessed: Record<string, boolean>;
  myGuess: LngLat | null;

  // ---- reveal ----
  reveal: RevealView | null;

  // ---- finished ----
  result: ResultView | null;
}

export type RoomError =
  | "bad_request"
  | "bad_name"
  | "bad_code"
  | "no_player"
  | "not_found"
  | "not_member"
  | "room_full"
  | "not_host"
  | "need_players"
  | "no_photos"
  | "wrong_phase"
  | "not_fighting"
  | "too_early"
  | "too_late"
  | "already_guessed"
  | "busy";

/** Every room response: the error (if any) and, whenever the room exists, the fresh view. */
export interface RoomResponse {
  error?: RoomError;
  view?: RoomView;
  code?: string;
}

/** Room codes: 5 characters, no look-alikes (no I, L, O, 0, 1). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 5;

/** Uppercases and drops anything that can't be in a code. */
export function normalizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .split("")
    .filter((c) => ROOM_CODE_ALPHABET.includes(c))
    .join("")
    .slice(0, ROOM_CODE_LENGTH);
}

export function isRoomCode(code: string): boolean {
  return code.length === ROOM_CODE_LENGTH && normalizeRoomCode(code) === code;
}

/** Header that carries the player's secret id (from getPlayer()) on every room request. */
export const PLAYER_HEADER = "x-player-id";
