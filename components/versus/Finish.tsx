"use client";

import { Crown, Loader2, LogOut, RotateCcw, Skull, Target } from "lucide-react";
import { useState } from "react";
import { GOLD, MAIZE } from "@/components/game/GuessMap";
import { Avatar, colorOf, Dots, fmt, Tag } from "./bits";
import Confetti from "./Confetti";
import Dunes from "./Dunes";
import type { RoomSync } from "./hooks";
import type { RoomError, RoomView } from "./types";
import VersusStyles from "./VersusStyles";
import Footer from "@/components/site/Footer";

const REMATCH_ERRORS: Partial<Record<RoomError, string>> = {
  need_players: "Need 2 players",
  not_host: "Host only",
  no_photos: "No photos yet",
};

export default function Finish({
  view,
  act,
  onLeave,
  header,
}: {
  view: RoomView;
  act: RoomSync["act"];
  onLeave: () => void;
  header: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RoomError | null>(null);
  const result = view.result;
  const winner = result?.standings.find((s) => s.winner) ?? null;
  const me = view.me!;
  const confettiColors = winner ? [colorOf(winner.color), MAIZE, GOLD, "#ffffff"] : [MAIZE, GOLD, "#4FC3F7", "#ffffff"];

  const rematch = async () => {
    setBusy(true);
    setError(null);
    const r = await act("rematch");
    if (!r.ok) {
      setError(r.error ?? "busy");
      setBusy(false);
    }
  };

  return (
    <>
      {header}
      <VersusStyles />
      <Confetti className="fixed inset-0 z-40 h-full w-full" colors={confettiColors} burstKey={`${view.code}-${view.game}`} />
      <main className="relative flex flex-1 flex-col items-center overflow-hidden px-4 pt-2 pb-44 sm:pt-6">
        {winner ? (
          <div className="flex flex-col items-center text-center">
            <p className="vs-rise font-display text-2xl font-extrabold italic uppercase tracking-wide text-maize/80">
              {winner.pid === me.pid ? "You win" : "Winner"}
            </p>
            <div className="vs-slam relative mt-4" style={{ animationDelay: "120ms" }}>
              <Avatar name={winner.name} color={winner.color} size={112} />
              <Crown className="absolute -top-14 left-1/2 size-20 -translate-x-1/2 -rotate-6 fill-maize text-gold-deep drop-shadow-[0_4px_0_rgb(0_0_0/0.35)]" />
            </div>
            <h1
              className="vs-slam mt-4 max-w-[92vw] truncate text-display text-[clamp(3.6rem,15vw,7.5rem)]"
              style={{
                color: colorOf(winner.color),
                filter: "drop-shadow(0 5px 0 rgb(0 0 0 / 0.45))",
                animationDelay: "220ms",
              }}
            >
              {winner.name}
            </h1>
          </div>
        ) : (
          <h1 className="vs-slam mt-10 text-display text-[clamp(4.5rem,18vw,8rem)] text-maize-gradient">Draw</h1>
        )}

        {result && (
          <ol className="vs-rise mt-8 w-full max-w-xl space-y-2" style={{ animationDelay: "400ms" }}>
            {result.standings.map((s) => (
              <li
                key={s.pid}
                className={`flex items-center gap-3 rounded-2xl border-2 bg-mblue/55 px-3 py-2.5 ${s.winner ? "border-maize bg-mblue" : "border-transparent"}`}
                style={s.pid === me.pid ? { boxShadow: `0 0 0 3px ${colorOf(s.color)}44` } : undefined}
              >
                <span className="w-7 text-center font-display text-3xl font-black italic text-maize/80 tabular-nums">{s.rank}</span>
                <Avatar name={s.name} color={s.color} size={36} dim={!!s.out && !s.winner} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-2xl leading-tight font-extrabold italic uppercase">{s.name}</span>
                  <span className="flex flex-wrap gap-1">
                    {s.out === "ko" && (
                      <Tag className="bg-destructive/25 text-destructive-foreground">
                        <Skull className="size-3" /> KO R{s.outRound}
                      </Tag>
                    )}
                    {s.out === "left" && <Tag className="bg-foreground/10 text-foreground/60">Left</Tag>}
                    {s.bullseyes > 0 && (
                      <Tag className="bg-maize/15 text-maize">
                        <Target className="size-3" /> {s.bullseyes}
                      </Tag>
                    )}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-display text-2xl leading-none font-extrabold italic tabular-nums">{fmt(s.totalScore)}</span>
                  <span className="font-display text-sm font-bold italic uppercase text-foreground/50 tabular-nums">
                    {s.out ? "0 HP" : `${fmt(s.hp)} HP`}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-8 flex w-full max-w-md flex-col items-center gap-4">
          {me.host ? (
            <>
              <button
                type="button"
                onClick={rematch}
                disabled={busy || !view.canRematch}
                className={`btn-game w-full py-5 text-3xl ${view.canRematch && !busy ? "vs-glow" : ""}`}
              >
                {busy ? <Loader2 className="size-7 animate-spin" /> : <RotateCcw className="size-7" />}
                {view.canRematch ? "Rematch" : "Need 2 players"}
              </button>
              {error && (
                <p className="font-display text-lg font-bold italic uppercase text-destructive">{REMATCH_ERRORS[error] ?? "Try again"}</p>
              )}
            </>
          ) : (
            <p className="flex items-center gap-3 rounded-full border border-maize/25 bg-mblue/50 px-6 py-4 font-display text-2xl font-extrabold italic uppercase text-maize">
              Waiting for host <Dots />
            </p>
          )}
          <button
            type="button"
            onClick={onLeave}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-display text-lg font-bold italic uppercase text-foreground/55 transition hover:bg-maize/10 hover:text-maize"
          >
            <LogOut className="size-4" />
            Leave
          </button>
        </div>
        <Dunes className="absolute inset-x-0 bottom-0" />
      </main>
      <Footer waves={false} solid={false} className="relative z-10" />
    </>
  );
}
