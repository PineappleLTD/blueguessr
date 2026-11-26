"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MLMap, Marker as MLMarker, GeoJSONSource } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { CAMPUS } from "@/lib/campus";
import { bounds, CAMPUS_FALLBACK_BOUNDS } from "@/lib/geo";
import type { LngLat } from "@/lib/types";

export const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export const MAIZE = "#FFCB05";
export const GOLD = "#E8A317";
export const BLUE = "#00274C";
/** Pin colors for versus players, in join order. Player 0 is maize. */
export const PLAYER_COLORS = [MAIZE, "#4FC3F7", "#FF7A59", "#7CE38B", "#C792EA", "#FF5C8A"];

export interface MapPin {
  id: string;
  pos: LngLat;
  color?: string;
  label?: string;
}

export interface GuessMapProps {
  /** The local player's pin. */
  guess?: LngLat | null;
  /** When set, clicking the map moves the pin. Leave unset to lock the map (e.g. after guessing). */
  onGuess?: (p: LngLat) => void;
  /** When set, the map shows the answer, draws lines from every pin to it and zooms to fit. */
  answer?: LngLat | null;
  /** Other players' pins (versus). Shown alongside `guess`. */
  pins?: MapPin[];
  /** Color of the local player's pin. */
  guessColor?: string;
  /** Change this (e.g. the round number) to reset the view to the whole campus. */
  resetKey?: string | number;
  className?: string;
}

const campusBounds = bounds(CAMPUS) ?? CAMPUS_FALLBACK_BOUNDS;
const PAD = 0.025; // degrees of slack around campus you can pan into
const maxBounds: [[number, number], [number, number]] = [
  [campusBounds[0][0] - PAD, campusBounds[0][1] - PAD],
  [campusBounds[1][0] + PAD, campusBounds[1][1] + PAD],
];

function pinElement(color: string, label?: string): HTMLElement {
  // MapLibre positions the root with `transform`, so the pop-in animation goes on a child.
  const el = document.createElement("div");
  el.style.cssText = "width:34px;height:44px;pointer-events:none;";
  const inner = document.createElement("div");
  inner.className = "animate-pop";
  inner.style.cssText = "position:relative;width:34px;height:44px;transform-origin:50% 100%;filter:drop-shadow(0 4px 6px rgba(0,0,0,.45));";
  el.appendChild(inner);
  inner.innerHTML = `
    <svg viewBox="0 0 34 44" width="34" height="44" aria-hidden="true">
      <path d="M17 1.5C8.4 1.5 1.5 8.2 1.5 16.6 1.5 28 17 42.5 17 42.5S32.5 28 32.5 16.6C32.5 8.2 25.6 1.5 17 1.5z"
        fill="${color}" stroke="${BLUE}" stroke-width="2.5"/>
      <circle cx="17" cy="16.5" r="5.5" fill="${BLUE}"/>
    </svg>`;
  if (label) {
    const tag = document.createElement("div");
    tag.textContent = label;
    tag.style.cssText = `position:absolute;left:50%;top:-22px;transform:translateX(-50%);white-space:nowrap;
      font:800 italic 13px/1 var(--font-barlow-condensed),sans-serif;text-transform:uppercase;letter-spacing:.02em;
      padding:3px 7px;border-radius:999px;background:${BLUE};color:${color};border:1.5px solid ${color};`;
    inner.appendChild(tag);
  }
  return el;
}

function answerElement(): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "width:44px;height:44px;pointer-events:none;";
  const inner = document.createElement("div");
  inner.className = "animate-pop";
  inner.style.cssText = "width:44px;height:44px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.5));";
  el.appendChild(inner);
  inner.innerHTML = `
    <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
      <circle cx="22" cy="22" r="19" fill="${BLUE}" stroke="${MAIZE}" stroke-width="3"/>
      <path d="M22 9l3.9 8 8.8 1.2-6.4 6.1 1.6 8.7L22 28.8 14.1 33l1.6-8.7-6.4-6.1 8.8-1.2z" fill="${MAIZE}"/>
    </svg>`;
  return el;
}

