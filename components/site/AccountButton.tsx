"use client";

import { LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { getPlayer, replacePlayer, resetPlayer } from "@/lib/player";

interface AccountState {
  google: boolean;
  user: { name: string; image: string | null } | null;
}

/** Linking only needs to happen once per tab, not on every page. */
const LINKED = "blueguessr:account-linked";

/**
 * Ties this device's player to the signed-in account. On a new device the account's player
 * (name, stats, leaderboard spot) replaces the local guest; a reload shows it everywhere.
 */
async function linkDevice() {
  if (sessionStorage.getItem(LINKED)) return;
  const local = getPlayer();
  const res = await fetch("/api/account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: local.id, name: local.name }),
  });
  if (!res.ok) return;
  const { player } = (await res.json()) as { player?: { playerId: string; name: string } };
  sessionStorage.setItem(LINKED, "1");
  if (!player) return;
  const name = player.name || local.name;
  if (player.playerId !== local.id || name !== local.name) {
    replacePlayer({ id: player.playerId, name });
    if (player.playerId !== local.id) window.location.reload();
  }
}

function GoogleG({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Header sign-in: Google button when signed out; avatar with a sign-out menu when signed in. */
export default function AccountButton() {
  const [state, setState] = useState<AccountState | null>(null);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch("/api/account", { cache: "no-store" });
      const s = (await res.json()) as AccountState;
      if (!alive) return;
      setState(s);
      if (s.user) await linkDevice();
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Close the menu on any click outside it.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const m = menuRef.current;
      if (m?.open && !m.contains(e.target as Node)) m.open = false;
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  if (!state?.google) return null;

  if (!state.user) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void authClient.signIn
            .social({ provider: "google", callbackURL: window.location.pathname + window.location.search })
            .catch(() => setBusy(false));
        }}
        className="site-tab disabled:opacity-60"
      >
        <GoogleG className="size-4" />
        Sign in
      </button>
    );
  }

  const first = state.user.name.split(/\s+/)[0] || "Account";
  return (
    <details ref={menuRef} className="relative">
      <summary className="site-tab cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {state.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.user.image} alt="" referrerPolicy="no-referrer" className="size-6 rounded-full border border-maize/60" />
        ) : (
          <span className="grid size-6 place-items-center rounded-full bg-maize text-xs text-mblue">{first[0]}</span>
        )}
        <span className="hidden max-w-28 truncate sm:inline">{first}</span>
      </summary>
      <div className="absolute top-full right-0 z-40 mt-2 min-w-44 rounded-2xl border border-maize/25 bg-night/95 p-1.5 shadow-[0_18px_40px_rgba(0,0,0,.5)] backdrop-blur">
        <p className="truncate px-3 pt-1.5 pb-2 text-sm font-semibold text-foreground/70">{state.user.name}</p>
        <button
          type="button"
          onClick={async () => {
            sessionStorage.removeItem(LINKED);
            await authClient.signOut();
            // The account's identity stays with the account, not with this (maybe shared) device.
            resetPlayer();
            window.location.reload();
          }}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-maize hover:bg-maize/10"
        >
          <LogOut className="size-4" strokeWidth={2.5} aria-hidden />
          Sign out
        </button>
      </div>
    </details>
  );
}
