"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MLMap, Marker as MLMarker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { BLUE, GOLD, MAIZE, MAP_STYLE } from "@/components/game/GuessMap";
import { CAMPUS } from "@/lib/campus";
import { bounds, CAMPUS_FALLBACK_BOUNDS } from "@/lib/geo";
import type { LngLat } from "@/lib/types";

/**
 * A map for placing one pin precisely: tap or drag to move it. Unlike GuessMap it can fly to a
 * spot (the phone's position, or the pin under review), and it can draw a GPS accuracy ring.
 * Same OpenFreeMap style, campus outline and pin look as GuessMap.
 */
export interface PinPickerProps {
  value: LngLat | null;
  /** When set, tapping the map or dragging the pin moves it. */
  onChange?: (p: LngLat) => void;
  /** GPS accuracy in metres: drawn as a soft ring around the pin. */
  accuracy?: number | null;
  /** Change this to fly the view to `value`. */
  focusKey?: number | string;
  className?: string;
}

const campusBounds = bounds(CAMPUS) ?? CAMPUS_FALLBACK_BOUNDS;
const PAD = 0.025;
const maxBounds: [[number, number], [number, number]] = [
  [campusBounds[0][0] - PAD, campusBounds[0][1] - PAD],
  [campusBounds[1][0] + PAD, campusBounds[1][1] + PAD],
];
const FOCUS_ZOOM = 17.2;

/** True when the point is inside the area the map lets you pan to. */
export function onMapArea(p: LngLat): boolean {
  return p.lng >= maxBounds[0][0] && p.lng <= maxBounds[1][0] && p.lat >= maxBounds[0][1] && p.lat <= maxBounds[1][1];
}

function pinElement(draggable: boolean): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `width:40px;height:52px;${draggable ? "cursor:grab;" : "pointer-events:none;"}`;
  const inner = document.createElement("div");
  inner.className = "animate-pop";
  inner.style.cssText =
    "width:40px;height:52px;transform-origin:50% 100%;filter:drop-shadow(0 5px 7px rgba(0,0,0,.5));";
  inner.innerHTML = `
    <svg viewBox="0 0 34 44" width="40" height="52" aria-hidden="true">
      <path d="M17 1.5C8.4 1.5 1.5 8.2 1.5 16.6 1.5 28 17 42.5 17 42.5S32.5 28 32.5 16.6C32.5 8.2 25.6 1.5 17 1.5z"
        fill="${MAIZE}" stroke="${BLUE}" stroke-width="2.5"/>
      <circle cx="17" cy="16.5" r="5.5" fill="${BLUE}"/>
    </svg>`;
  el.appendChild(inner);
  return el;
}

function circle(c: LngLat, meters: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos((c.lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    ring.push([c.lng + dLng * Math.cos(a), c.lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export default function PinPicker({ value, onChange, accuracy, focusKey, className = "" }: PinPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRef = useRef<MLMarker | null>(null);
  const markerCtor = useRef<typeof MLMarker | null>(null);
  const onChangeRef = useRef(onChange);
  const initial = useRef(value);
  // `ready`: the map exists, so the pin and camera work. `styleGen`: bumps each time the style
  // (re)loads and the overlay layers are in place.
  const [ready, setReady] = useState(false);
  const [styleGen, setStyleGen] = useState(0);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | undefined;
    (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      // Bundlers can't follow MapLibre's worker import; postinstall copies it to public/.
      if (!ml.getWorkerUrl().startsWith("/")) ml.setWorkerUrl("/maplibre-gl-worker.mjs");
      markerCtor.current = ml.Marker;
      const start = initial.current && onMapArea(initial.current) ? initial.current : null;
      const map = new ml.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        ...(start ? { center: [start.lng, start.lat], zoom: FOCUS_ZOOM } : { bounds: campusBounds }),
        fitBoundsOptions: { padding: 24 },
        maxBounds,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      map.touchZoomRotate.disableRotation();
      mapRef.current = map;

      // Tiles can take a while on a slow connection; the overlays only need the style itself.
      // A lost GL context rebuilds the style, so this runs again and re-adds them.
      map.on("style.load", () => {
        if (cancelled) return;
        if (!map.getSource("campus")) {
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
        }
        if (!map.getSource("accuracy")) {
          map.addSource("accuracy", { type: "geojson", data: EMPTY });
          map.addLayer({
            id: "accuracy-fill",
            type: "fill",
            source: "accuracy",
            paint: { "fill-color": MAIZE, "fill-opacity": 0.14 },
          });
          map.addLayer({
            id: "accuracy-line",
            type: "line",
            source: "accuracy",
            paint: { "line-color": MAIZE, "line-width": 1.5, "line-opacity": 0.6 },
          });
        }
        setStyleGen((g) => g + 1);
      });
      setReady(true);

      map.on("click", (e) => onChangeRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));

      ro = new ResizeObserver(() => map.resize());
      ro.observe(containerRef.current);
    })();
    return () => {
      cancelled = true;
      ro?.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const draggable = !!onChange;
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = draggable ? "crosshair" : "";
  }, [draggable, ready]);

  // The pin.
  useEffect(() => {
    const map = mapRef.current;
    const Marker = markerCtor.current;
    if (!map || !Marker || !ready) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current || markerRef.current.isDraggable() !== draggable) {
      markerRef.current?.remove();
      const marker = new Marker({ element: pinElement(draggable), anchor: "bottom", draggable });
      marker.on("dragend", () => {
        const p = marker.getLngLat();
        onChangeRef.current?.({ lat: p.lat, lng: p.lng });
      });
      markerRef.current = marker.setLngLat([value.lng, value.lat]).addTo(map);
    } else {
      markerRef.current.setLngLat([value.lng, value.lat]);
    }
  }, [value, draggable, ready]);

  // Accuracy ring.
  useEffect(() => {
    const src = mapRef.current?.getSource("accuracy") as GeoJSONSource | undefined;
    if (!styleGen || !src) return;
    src.setData(
      value && accuracy && accuracy > 0
        ? { type: "FeatureCollection", features: [circle(value, Math.min(accuracy, 500))] }
        : EMPTY,
    );
  }, [value, accuracy, styleGen]);

  // Fly to the pin when asked.
  const lastFocus = useRef<number | string | undefined>(undefined);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || focusKey === undefined || focusKey === lastFocus.current || !value) return;
    lastFocus.current = focusKey;
    if (!onMapArea(value)) return;
    map.flyTo({ center: [value.lng, value.lat], zoom: Math.max(map.getZoom(), FOCUS_ZOOM), speed: 1.8 });
  }, [focusKey, value, ready]);

  return <div ref={containerRef} className={`h-full w-full ${className}`} />;
}
