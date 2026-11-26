import "server-only";
import { hashKey, PLAYER_ID_PATTERN } from "./game";
import { kv } from "./kv";
import { claimName, cleanName } from "./names";

/** The game identity a signed-in account carries between devices. */
export interface AccountPlayer {
  playerId: string;
  name: string;
}

// Keyed by the account's verified email, hashed so KV never holds the address itself.
const keyOf = (email: string) => `account:${hashKey(`email:${email.trim().toLowerCase()}`)}`;

/** A display name from the Google profile, for accounts whose device had no name yet. */
function nameFromProfile(profileName: string | null | undefined): string | null {
  const first = (profileName ?? "").trim().split(/\s+/)[0] ?? "";
  return cleanName(first.replace(/[^A-Za-z0-9_.\- ]/g, "").slice(0, 20));
}

/**
 * Links an account to a player the first time it signs in, adopting this device's guest
 * identity (so its name and stats carry over). After that the stored player wins, and the
 * device switches to it. A name change made on the linked player is saved to the account.
 */
export async function linkAccount(
  email: string,
  profileName: string | null | undefined,
  device: { playerId: unknown; name: unknown },
): Promise<AccountPlayer> {
  const key = keyOf(email);
  const stored = await kv().get<AccountPlayer>(key);
  if (stored) {
    const name = cleanName(device.name);
    if (device.playerId === stored.playerId && name && name !== stored.name && (await claimName(name, stored.playerId))) {
      const updated = { ...stored, name };
      await kv().set(key, updated);
      return updated;
    }
    return stored;
  }

  if (typeof device.playerId !== "string" || !PLAYER_ID_PATTERN.test(device.playerId)) {
    throw new Error("bad-player");
  }
  const playerId = device.playerId;
  let name = cleanName(device.name) ?? nameFromProfile(profileName) ?? "";
  // Someone else already owns that name: start nameless and let the game ask, as it does for guests.
  if (name && !(await claimName(name, playerId))) name = "";
  const created: AccountPlayer = { playerId, name };
  // nx: if two tabs link at once, the first one wins and the other adopts it.
  if (await kv().set(key, created, { nx: true })) return created;
  return (await kv().get<AccountPlayer>(key)) ?? created;
}
