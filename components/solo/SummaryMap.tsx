"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MLMap, Marker as MLMarker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { BLUE, GOLD, MAIZE, MAP_STYLE } from "@/components/game/GuessMap";
import { CAMPUS } from "@/lib/campus";
import { bounds, CAMPUS_FALLBACK_BOUNDS } from "@/lib/geo";
import type { LngLat } from "@/lib/types";

export interface SummaryRound {
  guess: LngLat;
  answer: LngLat;
  bullseye: boolean;
}

const campusBounds = bounds(CAMPUS) ?? CAMPUS_FALLBACK_BOUNDS;

function answerEl(n: number, bullseye: boolean, onClick: () => void): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", `Round ${n} answer`);
  el.style.cssText = "width:38px;height:38px;padding:0;border:0;background:none;cursor:pointer;";
  el.innerHTML = `
    <div class="animate-pop" style="width:38px;height:38px;border-radius:999px;display:grid;place-items:center;
      background:${bullseye ? MAIZE : BLUE};color:${bullseye ? BLUE : MAIZE};border:3px solid ${bullseye ? BLUE : MAIZE};
      box-shadow:0 4px 12px rgba(0,0,0,.45);font:800 italic 20px/1 var(--font-barlow-condensed),sans-serif;animation-delay:${n * 90}ms">
      ${n}
    </div>`;
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

function guessEl(n: number): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "width:26px;height:34px;pointer-events:none;";
  el.innerHTML = `
    <div class="animate-pop" style="width:26px;height:34px;transform-origin:50% 100%;filter:drop-shadow(0 3px 5px rgba(0,0,0,.45));animation-delay:${n * 90}ms">
      <svg viewBox="0 0 34 44" width="26" height="34" aria-hidden="true">
        <path d="M17 1.5C8.4 1.5 1.5 8.2 1.5 16.6 1.5 28 17 42.5 17 42.5S32.5 28 32.5 16.6C32.5 8.2 25.6 1.5 17 1.5z"
          fill="${MAIZE}" stroke="${BLUE}" stroke-width="2.5"/>
        <circle cx="17" cy="16.5" r="5.5" fill="${BLUE}"/>
      </svg>
    </div>`;
  return el;
}

function fit(map: MLMap, pts: LngLat[], padding: number, duration: number) {
  if (!pts.length) return map.fitBounds(campusBounds, { padding: 24, duration });
  const lngs = pts.map((p) => p.lng);
  const lats = pts.map((p) => p.lat);
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding, maxZoom: 17.5, duration },
  );
}

/** End-of-game map: every round's answer (numbered) and guess, joined by dashed lines. */
export default function SummaryMap({
  rounds,
  focus,
  onFocus,
  className = "",
}: {
  rounds: SummaryRound[];
  /** Round index to zoom to, or null for all of them. */
  focus: number | null;
  onFocus: (i: number | null) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markers = useRef<MLMarker[]>([]);
  const markerCtor = useRef<typeof MLMarker | null>(null);
  const onFocusRef = useRef(onFocus);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onFocusRef.current = onFocus;
  }, [onFocus]);

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | undefined;
    (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      if (!ml.getWorkerUrl().startsWith("/")) ml.setWorkerUrl("/maplibre-gl-worker.mjs");
      markerCtor.current = ml.Marker;
      const map = new ml.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        bounds: campusBounds,
        fitBoundsOptions: { padding: 24 },
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
          { id: "campus-fill", type: "fill", source: "campus", paint: { "fill-color": MAIZE, "fill-opacity": 0.08 } },
          firstSymbol,
        );
        map.addLayer(
          { id: "campus-line", type: "line", source: "campus", paint: { "line-color": GOLD, "line-width": 2, "line-opacity": 0.8 } },
          firstSymbol,
        );
        map.addSource("lines", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "lines-casing",
          type: "line",
          source: "lines",
          layout: { "line-cap": "round" },
          paint: { "line-color": BLUE, "line-width": 6, "line-opacity": 0.35 },
        });
        map.addLayer({
          id: "lines",
          type: "line",
          source: "lines",
          layout: { "line-cap": "round" },
          paint: { "line-color": MAIZE, "line-width": 3.5, "line-dasharray": [0.1, 2] },
        });
        setReady(true);
      });
      map.on("click", () => onFocusRef.current(null));
      ro = new ResizeObserver(() => map.resize());
      ro.observe(containerRef.current);
    })();
    return () => {
      cancelled = true;
      ro?.disconnect();
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Pins and lines.
  useEffect(() => {
    const map = mapRef.current;
    const Marker = markerCtor.current;
    if (!map || !Marker || !ready) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    rounds.forEach((r, i) => {
      markers.current.push(
        new Marker({ element: guessEl(i + 1), anchor: "bottom" }).setLngLat([r.guess.lng, r.guess.lat]).addTo(map),
        new Marker({ element: answerEl(i + 1, r.bullseye, () => onFocusRef.current(i)), anchor: "center" })
          .setLngLat([r.answer.lng, r.answer.lat])
          .addTo(map),
      );
    });
    (map.getSource("lines") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: rounds.map((r) => ({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [r.guess.lng, r.guess.lat],
            [r.answer.lng, r.answer.lat],
          ],
        },
      })),
    });
  }, [rounds, ready]);

  // Camera: everything, or one round.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const sel = focus === null ? rounds : rounds.slice(focus, focus + 1);
    fit(
      map,
      sel.flatMap((r) => [r.guess, r.answer]),
      focus === null ? 56 : 90,
      900,
    );
  }, [focus, rounds, ready]);

  return <div ref={containerRef} className={`h-full w-full ${className}`} />;
}
