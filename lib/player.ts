"use client";

// The player's local identity: a random id (kept secret, proves you own your name)
// and a display name. Stored in localStorage. Signing in links it to an account, which
// can swap in the account's identity on a new device (components/site/AccountButton.tsx).

export interface LocalPlayer {
  id: string;
  name: string;
}

const KEY = "blueguessr:player";

export const NAME_MAX = 20;
export const NAME_PATTERN = /^[A-Za-z0-9_.\- ]{2,20}$/;

function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getPlayer(): LocalPlayer {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as LocalPlayer;
      if (p.id) return p;
    }
  } catch {}
  const p = { id: randomId(), name: "" };
  localStorage.setItem(KEY, JSON.stringify(p));
  return p;
}

export function setPlayerName(name: string): LocalPlayer {
  const p = { ...getPlayer(), name: name.trim().slice(0, NAME_MAX) };
  localStorage.setItem(KEY, JSON.stringify(p));
  return p;
}

/** Switches this device to another identity (the one a signed-in account carries). */
export function replacePlayer(p: LocalPlayer): void {
  localStorage.setItem(KEY, JSON.stringify({ id: p.id, name: p.name.trim().slice(0, NAME_MAX) }));
}

/** Forgets this device's identity (on sign-out), so the next visit starts as a fresh guest. */
export function resetPlayer(): void {
  localStorage.removeItem(KEY);
}
