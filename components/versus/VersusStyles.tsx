// Versus-only motion. React 19 hoists and dedupes this <style> by href, so every screen can render it.

const CSS = `
@keyframes vs-shake {
  0%, 100% { transform: translateX(0); }
  15% { transform: translateX(-7px) rotate(-1deg); }
  30% { transform: translateX(6px) rotate(1deg); }
  45% { transform: translateX(-5px); }
  60% { transform: translateX(4px); }
  75% { transform: translateX(-2px); }
}
@keyframes vs-float-up {
  0% { transform: translate(-50%, 6px) scale(0.6); opacity: 0; }
  15% { transform: translate(-50%, -6px) scale(1.25); opacity: 1; }
  70% { opacity: 1; }
  100% { transform: translate(-50%, -46px) scale(1); opacity: 0; }
}
@keyframes vs-stamp {
  0% { transform: translate(-50%, -50%) rotate(-14deg) scale(3.2); opacity: 0; }
  55% { transform: translate(-50%, -50%) rotate(-14deg) scale(0.9); opacity: 1; }
  75% { transform: translate(-50%, -50%) rotate(-14deg) scale(1.08); }
  100% { transform: translate(-50%, -50%) rotate(-14deg) scale(1); opacity: 1; }
}
@keyframes vs-slam {
  0% { transform: scale(2.4) skewX(-8deg); opacity: 0; filter: blur(6px); }
  60% { transform: scale(0.94) skewX(-8deg); opacity: 1; filter: blur(0); }
  100% { transform: scale(1) skewX(-8deg); opacity: 1; }
}
@keyframes vs-tick {
  0% { transform: scale(1.5); opacity: 0; }
  30% { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.85); opacity: 0.85; }
}
@keyframes vs-pulse-red {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.12); }
}
@keyframes vs-rise {
  from { transform: translateY(14px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes vs-tile-in {
  0% { transform: translateY(-40px) rotate(var(--tilt, 0deg)) scale(0.5); opacity: 0; }
  70% { transform: translateY(4px) rotate(var(--tilt, 0deg)) scale(1.06); opacity: 1; }
  100% { transform: translateY(0) rotate(var(--tilt, 0deg)) scale(1); opacity: 1; }
}
@keyframes vs-glow {
  0%, 100% { box-shadow: 0 0 0 0 oklch(0.87 0.18 93 / 0.0); }
  50% { box-shadow: 0 0 0 6px oklch(0.87 0.18 93 / 0.18); }
}
@keyframes vs-dots {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
  40% { transform: translateY(-5px); opacity: 1; }
}
@keyframes vs-bar-flash {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.6) saturate(1.3); }
}
.vs-shake { animation: vs-shake 480ms cubic-bezier(.36,.07,.19,.97) both; }
.vs-float-up { animation: vs-float-up 1400ms cubic-bezier(.2,.8,.3,1) both; }
.vs-stamp { animation: vs-stamp 520ms cubic-bezier(.2,.9,.3,1.2) both; }
.vs-slam { animation: vs-slam 520ms cubic-bezier(.2,.9,.3,1.1) both; }
.vs-tick { animation: vs-tick 1000ms ease-out both; }
.vs-pulse-red { animation: vs-pulse-red 700ms ease-in-out infinite; }
.vs-rise { animation: vs-rise 420ms cubic-bezier(.2,.8,.3,1) both; }
.vs-tile-in { animation: vs-tile-in 560ms cubic-bezier(.2,.9,.3,1.25) both; }
.vs-glow { animation: vs-glow 1.6s ease-in-out infinite; }
.vs-dot { animation: vs-dots 1.2s ease-in-out infinite; }
.vs-low { animation: vs-bar-flash 900ms ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .vs-shake, .vs-float-up, .vs-slam, .vs-tick, .vs-rise, .vs-tile-in, .vs-stamp { animation-duration: 1ms; }
  .vs-pulse-red, .vs-glow, .vs-dot, .vs-low { animation: none; }
}
`;

export default function VersusStyles() {
  return (
    <style href="blueguessr-versus" precedence="default">
      {CSS}
    </style>
  );
}
