"use client";

import { Check, Copy, Eye, Loader2, LogOut, Plus, Share2, Swords, Timer } from "lucide-react";
import { useState } from "react";
import MapOptions from "@/components/game/MapOptions";
import Screen from "@/components/site/Screen";
import { VERSUS_ROUND_OPTIONS } from "@/lib/scoring";
import { Avatar, colorOf, Dots, Tag } from "./bits";
import type { RoomSync } from "./hooks";
import type { RoomError, RoomView } from "./types";
import VersusStyles from "./VersusStyles";

const START_ERRORS: Partial<Record<RoomError, string>> = {
  need_players: "Need 2 players",
  not_host: "Host only",
  no_photos: "No photos yet",
};

function roomUrl(code: string) {
  return `${window.location.origin}/versus/${code}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure origins: the select-and-copy fallback.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export default function Lobby({
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
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<RoomError | null>(null);
  const [seconds, setSeconds] = useState(view.roundSeconds);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const me = view.me!;
  const slots = Array.from({ length: view.maxPlayers }, (_, i) => view.players[i] ?? null);

  const copy = async () => {
    if (await copyText(roomUrl(view.code))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: "BlueGuessr Versus", text: `Room ${view.code}`, url: roomUrl(view.code) });
    } catch {}
  };
  const start = async () => {
    setStarting(true);
    setError(null);
    const r = await act("start", { roundSeconds: seconds });
    if (!r.ok) {
      setError(r.error ?? "busy");
      setStarting(false);
    }
  };

  return (
    <Screen header={header} className="items-center justify-center px-4 pb-[6svh]">
      <VersusStyles />
        <p className="font-display text-lg font-extrabold italic uppercase text-maize/70">Room</p>
        <h1 className="sr-only">Room {view.code}</h1>
        <div className="mt-1 flex gap-2 sm:gap-3" aria-hidden>
          {view.code.split("").map((c, i) => (
            <span
              key={i}
              className="vs-tile-in grid h-14 w-11 place-items-center rounded-xl border-2 border-maize/60 bg-gradient-to-b from-mblue to-mblue-deep font-display text-[2.6rem] leading-none font-black italic text-maize shadow-[0_5px_0_var(--mblue-deep),0_12px_26px_rgb(0_0_0/0.45)] sm:h-20 sm:w-16 sm:rounded-2xl sm:text-6xl"
              style={{ animationDelay: `${i * 70}ms`, ["--tilt" as string]: `${(i % 2 ? 1 : -1) * (2 + (i % 3))}deg` }}
            >
              {c}
            </span>
          ))}
        </div>

        <div className="mt-4 flex w-full max-w-md gap-3">
          <button type="button" onClick={copy} className="btn-game btn-game-blue flex-1 px-4 py-2.5 text-lg">
            {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
            {copied ? "Copied" : "Copy link"}
          </button>
          {canShare && (
            <button type="button" onClick={share} className="btn-game btn-game-blue flex-1 px-4 py-2.5 text-lg">
              <Share2 className="size-5" />
              Share
            </button>
          )}
        </div>

        <section className="panel vs-rise mt-4 w-full max-w-2xl p-3 sm:p-4" style={{ animationDelay: "150ms" }}>
          <div className="mb-2.5 flex items-baseline justify-between">
            <h2 className="text-display text-2xl text-maize">Players</h2>
            <span className="font-display text-xl font-extrabold italic text-maize/80 tabular-nums">
              {view.players.length}/{view.maxPlayers}
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {slots.map((p, i) =>
              p ? (
                <li
                  key={p.pid}
                  className={`vs-rise relative flex min-w-0 items-center gap-2 rounded-xl border-2 bg-mblue/60 py-1.5 pr-2 pl-2 ${p.online ? "" : "opacity-60"}`}
                  style={{ borderColor: colorOf(p.color), boxShadow: p.me ? `0 0 0 3px ${colorOf(p.color)}33` : undefined }}
                >
                  <Avatar name={p.name} color={p.color} size={32} host={p.host} dim={!p.online} />
                  <span className="min-w-0">
                    <span className="block truncate font-display text-lg leading-tight font-extrabold italic uppercase">{p.name}</span>
                    <span className="flex gap-1">
                      {p.host && <Tag className="bg-maize px-1.5 text-mblue">Host</Tag>}
                      {p.me && (
                        <Tag className="px-1.5 text-mblue" style={{ background: colorOf(p.color) }}>
                          You
                        </Tag>
                      )}
                    </span>
                  </span>
                </li>
              ) : (
                <li
                  key={`open-${i}`}
                  className="grid min-h-[50px] place-items-center rounded-xl border-2 border-dashed border-maize/15 text-maize/25"
                >
                  <Plus className="size-5" />
                </li>
              ),
            )}
          </ul>
          {view.watchers.length > 0 && (
            <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground/60">
              <Eye className="size-4 text-maize/60" aria-label="Watching" />
              {view.watchers.map((w) => (
                <span key={w.pid} className={w.me ? "font-semibold text-maize" : ""}>
                  {w.name}
                </span>
              ))}
            </p>
          )}
        </section>

        <MapOptions className="mt-4" align="center" />

        <div className="mt-4 flex w-full max-w-md flex-col items-center gap-3">
          {me.host ? (
            <>
              <div role="radiogroup" aria-label="Round time" className="flex items-center gap-1 rounded-2xl border border-maize/25 bg-night/70 p-1">
                <Timer className="mx-1.5 size-4.5 text-maize/70" strokeWidth={2.6} aria-hidden />
                {VERSUS_ROUND_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={seconds === n}
                    onClick={() => setSeconds(n)}
                    className={`text-display rounded-xl px-3 py-1.5 text-lg tabular-nums transition ${
                      seconds === n
                        ? "bg-gradient-to-b from-maize-soft via-maize to-gold text-mblue shadow-[0_3px_0_var(--gold-deep)]"
                        : "text-maize-soft/70 hover:bg-maize/10 hover:text-maize"
                    }`}
                  >
                    {n}s
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={start}
                disabled={!view.canStart || starting}
                className={`btn-game w-full py-4 text-3xl ${view.canStart && !starting ? "vs-glow" : ""}`}
              >
                {starting ? <Loader2 className="size-7 animate-spin" /> : <Swords className="size-7" />}
                {view.players.length < 2 ? "Need 2 players" : "Start"}
              </button>
              {error && (
                <p className="font-display text-lg font-bold italic uppercase text-destructive">{START_ERRORS[error] ?? "Try again"}</p>
              )}
            </>
          ) : (
            <p className="flex items-center gap-3 rounded-full border border-maize/25 bg-mblue/50 px-6 py-3 font-display text-2xl font-extrabold italic uppercase text-maize">
              Waiting for host <Dots />
            </p>
          )}
          <button
            type="button"
            onClick={onLeave}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 font-display text-lg font-bold italic uppercase text-foreground/55 transition hover:bg-maize/10 hover:text-maize"
          >
            <LogOut className="size-4" />
            Leave
          </button>
        </div>
    </Screen>
  );
}
