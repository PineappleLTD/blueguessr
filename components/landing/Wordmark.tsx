import type { CSSProperties } from "react";

const LETTERS = "BLUEGUESSR".split("");

/**
 * The BLUEGUESSR title: extruded maize letters that drop in one by one, then catch a glint.
 * Sized by the parent's font-size. Purely visual; the parent heading carries the accessible name.
 */
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`lp-wordmark ${className}`}>
      {LETTERS.map((ch, i) => (
        <span key={i} className="lp-wm-letter" style={{ "--i": i } as CSSProperties}>
          {ch}
        </span>
      ))}
    </span>
  );
}
