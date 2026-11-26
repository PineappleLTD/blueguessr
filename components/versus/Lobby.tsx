"use client";

import { Check, Copy, Eye, Loader2, LogOut, Plus, Share2, Swords } from "lucide-react";
import { useState } from "react";
import { Avatar, colorOf, Dots, Tag } from "./bits";
import Dunes from "./Dunes";
import type { RoomSync } from "./hooks";
import type { RoomError, RoomView } from "./types";
import VersusStyles from "./VersusStyles";
import Footer from "@/components/site/Footer";

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
    const r = await act("start");
    if (!r.ok) {
      setError(r.error ?? "busy");
      setStarting(false);
    }
  };

  return (
    <>
      {header}
      <VersusStyles />
      <main className="relative flex flex-1 flex-col items-center overflow-hidden px-4 pt-2 pb-44 sm:pt-4">
        <p className="font-display text-xl font-extrabold italic uppercase text-maize/70">Room</p>
        <h1 className="sr-only">Room {view.code}</h1>
        <div className="mt-1 flex gap-2 sm:gap-3" aria-hidden>
          {view.code.split("").map((c, i) => (
            <span
              key={i}
              className="vs-tile-in grid h-[4.6rem] w-[3.7rem] place-items-center rounded-2xl border-2 border-maize/60 bg-gradient-to-b from-mblue to-mblue-deep font-display text-[3.4rem] leading-none font-black italic text-maize shadow-[0_6px_0_var(--mblue-deep),0_14px_30px_rgb(0_0_0/0.45)] sm:h-28 sm:w-[5.6rem] sm:text-[5.2rem]"
              style={{ animationDelay: `${i * 70}ms`, ["--tilt" as string]: `${(i % 2 ? 1 : -1) * (2 + (i % 3))}deg` }}
            >
              {c}
            </span>
          ))}
        </div>

        <div className="mt-6 flex w-full max-w-md gap-3">
          <button type="button" onClick={copy} className="btn-game btn-game-blue flex-1 px-4 text-xl">
            {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
            {copied ? "Copied" : "Copy link"}
          </button>
          {canShare && (
            <button type="button" onClick={share} className="btn-game btn-game-blue flex-1 px-4 text-xl">
              <Share2 className="size-5" />
              Share
            </button>
          )}
        </div>

        <section className="panel vs-rise mt-8 w-full max-w-2xl p-4 sm:p-6" style={{ animationDelay: "150ms" }}>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-display text-3xl text-maize">Players</h2>
            <span className="font-display text-2xl font-extrabold italic text-maize/80 tabular-nums">
              {view.players.length}/{view.maxPlayers}
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
            {slots.map((p, i) =>
              p ? (
                <li
                  key={p.pid}
                  className={`vs-rise relative flex min-w-0 items-center gap-2.5 rounded-2xl border-2 bg-mblue/60 py-2.5 pr-2 pl-2.5 ${p.online ? "" : "opacity-60"}`}
                  style={{ borderColor: colorOf(p.color), boxShadow: p.me ? `0 0 0 3px ${colorOf(p.color)}33` : undefined }}
                >
                  <Avatar name={p.name} color={p.color} size={38} host={p.host} dim={!p.online} />
                  <span className="min-w-0">
                    <span className="block truncate font-display text-xl leading-tight font-extrabold italic uppercase">{p.name}</span>
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
                  className="grid min-h-[62px] place-items-center rounded-2xl border-2 border-dashed border-maize/15 text-maize/25"
                >
                  <Plus className="size-6" />
                </li>
              ),
            )}
          </ul>
          {view.watchers.length > 0 && (
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground/60">
              <Eye className="size-4 text-maize/60" aria-label="Watching" />
              {view.watchers.map((w) => (
                <span key={w.pid} className={w.me ? "font-semibold text-maize" : ""}>
                  {w.name}
                </span>
              ))}
            </p>
          )}
        </section>

        <div className="mt-8 flex w-full max-w-md flex-col items-center gap-4">
          {me.host ? (
            <>
              <button
                type="button"
                onClick={start}
                disabled={!view.canStart || starting}
                className={`btn-game w-full py-5 text-3xl ${view.canStart && !starting ? "vs-glow" : ""}`}
              >
                {starting ? <Loader2 className="size-7 animate-spin" /> : <Swords className="size-7" />}
                {view.players.length < 2 ? "Need 2 players" : "Start"}
              </button>
              {error && (
                <p className="font-display text-lg font-bold italic uppercase text-destructive">{START_ERRORS[error] ?? "Try again"}</p>
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
