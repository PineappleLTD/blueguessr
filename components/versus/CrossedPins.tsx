"use client";

import { PLAYER_COLORS } from "@/components/game/GuessMap";

const PIN = "M17 1.5C8.4 1.5 1.5 8.2 1.5 16.6 1.5 28 17 42.5 17 42.5S32.5 28 32.5 16.6C32.5 8.2 25.6 1.5 17 1.5z";

function Pin({ tipX, angle, color }: { tipX: number; angle: number; color: string }) {
  return (
    <g transform={`translate(${tipX} 150) rotate(${angle}) scale(2.2) translate(-17 -42.5)`}>
      <path d={PIN} fill={color} stroke="#00274C" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="17" cy="16.5" r="5.5" fill="#00274C" />
    </g>
  );
}

/** Two players' pins slamming into the same spot: the versus emblem. */
export default function CrossedPins({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="14 52 212 146" className={className} aria-hidden>
      <g stroke="#FFCB05" strokeWidth="4" strokeLinecap="round">
        {[-80, -50, -20, 20, 50, 80].map((a) => (
          <line key={a} x1="120" y1="128" x2="120" y2="112" transform={`rotate(${a + 180} 120 150)`} />
        ))}
      </g>
      <Pin tipX={112} angle={-44} color={PLAYER_COLORS[0]} />
      <Pin tipX={128} angle={44} color={PLAYER_COLORS[1]} />
    </svg>
  );
}
