// Shared data contracts. Everything in data/ and the API follows these shapes.

export type PhotoSource = "mapillary" | "commons" | "player";

/** One playable photo. Lives in data/photos.json (server-only: it has the answers). */
export interface Photo {
  /** Opaque random id. Also the image filename, so it reveals nothing. */
  id: string;
  /** URL the browser loads, e.g. "/photos/<id>.webp" or a Blob URL for player photos. */
  src: string;
  width: number;
  height: number;
  lat: number;
  lng: number;
  source: PhotoSource;
  /** Credited name: Mapillary username, Commons author, or BlueGuessr username. */
  author: string;
  /** Short license name, e.g. "CC BY-SA 4.0". */
  license: string;
  licenseUrl: string;
  /** Original page. Only ever sent to the browser after the round is guessed. */
  sourceUrl?: string;
  area?: CampusArea;
}

export type CampusArea = "central" | "north" | "medical" | "athletic" | "other";

/** What the browser gets before guessing: no coordinates, no credit. */
export interface RoundPhoto {
  id: string;
  src: string;
  width: number;
  height: number;
}

/** What the browser gets after guessing. */
export interface RoundReveal {
  lat: number;
  lng: number;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl?: string;
  source: PhotoSource;
}

export interface LngLat {
  lat: number;
  lng: number;
}
