// Scoring rules shared by solo and versus. Pure functions: safe on server and client.

export const ROUNDS_PER_GAME = 5;
export const MAX_ROUND_SCORE = 5000;
export const MAX_GAME_SCORE = ROUNDS_PER_GAME * MAX_ROUND_SCORE;

/** Pins within this many metres of the photo score full points and count as a bullseye (GeoGuessr: 25 m). */
export const BULLSEYE_METERS = 25;

/**
 * GeoGuessr's scale: the diagonal of the box around every location on the map. Ours is the
 * spread of data/photos.json (Central to North to the athletic fields), about 6.3 km.
 */
const MAP_SIZE_METERS = 6300;

/**
 * GeoGuessr's formula: 5000 × e^(−10 × distance / map size), full points inside 25 m.
 * On the world map that is the familiar 5000 × e^(−km / 1492.7).
 */
export function roundScore(distanceM: number): number {
  if (!Number.isFinite(distanceM)) return 0;
  if (distanceM <= BULLSEYE_METERS) return MAX_ROUND_SCORE;
  return Math.round(MAX_ROUND_SCORE * Math.exp((-10 * distanceM) / MAP_SIZE_METERS));
}

export const isBullseye = (distanceM: number) => distanceM <= BULLSEYE_METERS;

// ---- Versus (health bar fight) ----

export const VERSUS_MAX_PLAYERS = 6; // host + 5 friends
export const VERSUS_START_HP = 6000;
/** Seconds each round lasts once it starts, unless the host picks another of the options. */
export const VERSUS_ROUND_SECONDS = 45;
export const VERSUS_ROUND_OPTIONS = [15, 30, 45, 60, 90] as const;

/** The host's pick if it is one of the options, else the default. */
export function versusRoundSeconds(pick: unknown): number {
  return VERSUS_ROUND_OPTIONS.includes(pick as (typeof VERSUS_ROUND_OPTIONS)[number]) ? (pick as number) : VERSUS_ROUND_SECONDS;
}
/** Once someone guesses, everyone else's clock drops to at most this many seconds. */
export const VERSUS_RUSH_SECONDS = 15;

/** Damage multiplier grows each round so fights always end. Round is 1-based. */
export function damageMultiplier(round: number): number {
  if (round <= 2) return 1;
  return 1 + (round - 2) * 0.5; // 1.5, 2, 2.5, ...
}

/**
 * Each player loses (best score this round − their score) × multiplier.
 * Players who didn't guess score 0. Returns damage per player id.
 */
export function roundDamage(scores: Record<string, number>, round: number): Record<string, number> {
  const best = Math.max(0, ...Object.values(scores));
  const m = damageMultiplier(round);
  return Object.fromEntries(
    Object.entries(scores).map(([id, s]) => [id, Math.round((best - s) * m)]),
  );
}
