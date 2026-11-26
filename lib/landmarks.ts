"use client";

import { useSyncExternalStore } from "react";

/**
 * Big, well-known buildings labeled on the guess map so players have something to aim from.
 * Coordinates are building centroids from OpenStreetMap. Lower `rank` wins when labels collide.
 */
export const LANDMARKS: { name: string; lat: number; lng: number; rank: number }[] = [
  { name: "UGLI", lat: 42.27563, lng: -83.73719, rank: 1 },
  { name: "Michigan Union", lat: 42.27517, lng: -83.74151, rank: 2 },
  { name: "The Big House", lat: 42.26583, lng: -83.74783, rank: 3 },
  { name: "The Dude", lat: 42.29118, lng: -83.71577, rank: 4 },
  { name: "CCTC", lat: 42.27799, lng: -83.73529, rank: 5 },
  { name: "U-M Hospital", lat: 42.28468, lng: -83.72942, rank: 6 },
  { name: "Hadley", lat: 42.2781, lng: -83.73278, rank: 7 },
  { name: "South Quad", lat: 42.27371, lng: -83.74215, rank: 8 },
  { name: "Markley", lat: 42.28088, lng: -83.72888, rank: 9 },
  { name: "Bursley", lat: 42.29374, lng: -83.72094, rank: 10 },
];

export const LANDMARKS_GEOJSON: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: LANDMARKS.map((l) => ({
    type: "Feature",
    properties: { name: l.name, rank: l.rank },
    geometry: { type: "Point", coordinates: [l.lng, l.lat] },
  })),
};

// The on/off choice is saved on this device and shared by every map (solo and versus).
const KEY = "blueguessr:landmarks";
const EVENT = "blueguessr:landmarks";

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onChange);
  };
}

// Used when localStorage is unavailable (some private modes): the choice lasts until reload.
let fallback: boolean | null = null;

function read(): boolean {
  if (fallback !== null) return fallback;
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export function setLandmarksOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    fallback = on;
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Whether landmark labels are on (default: on). */
export function useLandmarksOn(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}
