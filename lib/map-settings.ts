"use client";

import { useSyncExternalStore } from "react";

/**
 * Guess-map options a player can switch off, saved on this device and shared by every map (solo
 * and versus). Both default to on.
 * - landmarks: the labeled campus landmarks (lib/landmarks.ts)
 * - labels: the base map's own text: street names, bus stops, building and place names
 */
export type MapSetting = "landmarks" | "labels";

const keyOf = (s: MapSetting) => `blueguessr:map-${s}`;
const EVENT = "blueguessr:map-settings";

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith("blueguessr:map-")) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onChange);
  };
}

// Used when localStorage is unavailable (some private modes): choices last until reload.
const fallback = new Map<MapSetting, boolean>();

function read(s: MapSetting): boolean {
  const f = fallback.get(s);
  if (f !== undefined) return f;
  try {
    return localStorage.getItem(keyOf(s)) !== "0";
  } catch {
    return true;
  }
}

export function setMapSetting(s: MapSetting, on: boolean) {
  try {
    localStorage.setItem(keyOf(s), on ? "1" : "0");
  } catch {
    fallback.set(s, on);
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useMapSetting(s: MapSetting): boolean {
  return useSyncExternalStore(
    subscribe,
    () => read(s),
    () => true,
  );
}
