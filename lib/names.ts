import "server-only";
import { kv } from "./kv";

const NAME_PATTERN = /^[A-Za-z0-9_.\- ]{2,20}$/;

/** Validates a display name. Returns the cleaned name or null. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  return NAME_PATTERN.test(name) ? name : null;
}

/**
 * First player id to use a name owns it (case-insensitive), so nobody can post
 * scores or photos under someone else's name. Returns false if it's taken.
 */
export async function claimName(name: string, playerId: string): Promise<boolean> {
  const key = "names";
  const field = name.toLowerCase();
  if (await kv().hsetnx(key, field, playerId)) return true;
  return (await kv().hget<string>(key, field)) === playerId;
}
