/** Small halftone pineapple, a nod to Pineapple (pineapplehacks.com), who make BlueGuessr. */
export default function PineappleGlyph({ className = "" }: { className?: string }) {
  const eyes: [number, number][] = [
    [9.6, 14.6], [14.4, 14.6],
    [7.2, 17.8], [12, 17.8], [16.8, 17.8],
    [9.6, 21], [14.4, 21],
    [7.2, 24.2], [12, 24.2], [16.8, 24.2],
    [9.6, 27.3], [14.4, 27.3],
  ];
  return (
    <svg viewBox="0 0 24 32" className={className} aria-hidden="true" focusable="false">
      <g fill="#5FCB7A">
        <path d="M12 .6c1.7 2.8 2.3 6.2 1.5 9.7h-3C9.7 6.8 10.3 3.4 12 .6z" />
        <path d="M3.6 3.4c3.6 1 6.4 3.3 7.8 6.7l-2.4 1C7 9 5.1 6.5 3.6 3.4z" />
        <path d="M20.4 3.4c-3.6 1-6.4 3.3-7.8 6.7l2.4 1c2-2.1 3.9-4.6 5.4-7.7z" />
      </g>
      <ellipse cx="12" cy="20.8" rx="7.6" ry="9.8" fill="#FFCB05" />
      <path d="M12 11c4.2 0 7.6 4.4 7.6 9.8s-3.4 9.8-7.6 9.8c2.6-1.6 4.4-5.4 4.4-9.8S14.6 12.6 12 11z" fill="#E8A317" />
      <g fill="#00274C">
        {eyes.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.05" />
        ))}
      </g>
    </svg>
  );
}
