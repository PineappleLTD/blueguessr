/** A dotted trail of wrong turns ending at a wobbly pin. CSS-only motion, for the 404 page. */
export default function LostPin({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 260 120" className={className} aria-hidden="true" focusable="false">
      <path
        className="nf-trail"
        d="M10 104C36 64 64 118 90 90S118 26 94 36 78 84 120 86s44-40 66-14"
        fill="none"
        stroke="#FFCB05"
        strokeOpacity="0.75"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Two wrong guesses along the way. */}
      <g stroke="#E8A317" strokeWidth="3.5" strokeLinecap="round">
        <path d="M60 70l10 10m0-10l-10 10" />
        <path d="M150 46l10 10m0-10l-10 10" />
      </g>
      <g className="nf-pin">
        <path
          d="M214 26c-10.5 0-19 8.3-19 18.6C195 58.5 214 80 214 80s19-21.5 19-35.4C233 34.3 224.5 26 214 26z"
          fill="#FFCB05"
          stroke="#B57F0B"
          strokeWidth="3"
        />
        <circle cx="214" cy="44.6" r="7.2" fill="#00274C" />
      </g>
      <ellipse cx="214" cy="86" rx="13" ry="3.5" fill="#000" opacity="0.35" />
    </svg>
  );
}
