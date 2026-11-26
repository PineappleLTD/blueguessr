import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { geoBounds, geoGraticule, geoOrthographic, geoPath, type GeoPermissibleObjects } from "d3";
import { ImageResponse } from "next/og";

export const alt = "BlueGuessr";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Read once at build time (the image is prerendered). Barlow Condensed: SIL OFL (public/fonts).
const barlow = await readFile(join(process.cwd(), "public/fonts/BarlowCondensed-ExtraBoldItalic.ttf"));
// Natural Earth 110m land, public domain (public/geo).
const land = JSON.parse(await readFile(join(process.cwd(), "public/geo/ne_110m_land.json"), "utf8")) as {
  type: "FeatureCollection";
  features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }[];
};

const ANN_ARBOR: [number, number] = [-83.7382, 42.278];

function inRing([x, y]: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The landing's dotted globe, drawn as SVG: Michigan up top, rising out of the bottom edge. */
function globeSvg(): string {
  const r = 400;
  const cx = 600;
  const cy = 700;
  const rotate: [number, number] = [86, -12];
  const projection = geoOrthographic().scale(r).translate([cx, cy]).rotate(rotate).clipAngle(90);
  const path = geoPath(projection);
  const center: [number, number] = [-rotate[0], -rotate[1]];
  const cosC = Math.cos((center[1] * Math.PI) / 180);
  const sinC = Math.sin((center[1] * Math.PI) / 180);

  const dots: string[] = [];
  for (const feature of land.features) {
    const polygons = (
      feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates
    ) as number[][][][];
    const [[x0, y0], [x1, y1]] = geoBounds(feature as GeoPermissibleObjects);
    for (let lng = x0; lng <= x1; lng += 1.15) {
      for (let lat = y0; lat <= y1; lat += 1.15) {
        // Near side only.
        const phi = (lat * Math.PI) / 180;
        const dl = ((lng - center[0]) * Math.PI) / 180;
        if (sinC * Math.sin(phi) + cosC * Math.cos(phi) * Math.cos(dl) <= 0) continue;
        if (!polygons.some((poly) => inRing([lng, lat], poly[0]) && !poly.slice(1).some((h) => inRing([lng, lat], h)))) continue;
        const p = projection([lng, lat]);
        if (p && p[1] < 640) dots.push(`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2"/>`);
      }
    }
  }
  const [mx, my] = projection(ANN_ARBOR) ?? [cx, cy];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow"><stop offset="0.8" stop-color="#FFCB05" stop-opacity="0.22"/><stop offset="1" stop-color="#FFCB05" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${r * 1.12}" fill="url(#glow)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#00274C"/>
  <path d="${path(geoGraticule()()) ?? ""}" fill="none" stroke="#FFCB05" stroke-opacity="0.25" stroke-width="1.5"/>
  <path d="${path(land as GeoPermissibleObjects) ?? ""}" fill="none" stroke="#FFCB05" stroke-width="1.5"/>
  <g fill="#E8A317">${dots.join("")}</g>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#FFCB05" stroke-width="4"/>
  <circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="20" fill="none" stroke="#FFCB05" stroke-width="3" stroke-opacity="0.6"/>
  <circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="9" fill="#FFCB05"/>
</svg>`;
}

const globe = `data:image/svg+xml;base64,${Buffer.from(globeSvg()).toString("base64")}`;

const WORDMARK = {
  display: "flex",
  fontFamily: "Barlow Condensed",
  fontStyle: "italic",
  fontWeight: 800,
  fontSize: 214,
  lineHeight: 1,
  letterSpacing: -2,
  padding: "0 14px",
} as const;

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          position: "relative",
          background: "radial-gradient(90% 80% at 50% 100%, #0d3260 0%, #071226 62%, #050c1a 100%)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={globe} width={1200} height={630} alt="" style={{ position: "absolute", left: 0, top: 0 }} />
        {/* Extruded wordmark: darker copies stacked under the maize face, like the landing's. */}
        <div style={{ display: "flex", position: "relative", marginTop: 104 }}>
          {[
            { y: 17, color: "#0B1830" },
            { y: 12, color: "#7A5508" },
            { y: 6, color: "#B57F0B" },
          ].map(({ y, color }) => (
            <div key={y} style={{ ...WORDMARK, position: "absolute", left: 0, top: y, color }}>
              BLUEGUESSR
            </div>
          ))}
          <div
            style={{
              ...WORDMARK,
              backgroundImage: "linear-gradient(180deg, #FFF6C8 8%, #FFE15A 28%, #FFCB05 52%, #F0AE14 78%, #D18E0A 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            BLUEGUESSR
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Barlow Condensed", data: barlow, style: "italic", weight: 800 }],
    },
  );
}
