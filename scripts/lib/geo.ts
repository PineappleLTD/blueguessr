// Small planar geometry helpers. Coordinates are [lng, lat] like GeoJSON.
export type Position = [number, number];
export type Ring = Position[];
/** Outer ring first, then holes. */
export type PolygonRings = Ring[];

const R_EARTH = 6_371_008.8;
const LAT0 = 42.28; // campus latitude, for the local equirectangular projection
const M_PER_DEG_LAT = 111_132.954 - 559.822 * Math.cos(2 * LAT0 * (Math.PI / 180));
const M_PER_DEG_LNG = 111_412.84 * Math.cos(LAT0 * (Math.PI / 180));

/** Local planar projection in meters (good to well under 1% across the campus). */
export function toXY(lng: number, lat: number): [number, number] {
  return [lng * M_PER_DEG_LNG, lat * M_PER_DEG_LAT];
}

export function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

export function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(lng: number, lat: number, rings: PolygonRings): boolean {
  if (!pointInRing(lng, lat, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (pointInRing(lng, lat, rings[k])) return false;
  return true;
}

/** Signed area in m² (positive = counter-clockwise). */
export function ringSignedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = toXY(...ring[j]);
    const [x2, y2] = toXY(...ring[i]);
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

export function polygonArea(rings: PolygonRings): number {
  return Math.abs(ringSignedArea(rings[0])) - rings.slice(1).reduce((s, r) => s + Math.abs(ringSignedArea(r)), 0);
}

export function closeRing(ring: Ring): Ring {
  const [a, b] = [ring[0], ring[ring.length - 1]];
  return a[0] === b[0] && a[1] === b[1] ? ring : [...ring, [a[0], a[1]]];
}

function openRing(ring: Ring): Ring {
  const [a, b] = [ring[0], ring[ring.length - 1]];
  return ring.length > 1 && a[0] === b[0] && a[1] === b[1] ? ring.slice(0, -1) : ring;
}

/** Distance in meters from point p to the segment a-b. */
export function pointSegmentDistance(p: Position, a: Position, b: Position): number {
  const [px, py] = toXY(...p);
  const [ax, ay] = toXY(...a);
  const [bx, by] = toXY(...b);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Douglas-Peucker on a closed ring, tolerance in meters. Keeps at least 4 points. */
export function simplifyRing(ring: Ring, toleranceM: number): Ring {
  const pts = openRing(ring);
  if (pts.length <= 4) return closeRing(pts);
  // Split at the vertex farthest from the first one so both halves are open polylines.
  let far = 0;
  let farD = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = pointSegmentDistance(pts[i], pts[0], pts[0]);
    if (d > farD) [far, farD] = [i, d];
  }
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[far] = true;
  const stack: [number, number][] = [
    [0, far],
    [far, pts.length],
  ];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const end = pts[e % pts.length];
    let idx = -1;
    let maxD = toleranceM;
    for (let i = s + 1; i < e; i++) {
      const d = pointSegmentDistance(pts[i], pts[s], end);
      if (d > maxD) [idx, maxD] = [i, d];
    }
    if (idx >= 0) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out = pts.filter((_, i) => keep[i]);
  return closeRing(out.length >= 3 ? out : pts);
}

/**
 * Clip a ring to the half-plane left of the directed line a->b (Sutherland-Hodgman, one edge).
 * Works on [lng, lat] directly; fine at campus scale.
 */
export function clipRingToHalfPlane(ring: Ring, a: Position, b: Position): Ring {
  const side = (p: Position) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const pts = openRing(ring);
  const out: Ring = [];
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const prev = pts[(i + pts.length - 1) % pts.length];
    const sc = side(cur);
    const sp = side(prev);
    if (sc >= 0) {
      if (sp < 0) out.push(intersect(prev, cur, sp, sc));
      out.push(cur);
    } else if (sp >= 0) {
      out.push(intersect(prev, cur, sp, sc));
    }
  }
  return out.length >= 3 ? closeRing(dedupe(out)) : [];
}

function intersect(p: Position, q: Position, sp: number, sq: number): Position {
  const t = sp / (sp - sq);
  return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
}

function dedupe(ring: Ring): Ring {
  return ring.filter((p, i) => {
    const q = ring[(i + ring.length - 1) % ring.length];
    return Math.abs(p[0] - q[0]) > 1e-9 || Math.abs(p[1] - q[1]) > 1e-9;
  });
}

export function ringBBox(ring: Ring): [number, number, number, number] {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [minX, minY, maxX, maxY];
}

/** Shortest distance in meters from a point to a ring's edges (0 if the point is inside). */
export function distanceToRing(lng: number, lat: number, ring: Ring): number {
  if (pointInRing(lng, lat, ring)) return 0;
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) best = Math.min(best, pointSegmentDistance([lng, lat], ring[i - 1], ring[i]));
  return best;
}

export function roundCoord(v: number, digits = 6): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
