"use client";

import { Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Dunes from "./Dunes";
import Finish from "./Finish";
import GameStage from "./GameStage";
import { saveName, useLocalPlayer, useRoom } from "./hooks";
import Lobby from "./Lobby";
import NameField, { nameOk } from "./NameField";
import { isRoomCode, type RoomError } from "./types";
import VersusStyles from "./VersusStyles";

export function RoomLoading() {
  return (
    <main className="grid flex-1 place-items-center">
      <Loader2 className="size-10 animate-spin text-maize" aria-label="Loading" />
    </main>
  );
}

const JOIN_ERRORS: Partial<Record<RoomError, string>> = {
  bad_name: "2–20 letters or numbers",
  room_full: "Room full",
  not_found: "Room not found",
};

/** One versus room: joins it, keeps it in sync and shows the screen for the current phase. */
export default function VersusRoom({ code, header }: { code: string; header: React.ReactNode }) {
  const router = useRouter();
  const player = useLocalPlayer();
  const valid = isRoomCode(code);
  const { view, status, offset, act, poke } = useRoom(code, valid && !!player);
  const [typedName, setTypedName] = useState<string | null>(null);
  const [joinState, setJoinState] = useState<{ busy: boolean; error: RoomError | null }>({ busy: false, error: null });
  const [leaving, setLeaving] = useState(false);
  const autoJoined = useRef(false);

  const join = useCallback(
    async (name: string) => {
      const clean = name.trim().replace(/\s+/g, " ");
      if (!nameOk(clean)) {
        setJoinState({ busy: false, error: "bad_name" });
        return;
      }
      saveName(clean);
      setJoinState({ busy: true, error: null });
      const r = await act("join", { name: clean });
      setJoinState({ busy: false, error: r.ok ? null : (r.error ?? "busy") });
    },
    [act],
  );

  // Opening a room link with a saved name joins straight away.
  const savedName = player?.name ?? "";
  const needsJoin = !!view && !view.me && !leaving;
  useEffect(() => {
    if (!needsJoin || autoJoined.current || !nameOk(savedName)) return;
    autoJoined.current = true;
    const t = setTimeout(() => void join(savedName), 0);
    return () => clearTimeout(t);
  }, [needsJoin, savedName, join]);

  const leave = useCallback(async () => {
    setLeaving(true);
    await act("leave");
    router.push("/versus");
  }, [act, router]);

  if (!valid || status === "not_found") {
    return (
      <Shell header={header}>
        <h1 className="vs-slam text-display text-6xl text-maize-gradient sm:text-7xl">Room not found</h1>
        <Link href="/versus" className="btn-game mt-8 text-2xl">
          New room
        </Link>
      </Shell>
    );
  }

  if (!view || !player || leaving) {
    return (
      <Shell header={header}>
        <Loader2 className="size-10 animate-spin text-maize" aria-label="Loading" />
      </Shell>
    );
  }

  if (!view.me) {
    const name = typedName ?? savedName;
    const auto = nameOk(savedName) && joinState.error === null;
    return (
      <Shell header={header}>
        <p className="font-display text-xl font-extrabold italic uppercase text-maize/70">Room</p>
        <h1 className="vs-slam text-display mb-6 text-7xl tracking-wider text-maize-gradient sm:text-8xl">{view.code}</h1>
        {auto ? (
          <Loader2 className="size-10 animate-spin text-maize" aria-label="Joining" />
        ) : (
          <form
            className="panel vs-rise w-full max-w-sm space-y-5 p-5 text-left sm:p-6"
            onSubmit={(e) => {
              e.preventDefault();
              void join(name);
            }}
          >
            <NameField value={name} onChange={setTypedName} showError={joinState.error === "bad_name"} autoFocus />
            {joinState.error && joinState.error !== "bad_name" && (
              <p className="font-display text-lg font-bold italic uppercase text-destructive">
                {JOIN_ERRORS[joinState.error] ?? "Try again"}
              </p>
            )}
            <button type="submit" disabled={joinState.busy} className="btn-game w-full text-2xl">
              {joinState.busy ? <Loader2 className="size-6 animate-spin" /> : <LogIn className="size-6" />}
              Join
            </button>
          </form>
        )}
      </Shell>
    );
  }

  if (view.phase === "lobby") return <Lobby view={view} act={act} onLeave={leave} header={header} />;
  if (view.phase === "finished") return <Finish view={view} act={act} onLeave={leave} header={header} />;
  return <GameStage key={view.game} view={view} offset={offset} act={act} poke={poke} onLeave={leave} />;
}

function Shell({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      {header}
      <VersusStyles />
      <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 pt-4 pb-44 text-center">
        {children}
        <Dunes className="absolute inset-x-0 bottom-0" />
      </main>
    </>
  );
}
