"use client";

import { Loader2, Swords, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import CodeInput from "./CodeInput";
import Dunes from "./Dunes";
import { roomApi, saveName, useLocalPlayer } from "./hooks";
import NameField, { nameOk } from "./NameField";
import { isRoomCode } from "./types";
import VersusStyles from "./VersusStyles";
import CrossedPins from "./CrossedPins";

export default function VersusHome() {
  const router = useRouter();
  const player = useLocalPlayer();
  const [typedName, setTypedName] = useState<string | null>(null);
  const name = typedName ?? player?.name ?? "";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [nameError, setNameError] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const checkName = () => {
    if (!nameOk(name)) {
      setNameError(true);
      document.getElementById("vs-name")?.focus();
      return false;
    }
    saveName(name.trim().replace(/\s+/g, " "));
    return true;
  };

  const create = async () => {
    if (busy || !checkName()) return;
    setBusy("create");
    try {
      const r = await roomApi("", { name: name.trim() });
      if (r.data.code) {
        router.push(`/versus/${r.data.code}`);
        return;
      }
      if (r.data.error === "bad_name") setNameError(true);
    } catch {}
    setBusy(null);
  };

  const join = async () => {
    if (busy) return;
    if (!isRoomCode(code)) {
      setCodeError("5 characters");
      return;
    }
    if (!checkName()) return;
    setBusy("join");
    try {
      const r = await roomApi(`/${code}`);
      if (r.status === 404) {
        setCodeError("No room with that code");
        setBusy(null);
        return;
      }
    } catch {}
    router.push(`/versus/${code}`);
  };

  return (
    <main className="relative flex flex-1 flex-col items-center overflow-hidden px-4 pt-2 pb-44 sm:pt-6">
      <VersusStyles />
      <div className="relative mb-6 flex w-full max-w-xl flex-col items-center sm:mb-8">
        <CrossedPins className="vs-rise relative -mb-7 h-28 w-auto sm:-mb-9 sm:h-40" />
        <h1
          className="vs-slam relative text-display text-[clamp(4.6rem,21vw,9.5rem)] text-maize-gradient"
          style={{ filter: "drop-shadow(0 6px 0 var(--gold-deep)) drop-shadow(0 18px 30px rgb(0 0 0 / 0.55))" }}
        >
          Versus
        </h1>
      </div>

      <div className="panel vs-rise relative w-full max-w-md space-y-6 p-5 sm:p-7" style={{ animationDelay: "120ms" }}>
        <NameField
          value={name}
          onChange={(v) => {
            setTypedName(v);
            setNameError(false);
          }}
          onEnter={create}
          showError={nameError}
        />

        <button type="button" onClick={create} disabled={busy !== null} className="btn-game w-full text-2xl">
          {busy === "create" ? <Loader2 className="size-6 animate-spin" /> : <Swords className="size-6" />}
          Create room
        </button>

        <div className="flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-maize/20" />
          <Users className="size-4 text-maize/60" />
          <span className="h-px flex-1 bg-maize/20" />
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <label htmlFor="vs-code" className="font-display text-lg font-extrabold italic uppercase text-maize">
              Room code
            </label>
            {codeError && <span className="font-display text-sm font-bold italic uppercase text-destructive">{codeError}</span>}
          </div>
          <CodeInput
            value={code}
            onChange={(c) => {
              setCode(c);
              setCodeError(null);
            }}
            onEnter={join}
            invalid={!!codeError}
          />
          <button type="button" onClick={join} disabled={busy !== null} className="btn-game btn-game-blue w-full text-2xl">
            {busy === "join" ? <Loader2 className="size-6 animate-spin" /> : null}
            Join
          </button>
        </div>
      </div>

      <Dunes className="absolute inset-x-0 bottom-0" />
    </main>
  );
}
