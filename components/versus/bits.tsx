"use client";

import { Crown } from "lucide-react";
import { PLAYER_COLORS } from "@/components/game/GuessMap";

export const colorOf = (i: number) => PLAYER_COLORS[i % PLAYER_COLORS.length] ?? PLAYER_COLORS[0];

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** Round avatar: the player's color with their initial. */
export function Avatar({
  name,
  color,
  size = 40,
  dim = false,
  host = false,
  className = "",
}: {
  name: string;
  color: number;
  size?: number;
  dim?: boolean;
  host?: boolean;
  className?: string;
}) {
  const c = colorOf(color);
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center rounded-full font-display font-extrabold italic uppercase ${dim ? "opacity-45 grayscale" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: `radial-gradient(circle at 35% 30%, color-mix(in oklch, ${c} 70%, white), ${c} 60%, color-mix(in oklch, ${c} 70%, black))`,
        color: "#00274C",
        boxShadow: `0 3px 0 color-mix(in oklch, ${c} 55%, black), 0 0 0 2px #00274C`,
      }}
      aria-hidden
    >
      {name.trim().charAt(0) || "?"}
      {host && (
        <Crown
          className="absolute -top-[42%] left-1/2 -translate-x-1/2 -rotate-12 fill-maize text-gold-deep drop-shadow"
          style={{ width: size * 0.55, height: size * 0.55 }}
        />
      )}
    </span>
  );
}

/** "Waiting" dots. */
export function Dots({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex gap-1 ${className}`} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="vs-dot inline-block size-1.5 rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

/** Small display-font tag. */
export function Tag({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-display text-xs font-extrabold italic uppercase tracking-wide ${className}`}
      style={style}
    >
      {children}
    </span>
  );
}
