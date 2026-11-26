import campusJson from "@/data/campus.json";
import type { CampusCollection } from "./geo";

/** UMich Ann Arbor campus boundary from OpenStreetMap (data/campus.json). Not secret. */
export const CAMPUS = campusJson as unknown as CampusCollection;
