"use client";

import "./solo.css";
import Link from "next/link";
import { CalendarDays, Crown, Gamepad2, RotateCcw, Target, Trophy, Users } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { safePlayer, soloApi, type LeaderboardData, type LeaderboardEntry, type Period } from "./api";
import { fmt } from "./hooks";

const TABS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "all", label: "All time" },
];

const MEDALS = [
  { ring: "#FFCB05", from: "#FFE89A", via: "#FFCB05", to: "#C98E0A", ink: "#00274C", height: "h-28 sm:h-36" },
  { ring: "#C9D4E2", from: "#F4F7FB", via: "#C9D4E2", to: "#8696AB", ink: "#00274C", height: "h-20 sm:h-28" },
  { ring: "#E39B5B", from: "#F6C79B", via: "#E39B5B", to: "#A35A22", ink: "#00274C", height: "h-14 sm:h-20" },
];

// ---- tiny external stores: the local player's name and the ?period= tab ----

const noop = () => () => {};
const localName = () => safePlayer()?.name ?? "";

const PERIOD_EVENT = "blueguessr:period";
function subscribePeriod(cb: () => void) {
  window.addEventListener("popstate", cb);
  window.addEventListener(PERIOD_EVENT, cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener(PERIOD_EVENT, cb);
  };
}
const urlPeriod = (): Period => (new URLSearchParams(window.location.search).get("period") === "all" ? "all" : "today");
function choosePeriod(p: Period) {
  const url = new URL(window.location.href);
  if (p === "all") url.searchParams.set("period", "all");
  else url.searchParams.delete("period");
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(PERIOD_EVENT));
}

const same = (a: string, b: string) => !!a && a.toLowerCase() === b.toLowerCase();

function Avatar({ name, ring, size = "size-14" }: { name?: string; ring: string; size?: string }) {
  return (
    <span
      className={`text-display grid ${size} place-items-center rounded-full bg-mblue text-3xl text-maize`}
      style={{ boxShadow: `0 0 0 3px ${ring}, 0 8px 20px rgba(0,0,0,.45)` }}
    >
      {name ? name.trim().charAt(0).toUpperCase() : "?"}
    </span>
  );
}

