import { Compass, Crown, Flag, Footprints, MapPinned, Satellite, Sparkles, type LucideIcon } from "lucide-react";
import { MAX_GAME_SCORE } from "@/lib/scoring";

export interface Tier {
  name: string;
  icon: LucideIcon;
  /** Badge colors: rim gradient and icon disc. */
  from: string;
  to: string;
  ink: string;
}

const TIERS: (Tier & { min: number })[] = [
  { min: MAX_GAME_SCORE, name: "Perfect Game", icon: Sparkles, from: "#FFF3B0", to: "#FFCB05", ink: "#00274C" },
  { min: 24000, name: "Human GPS", icon: Satellite, from: "#FFE27A", to: "#E8A317", ink: "#00274C" },
  { min: 20000, name: "Campus Legend", icon: Crown, from: "#FFCB05", to: "#B57F0B", ink: "#00274C" },
  { min: 15000, name: "Tour Guide", icon: Flag, from: "#FFE27A", to: "#FFCB05", ink: "#00274C" },
  { min: 10000, name: "Campus Regular", icon: MapPinned, from: "#9FC3EA", to: "#4F86C6", ink: "#00274C" },
  { min: 5000, name: "Diag Wanderer", icon: Footprints, from: "#8DB6DE", to: "#2F65A7", ink: "#FFCB05" },
  { min: 0, name: "Lost Freshman", icon: Compass, from: "#6F8FB5", to: "#1D3F6B", ink: "#FFCB05" },
];

export function tierFor(total: number): Tier {
  return TIERS.find((t) => total >= t.min) ?? TIERS[TIERS.length - 1];
}

/** A quick reaction to one round, by distance. */
export function reaction(distance: number, bullseye: boolean): string {
  if (bullseye) return "Bullseye!";
  if (distance <= 40) return "So close!";
  if (distance <= 120) return "Nice one!";
  if (distance <= 300) return "Not bad";
  if (distance <= 800) return "Warm-ish";
  if (distance <= 1800) return "Chilly";
  return "Wrong campus?";
}
