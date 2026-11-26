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
