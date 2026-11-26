"use client";

import { KeyRound, Loader2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.refresh(); // the server now sees the session and renders the review desk
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Sign-in failed");
    } catch {
      setError("No connection");
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="panel mx-auto mt-[8vh] flex w-full max-w-sm animate-pop flex-col gap-5 p-6 sm:p-8">
      <span className="grid size-16 place-items-center self-center rounded-2xl bg-maize text-mblue shadow-[0_0_40px_oklch(0.87_0.18_93/0.4)]">
        <KeyRound className="size-8" strokeWidth={2.5} aria-hidden />
      </span>
      <h1 className="text-display text-center text-5xl text-maize-gradient">Review desk</h1>
      <label htmlFor="admin-password" className="sr-only">
        Password
      </label>
      <input
        id="admin-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoFocus
        className="w-full rounded-2xl border-2 border-maize/40 bg-mblue-deep/80 px-4 py-3 text-lg font-semibold outline-none placeholder:text-foreground/30 focus:border-maize"
      />
      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm font-semibold text-red-300">
          <TriangleAlert className="size-4" aria-hidden />
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || !password} className="btn-game py-4 text-2xl">
        {busy ? <Loader2 className="size-6 animate-spin" aria-hidden /> : "Enter"}
      </button>
    </form>
  );
}
