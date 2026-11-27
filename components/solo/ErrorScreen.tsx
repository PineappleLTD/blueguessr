"use client";

import Link from "next/link";
import { CameraOff, Hourglass, RotateCcw, Unplug, type LucideIcon } from "lucide-react";
import DotDunes from "./DotDunes";

export type ErrorKind = "no-photos" | "rate-limited" | "expired" | "network" | "server";

const COPY: Record<ErrorKind, { title: string; icon: LucideIcon; retry: string }> = {
  "no-photos": { title: "No photos yet", icon: CameraOff, retry: "Try again" },
  "rate-limited": { title: "Slow down!", icon: Hourglass, retry: "Try again" },
  expired: { title: "Game expired", icon: Hourglass, retry: "New game" },
  network: { title: "Connection lost", icon: Unplug, retry: "Try again" },
  server: { title: "Something broke", icon: Unplug, retry: "Try again" },
};

/** Friendly dead end: big icon, heading, and a way out. */
export default function ErrorScreen({ kind, onRetry }: { kind: ErrorKind; onRetry: () => void }) {
  const { title, icon: Icon, retry } = COPY[kind];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-night px-6">
      <div className="absolute inset-x-0 bottom-0 h-[42%] opacity-60">
        <DotDunes rows={8} speed={0.6} />
      </div>
      <div className="relative flex flex-col items-center gap-6 text-center">
        <div className="animate-float grid size-28 place-items-center rounded-[2rem] border-2 border-maize/40 bg-mblue shadow-[0_20px_50px_rgba(0,0,0,.45)]">
          <Icon className="size-14 text-maize" strokeWidth={1.8} />
        </div>
        <h1 className="text-display animate-pop text-6xl text-maize-gradient sm:text-7xl">{title}</h1>
        <div className="flex flex-wrap justify-center gap-3">
          {kind !== "no-photos" && (
            <button type="button" className="btn-game" onClick={onRetry}>
              <RotateCcw className="size-5" strokeWidth={2.6} />
              {retry}
            </button>
          )}
          <Link href="/" className="btn-game btn-game-blue">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
