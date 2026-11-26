// Particle dunes: rows of dots riding sine waves, drifting sideways. A nod to Pineapple's wave motif.

const TILE = 360; // px; every wave repeats a whole number of times per tile, so tiles join seamlessly
const TILES = 12; // the strip drifts by half its width, which is a whole number of tiles: no seam
const STEP = 9;
const HEIGHT = 170;

const ROWS = Array.from({ length: 9 }, (_, i) => ({
  y: 26 + i * 15,
  amp: 10 + i * 2.2,
  waves: i % 3 === 0 ? 1 : 2,
  phase: i * 0.7,
  r: 0.9 + i * 0.22,
  opacity: 0.14 + i * 0.07,
  color: i < 5 ? "#FFCB05" : "#E8A317",
}));

const DOTS = ROWS.flatMap((row) =>
  Array.from({ length: TILE / STEP }, (_, k) => {
    const x = k * STEP;
    const y = row.y + row.amp * Math.sin((x / TILE) * Math.PI * 2 * row.waves + row.phase);
    return { x, y: Math.round(y * 10) / 10, r: row.r, o: Math.round(row.opacity * 100) / 100, c: row.color };
  }),
);

export default function Dunes({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none overflow-hidden ${className}`}>
      <svg className="animate-wave-drift block" width={TILE * TILES} height={HEIGHT}>
        <defs>
          <pattern id="vs-dunes" width={TILE} height={HEIGHT} patternUnits="userSpaceOnUse">
            {DOTS.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.c} opacity={d.o} />
            ))}
          </pattern>
        </defs>
        <rect width={TILE * TILES} height={HEIGHT} fill="url(#vs-dunes)" />
      </svg>
    </div>
  );
}
