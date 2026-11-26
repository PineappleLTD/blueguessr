"use client";

// The player's local identity: a random id (kept secret, proves you own your name)
// and a display name. Stored in localStorage; no accounts.

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
