// Dotted sand dunes drifting along the bottom of the page: a nod to Pineapple's particle dunes.
// Each row is a wavy path drawn as round dots (zero-length dashes); the tile repeats twice so
// sliding it left by half loops seamlessly.

const TILE = 1440;
const HEIGHT = 190;

interface Row {
  d: string;
  gap: number;
  size: number;
  opacity: number;
  color: string;
}

function rowPath(r: number, rows: number): Row {
  const t = r / (rows - 1);
  const base = 34 + t * (HEIGHT - 52);
  const amp = 5 + 12 * t;
  // Whole numbers of periods per tile keep the seam invisible.
  const k1 = [2, 3, 2, 1, 2, 3, 2, 1, 2][r % 9];
  const k2 = [5, 4, 6, 5, 3, 5, 4, 6, 5][r % 9];
  const p1 = r * 1.3;
  const p2 = r * 0.7 + 1;
  const pts: string[] = [];
  for (let x = 0; x <= TILE * 2; x += 12) {
    const a = (2 * Math.PI * x) / TILE;
    const y = base + amp * Math.sin(k1 * a + p1) + amp * 0.35 * Math.sin(k2 * a + p2);
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return {
    d: `M${pts.join("L")}`,
    gap: 11 - 4 * t,
    size: 1.5 + 2 * t,
    opacity: 0.16 + 0.5 * t,
    color: t > 0.6 ? "var(--gold)" : "var(--maize)",
  };
}

const ROWS = Array.from({ length: 9 }, (_, r) => rowPath(r, 9));
const BACK = ROWS.slice(0, 5);
const FRONT = ROWS.slice(5);

function Layer({ rows, duration }: { rows: Row[]; duration: string }) {
  return (
    <svg
      viewBox={`0 0 ${TILE * 2} ${HEIGHT}`}
      width={TILE * 2}
      height={HEIGHT}
      className="animate-wave-drift absolute bottom-0 left-0 max-w-none"
      style={{ animationDuration: duration }}
    >
      {rows.map((row, i) => (
        <path
          key={i}
          d={row.d}
          fill="none"
          stroke={row.color}
          strokeOpacity={row.opacity}
          strokeWidth={row.size}
          strokeLinecap="round"
          strokeDasharray={`0 ${row.gap.toFixed(1)}`}
        />
      ))}
    </svg>
  );
}

export default function Dunes({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_45%)] ${className}`}
      style={{ height: HEIGHT }}
    >
      <Layer rows={BACK} duration="90s" />
      <Layer rows={FRONT} duration="48s" />
    </div>
  );
}
