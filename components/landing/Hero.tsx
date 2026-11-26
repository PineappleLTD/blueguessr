"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Flag, Images, Play, Swords, Target, Trophy, Users, type LucideIcon } from "lucide-react";
import type { RotatingEarthHandle } from "@/components/ui/wireframe-dotted-globe";
import { BULLSEYE_METERS, ROUNDS_PER_GAME, VERSUS_MAX_PLAYERS } from "@/lib/scoring";
import ParticleDunes from "./ParticleDunes";
import Wordmark from "./Wordmark";

const RotatingEarth = dynamic(() => import("@/components/ui/wireframe-dotted-globe"), { ssr: false });

/** Ann Arbor, [lng, lat]. */
const ANN_ARBOR: [number, number] = [-83.7382, 42.278];
/** Starts with Michigan just left of centre; the slow spin carries it across. */
const START_ROTATION: [number, number] = [58, -26];
/** How long PLAY's dive into Ann Arbor runs before the game page takes over. */
const LAUNCH_MS = 820;

interface Stat {
  icon: LucideIcon;
  value: ReactNode;
  label: string;
}

export default function Hero({ photoCount, header }: { photoCount: number; header?: ReactNode }) {
  const router = useRouter();
  const globeRef = useRef<RotatingEarthHandle>(null);
  const launchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [launching, setLaunching] = useState(false);

  // This page stays mounted (hidden) after navigating away; come back to it fresh.
  useLayoutEffect(
    () => () => {
      clearTimeout(launchTimer.current);
      setLaunching(false);
    },
    [],
  );

  // PLAY: spin the globe to Ann Arbor and dive in, then hand over to the game.
  const launch = (e: { preventDefault(): void }) => {
    if (launching) {
      e.preventDefault();
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    e.preventDefault();
    setLaunching(true);
    void globeRef.current?.flyTo(ANN_ARBOR, { duration: 620 });
    launchTimer.current = setTimeout(() => router.push("/play"), LAUNCH_MS);
  };

  const stats: Stat[] = [
    ...(photoCount > 0 ? [{ icon: Images, value: photoCount, label: "photos" }] : []),
    { icon: Flag, value: ROUNDS_PER_GAME, label: "rounds" },
    { icon: Target, value: `${BULLSEYE_METERS} m`, label: "bullseye" },
    { icon: Users, value: VERSUS_MAX_PLAYERS, label: "players" },
  ];

  return (
    <section className="lp-hero" data-launch={launching || undefined}>
      <div className="lp-sky" aria-hidden />
      {header}

      <div className="lp-stage">
        <div className="lp-globe" aria-hidden>
          <div className="lp-globe-spin">
            <RotatingEarth
              ref={globeRef}
              fill
              dataUrl="/geo/ne_110m_land.json"
              oceanColor="#00274C"
              strokeColor="#FFCB05"
              dotColor="#E8A317"
              marker={ANN_ARBOR}
              markerColor="#FFCB05"
              initialRotation={START_ROTATION}
              rotationSpeed={0.07}
              showHint={false}
              zoomable={false}
            />
          </div>
        </div>

        <div className="lp-ui">
          <h1 className="lp-title">
            <span className="sr-only">BlueGuessr</span>
            <Wordmark />
          </h1>

          <ul className="lp-chips" aria-label="Game facts">
            {stats.map(({ icon: Icon, value, label }, i) => (
              <li key={label} className="lp-chip" style={{ "--i": i } as React.CSSProperties}>
                <Icon className="size-4 text-maize/70" strokeWidth={2.5} aria-hidden />
                <b>{value}</b>
                <span>{label}</span>
              </li>
            ))}
          </ul>

          <div className="lp-ctas">
            <Link href="/play" onNavigate={launch} className="btn-game lp-play">
              <Play className="size-[0.9em]" fill="currentColor" strokeWidth={2.5} aria-hidden />
              Play
            </Link>
            <Link href="/versus" className="btn-game btn-game-blue lp-versus">
              <Swords className="size-[0.85em]" strokeWidth={2.75} aria-hidden />
              Versus
            </Link>
          </div>

          <div className="lp-minor">
            <Link href="/leaderboard" className="lp-minor-btn">
              <Trophy className="size-[1.1em]" strokeWidth={2.5} aria-hidden />
              Leaderboard
            </Link>
            <Link href="/contribute" className="lp-minor-btn">
              <Camera className="size-[1.1em]" strokeWidth={2.5} aria-hidden />
              Contribute
            </Link>
          </div>
        </div>
      </div>

      <ParticleDunes className="lp-dunes" />
      <div className="lp-flash" aria-hidden />
    </section>
  );
}
