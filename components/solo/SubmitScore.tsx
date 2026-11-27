"use client";

import Link from "next/link";
import { LoaderCircle, Send, Sparkles, Trophy } from "lucide-react";
import { useState } from "react";
import { NAME_MAX, NAME_PATTERN, setPlayerName } from "@/lib/player";
import { ApiFailure, safePlayer, soloApi, type SubmitResult } from "./api";

const ERRORS: Record<string, string> = {
  "bad-name": "2–20 letters, numbers, spaces, . _ -",
  "name-taken": "Name taken",
  "already-submitted": "Already posted",
  "not-yours": "Not your game",
  "not-found": "Game expired",
  "not-finished": "Finish all 5 rounds",
  network: "Offline — try again",
};

/** Post a finished game to the ranked leaderboard under the player's name. */
export default function SubmitScore({ gameId, onPosted }: { gameId: string; onPosted?: (r: SubmitResult) => void }) {
  // Only rendered after a game finishes in the browser, so reading storage here is safe.
  const [name, setName] = useState(() => safePlayer()?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<SubmitResult | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim().replace(/\s+/g, " ");
    if (!NAME_PATTERN.test(clean)) return setError(ERRORS["bad-name"]);
    const player = safePlayer();
    if (!player) return setError("Storage blocked");
    setBusy(true);
    setError(null);
    try {
      const r = await soloApi.submit(gameId, player.id, clean);
      try {
        setPlayerName(r.name);
      } catch {}
      setPosted(r);
      onPosted?.(r);
    } catch (err) {
      const code = err instanceof ApiFailure ? err.code : "network";
      setError(ERRORS[code] ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  if (posted) {
    return (
      <div className="panel sg-up flex items-center gap-4 p-4">
        <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-b from-maize-soft via-maize to-gold text-mblue shadow-[0_5px_0_var(--gold-deep)]">
          <Trophy className="size-8" strokeWidth={2.4} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-display text-5xl text-maize-gradient tabular-nums">#{posted.dayRank}</span>
            {posted.newBest && (
              <span className="text-display sg-stamp inline-flex items-center gap-1 rounded-lg bg-maize px-2 py-0.5 text-lg text-mblue">
                <Sparkles className="size-4" strokeWidth={2.6} />
                New best
              </span>
            )}
          </div>
          <div className="text-display mt-1 flex flex-wrap gap-x-4 text-base text-maize-soft/70">
            <span>
              All time <span className="text-maize tabular-nums">#{posted.rank}</span>
            </span>
            <span>
              Best <span className="text-maize tabular-nums">{posted.best.toLocaleString("en-US")}</span>
            </span>
          </div>
        </div>
        <Link href="/leaderboard" className="btn-game btn-game-blue shrink-0 px-4 py-3 text-lg">
          <Trophy className="size-4.5" strokeWidth={2.6} />
          <span className="hidden sm:inline">Board</span>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="panel p-4">
      <label htmlFor="lb-name" className="text-display mb-2 flex items-center gap-2 text-xl text-maize">
        <Trophy className="size-5" strokeWidth={2.6} />
        Leaderboard
      </label>
      <div className="flex gap-2.5">
        <input
          id="lb-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          maxLength={NAME_MAX}
          autoComplete="nickname"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
          placeholder="Your name"
          aria-invalid={!!error}
          aria-describedby={error ? "lb-error" : undefined}
          className="min-w-0 flex-1 rounded-xl border-2 border-maize/30 bg-night/70 px-3.5 py-2.5 text-lg font-bold text-foreground outline-none placeholder:text-foreground/35 focus:border-maize aria-invalid:border-destructive"
        />
        <button type="submit" disabled={busy || !name.trim()} className="btn-game shrink-0 px-5 py-3 text-xl">
          {busy ? <LoaderCircle className="size-5 animate-spin" strokeWidth={3} /> : <Send className="size-5" strokeWidth={2.6} />}
          Submit
        </button>
      </div>
      {error && (
        <p id="lb-error" role="alert" className="mt-2 text-sm font-semibold text-[oklch(0.75_0.17_30)]">
          {error}
        </p>
      )}
    </form>
  );
}