function Podium({ entries, me, loading }: { entries: LeaderboardEntry[]; me: string; loading: boolean }) {
  return (
    <div className="mx-auto mt-5 grid w-full max-w-xl shrink-0 grid-cols-3 items-end gap-2.5 sm:gap-4" aria-label="Top three">
      {[1, 0, 2].map((i) => {
        const e = entries[i];
        const m = MEDALS[i];
        const mine = e && same(me, e.name);
        return (
          <div key={i} className="flex min-w-0 flex-col items-center">
            <div
              className={`sg-up mb-3 flex w-full min-w-0 flex-col items-center gap-1.5 ${loading ? "animate-pulse" : ""}`}
              style={{ animationDelay: `${(2 - i) * 120 + 420}ms` }}
            >
              {i === 0 && (
                <Crown className="animate-float size-9 fill-maize text-gold-deep drop-shadow-[0_4px_8px_rgba(0,0,0,.5)]" strokeWidth={1.6} />
              )}
              <Avatar name={e?.name} ring={m.ring} size={i === 0 ? "size-16" : "size-14"} />
              <span
                className={`max-w-full truncate px-1 text-sm font-extrabold sm:text-base ${mine ? "text-maize" : e ? "text-foreground" : "text-foreground/35"}`}
                title={e?.name}
              >
                {e?.name ?? "—"}
              </span>
              <span className="text-display text-2xl text-maize tabular-nums sm:text-3xl">{e ? fmt(e.best) : " "}</span>
              {mine && (
                <span className="text-display rounded-md bg-maize px-1.5 text-xs text-mblue">You</span>
              )}
            </div>
            <div
              className={`sg-rise relative w-full ${m.height} rounded-t-2xl border-x-2 border-t-2 border-white/30 ${e ? "" : "opacity-35 saturate-50"}`}
              style={{
                background: `linear-gradient(180deg, ${m.from}, ${m.via} 45%, ${m.to})`,
                boxShadow: `inset 0 -18px 30px rgba(0,0,0,.18), 0 18px 40px rgba(0,0,0,.35)`,
                animationDelay: `${(2 - i) * 120}ms`,
              }}
            >
              <span className="text-display absolute inset-x-0 top-2 text-center text-5xl sm:text-6xl" style={{ color: m.ink }}>
                {i + 1}
              </span>
              <div className="sg-sheen absolute inset-0 rounded-t-2xl opacity-40" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({ e, me, delay }: { e: LeaderboardEntry; me: string; delay: number }) {
  const mine = same(me, e.name);
  return (
    <li
      className={`sg-up grid grid-cols-[2.6rem_minmax(0,1fr)_2.6rem_2.6rem_4.6rem] items-center gap-2 rounded-2xl border px-3 py-2.5 sm:grid-cols-[3rem_minmax(0,1fr)_4rem_4rem_6rem] sm:px-4 ${
        mine
          ? "border-maize bg-maize/12 shadow-[0_0_0_1px_var(--maize),0_10px_30px_oklch(0.87_0.18_93/0.18)]"
          : "border-maize/10 bg-mblue/35"
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="text-display text-2xl text-maize-soft/60 tabular-nums">{e.rank}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className={`truncate font-extrabold ${mine ? "text-maize" : ""}`}>{e.name}</span>
        {mine && <span className="text-display shrink-0 rounded-md bg-maize px-1.5 text-xs text-mblue">You</span>}
      </span>
      <span className="flex items-center justify-end gap-1 text-sm font-bold text-foreground/70 tabular-nums">
        <Target className="size-3.5 text-maize/80" strokeWidth={2.6} />
        {e.bullseyes}
      </span>
      <span className="flex items-center justify-end gap-1 text-sm font-bold text-foreground/70 tabular-nums">
        <Gamepad2 className="size-3.5 text-maize/80" strokeWidth={2.4} />
        {e.games}
      </span>
      <span className="text-display text-right text-2xl text-maize tabular-nums">{fmt(e.best)}</span>
    </li>
  );
}

/** The daily leaderboard: today / all time, podium for the top three, then the top 50. */
export default function Leaderboard() {
  const me = useSyncExternalStore(noop, localName, () => "");
  const period = useSyncExternalStore(subscribePeriod, urlPeriod, () => "today" as Period);
  const [boards, setBoards] = useState<Partial<Record<Period, LeaderboardData>>>({});
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const name = localName() || undefined;
    try {
      const [today, all] = await Promise.all([soloApi.leaderboard("today", name), soloApi.leaderboard("all", name)]);
      setBoards({ today, all });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const data = boards[period];
  const entries = data?.entries ?? [];
  const loading = !data && !failed;
  const meRow = data?.me && data.me.rank > entries.length ? data.me : null;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 pb-4 sm:px-6">
      <div className="flex shrink-0 flex-col items-center gap-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-5">
        <h1 className="text-display animate-pop flex items-center gap-3 text-[2.8rem] text-maize-gradient sm:text-6xl">
          <Trophy className="size-10 text-maize sm:size-12" strokeWidth={2.2} />
          Leaderboard
        </h1>
        <div className="flex items-center gap-3">
          <div role="tablist" aria-label="Period" className="flex rounded-2xl border border-maize/25 bg-night/70 p-1.5 shadow-lg">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={period === t.id}
                onClick={() => choosePeriod(t.id)}
                className={`text-display rounded-xl px-4 py-2 text-xl transition sm:px-5 ${
                  period === t.id
                    ? "bg-gradient-to-b from-maize-soft via-maize to-gold text-mblue shadow-[0_4px_0_var(--gold-deep)]"
                    : "text-maize-soft/70 hover:bg-maize/10 hover:text-maize"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {data && data.players > 0 && (
            <span className="text-display flex items-center gap-1.5 text-xl text-maize-soft/70 tabular-nums" title="Players">
              <Users className="size-4.5" strokeWidth={2.6} />
              {fmt(data.players)}
            </span>
          )}
        </div>
      </div>

      {failed && !data ? (
        <div className="mt-10 flex flex-col items-center gap-5">
          <p className="text-display text-4xl text-maize-soft/80">Connection lost</p>
          <button type="button" className="btn-game" onClick={() => void load()}>
            <RotateCcw className="size-5" strokeWidth={2.6} />
            Try again
          </button>
        </div>
      ) : (
        <>
          <Podium key={`podium-${period}`} entries={entries} me={me} loading={loading} />

          {data && entries.length === 0 && (
            <div className="mt-8 flex flex-col items-center gap-5">
              <p className="text-display text-4xl text-maize-soft/80">No scores yet</p>
              <Link href="/daily" className="btn-game px-10 py-4 text-3xl">
                <CalendarDays className="size-7" strokeWidth={2.4} />
                Daily
              </Link>
            </div>
          )}

          {entries.length > 3 && (
            <div key={`list-${period}`} className="mt-5 flex min-h-0 flex-1 flex-col gap-2">
              <div className="grid shrink-0 grid-cols-[2.6rem_minmax(0,1fr)_2.6rem_2.6rem_4.6rem] gap-2 px-3 text-xs font-bold tracking-wider text-foreground/45 uppercase sm:grid-cols-[3rem_minmax(0,1fr)_4rem_4rem_6rem] sm:px-4">
                <span>#</span>
                <span>Player</span>
                <span className="flex justify-end" title="Bullseyes">
                  <Target className="size-3.5" strokeWidth={2.6} aria-label="Bullseyes" />
                </span>
                <span className="flex justify-end" title="Games">
                  <Gamepad2 className="size-3.5" strokeWidth={2.4} aria-label="Games" />
                </span>
                <span className="text-right">Best</span>
              </div>
              {/* Only the rankings scroll, so the page itself always fits the screen. */}
              <ol
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1 [scrollbar-color:var(--maize)_transparent] [scrollbar-width:thin]"
                aria-label="Rankings"
              >
                {entries.slice(3).map((e, i) => (
                  <Row key={e.rank} e={e} me={me} delay={Math.min(i, 12) * 40 + 500} />
                ))}
              </ol>
            </div>
          )}

          {meRow && (
            <ol className="mt-3 shrink-0 border-t border-dashed border-maize/25 pt-3" aria-label="Your rank">
              <Row e={meRow} me={me} delay={600} />
            </ol>
          )}

          {entries.length > 0 && (
            <div className="mt-4 flex shrink-0 justify-center">
              <Link href="/daily" className="btn-game px-9 py-3 text-2xl">
                <CalendarDays className="size-7" strokeWidth={2.4} />
                Daily
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
