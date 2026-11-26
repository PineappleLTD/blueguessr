// Layered drifting waves: the shoreline under Pineapple's beach (pineapplehacks.com).
// Each SVG is twice the container's width and repeats exactly once, so `animate-wave-drift`
// (translateX 0 -> -50%) loops seamlessly.

const W = 2400;
const H = 120;

const fmt = ([x, y]: [number, number]) => `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;

/** Closed wave shape: a smooth crest line along the top, filled down to the bottom edge. */
function wavePath(base: number, amp: number, crests: number, phase: number, closed = true): string {
  const half = W / 2;
  const n = crests * 2 * 8; // 8 samples per crest
  const pts: [number, number][] = [];
  for (let i = -1; i <= n + 1; i++) {
    const x = (i / n) * W;
    const t = (x / half) * crests * Math.PI * 2 + phase;
    pts.push([x, base - amp * (Math.sin(t) + 0.3 * Math.sin(2 * t + 1.3))]);
  }
  // Catmull-Rom through the samples, as cubic Béziers.
  let d = closed ? `M0 ${H}L${fmt(pts[1])}` : `M${fmt(pts[1])}`;
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${fmt(c1)} ${fmt(c2)} ${fmt(p2)}`;
  }
  return closed ? `${d}L${W} ${H}Z` : d;
}

const LAYERS = [
  { d: wavePath(52, 15, 2, 0), fill: "var(--mblue)", opacity: 0.7, seconds: 31, reverse: false },
  { d: wavePath(70, 12, 3, 1.4), fill: "oklch(0.21 0.06 258)", opacity: 1, seconds: 22, reverse: true },
  { d: wavePath(88, 10, 2, 2.6), fill: "var(--mblue-deep)", opacity: 1, seconds: 15, reverse: false },
];
const FOAM = wavePath(52, 15, 2, 0, false);

export default function Waves({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none relative h-14 overflow-hidden sm:h-20 ${className}`}>
      {LAYERS.map((layer, i) => (
        <svg
          key={i}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="animate-wave-drift absolute inset-y-0 left-0 h-full w-[200%] will-change-transform"
          style={{ animationDuration: `${layer.seconds}s`, animationDirection: layer.reverse ? "reverse" : "normal" }}
        >
          <path d={layer.d} fill={layer.fill} fillOpacity={layer.opacity} />
          {i === 0 && (
            <path
              d={FOAM}
              fill="none"
              stroke="var(--maize)"
              strokeOpacity={0.45}
              strokeWidth={2}
              strokeDasharray="1 7"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      ))}
    </div>
  );
}
