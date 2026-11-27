"use client";

import { useRef, useState } from "react";
import { normalizeRoomCode, ROOM_CODE_LENGTH } from "./types";

/** One real input under five scoreboard tiles. Accepts pasted room links too. */
export default function CodeInput({
  value,
  onChange,
  onEnter,
  invalid = false,
}: {
  value: string;
  onChange: (code: string) => void;
  onEnter?: () => void;
  invalid?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const chars = value.padEnd(ROOM_CODE_LENGTH, " ").split("");

  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        id="vs-code"
        aria-label="Room code"
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const fromLink = raw.match(/versus\/([A-Za-z0-9]{5})/)?.[1];
          onChange(normalizeRoomCode(fromLink ?? raw));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter?.();
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="go"
        maxLength={64}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />
      <div className="grid grid-cols-5 gap-2" aria-hidden>
        {chars.map((c, i) => {
          const active = focused && i === Math.min(value.length, ROOM_CODE_LENGTH - 1);
          return (
            <div
              key={i}
              className={`grid h-14 place-items-center rounded-xl border-2 font-display text-3xl font-extrabold italic transition-all duration-150 sm:h-16 sm:text-4xl ${
                invalid
                  ? "border-destructive/80 bg-destructive/10 text-destructive"
                  : active
                    ? "-translate-y-0.5 border-maize bg-mblue text-maize shadow-[0_0_0_4px_oklch(0.87_0.18_93/0.18)]"
                    : c.trim()
                      ? "border-maize/50 bg-mblue text-maize"
                      : "border-maize/15 bg-mblue-deep/70 text-maize/30"
              }`}
            >
              {c.trim() || (active ? <span className="h-7 w-1 animate-pulse rounded bg-maize/80" /> : "·")}
            </div>
          );
        })}
      </div>
    </div>
  );
}