export default function GuessMap({
  guess,
  onGuess,
  answer,
  pins,
  guessColor = MAIZE,
  resetKey,
  className = "",
}: GuessMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<MLMarker[]>([]);
  const markerCtor = useRef<typeof MLMarker | null>(null);
  const onGuessRef = useRef(onGuess);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onGuessRef.current = onGuess;
  }, [onGuess]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | undefined;
    (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      // Bundlers can't follow MapLibre's worker import; postinstall copies it to public/.
      if (!ml.getWorkerUrl().startsWith("/")) ml.setWorkerUrl("/maplibre-gl-worker.mjs");
      markerCtor.current = ml.Marker;
      const map = new ml.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        bounds: campusBounds,
        fitBoundsOptions: { padding: 24 },
        maxBounds,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      map.touchZoomRotate.disableRotation();
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;
        const firstSymbol = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
        map.addSource("campus", { type: "geojson", data: CAMPUS as unknown as GeoJSON.FeatureCollection });
        map.addLayer(
          { id: "campus-fill", type: "fill", source: "campus", paint: { "fill-color": MAIZE, "fill-opacity": 0.1 } },
          firstSymbol,
        );
        map.addLayer(
          {
            id: "campus-line",
            type: "line",
            source: "campus",
            paint: { "line-color": GOLD, "line-width": 2.5, "line-opacity": 0.9 },
          },
          firstSymbol,
        );
        map.addSource("lines", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "lines",
          type: "line",
          source: "lines",
          layout: { "line-cap": "round" },
          paint: { "line-color": ["get", "color"], "line-width": 3.5, "line-dasharray": [0.1, 2] },
        });
        setReady(true);
      });

      map.on("click", (e) => {
        onGuessRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });

      ro = new ResizeObserver(() => map.resize());
      ro.observe(containerRef.current);
    })();
    return () => {
      cancelled = true;
      ro?.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Cursor shows whether clicks do anything.
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = onGuess ? "crosshair" : "";
  }, [onGuess, ready]);

  // Reset the view between rounds.
  useEffect(() => {
    if (!ready || resetKey === undefined) return;
    mapRef.current?.fitBounds(campusBounds, { padding: 24, duration: 600 });
  }, [resetKey, ready]);

  // Markers, answer lines and the fit-to-reveal zoom.
  useEffect(() => {
    const map = mapRef.current;
    const Marker = markerCtor.current;
    if (!map || !Marker || !ready) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const all: MapPin[] = [
      ...(guess ? [{ id: "me", pos: guess, color: guessColor }] : []),
      ...(pins ?? []),
    ];
    for (const p of all) {
      markersRef.current.push(
        new Marker({ element: pinElement(p.color ?? MAIZE, p.label), anchor: "bottom" })
          .setLngLat([p.pos.lng, p.pos.lat])
          .addTo(map),
      );
    }

    const lines = map.getSource("lines") as GeoJSONSource | undefined;
    if (answer) {
      markersRef.current.push(
        new Marker({ element: answerElement(), anchor: "center" }).setLngLat([answer.lng, answer.lat]).addTo(map),
      );
      lines?.setData({
        type: "FeatureCollection",
        features: all.map((p) => ({
          type: "Feature",
          properties: { color: p.color ?? MAIZE },
          geometry: {
            type: "LineString",
            coordinates: [
              [p.pos.lng, p.pos.lat],
              [answer.lng, answer.lat],
            ],
          },
        })),
      });
      const pts = [answer, ...all.map((p) => p.pos)];
      const lngs = pts.map((p) => p.lng);
      const lats = pts.map((p) => p.lat);
      const sw: [number, number] = [Math.min(...lngs), Math.min(...lats)];
      const ne: [number, number] = [Math.max(...lngs), Math.max(...lats)];
      if (pts.length === 1) map.easeTo({ center: [answer.lng, answer.lat], zoom: 17, duration: 800 });
      else map.fitBounds([sw, ne], { padding: 70, maxZoom: 18, duration: 900 });
    } else {
      lines?.setData({ type: "FeatureCollection", features: [] });
    }
  }, [guess, pins, answer, guessColor, ready]);

  return <div ref={containerRef} className={`h-full w-full ${className}`} />;
}
