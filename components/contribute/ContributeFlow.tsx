"use client";

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ImageUp,
  Loader2,
  LocateFixed,
  MapPin,
  RotateCcw,
  ScanFace,
  Send,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CAMPUS } from "@/lib/campus";
import { campusFeatureAt } from "@/lib/geo";
import { getPlayer, NAME_PATTERN, setPlayerName, type LocalPlayer } from "@/lib/player";
import type { LngLat } from "@/lib/types";
import Confetti from "./Confetti";
import { detectFaces, loadFaceDetector } from "./faces";
import { PhotoError, preparePhoto } from "./photo";
import PinPicker, { onMapArea } from "./PinPicker";
import { PHOTO_LICENSE, PHOTO_LICENSE_URL, spotLabel, type FaceBox } from "./shared";

type Step = "name" | "photo" | "spot" | "send" | "done";
type FlowStep = Exclude<Step, "done">;

const STEPS: { id: FlowStep; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "photo", label: "Photo" },
  { id: "spot", label: "Spot" },
  { id: "send", label: "Send" },
];

const HEADINGS: Record<Step, string> = {
  name: "Who's shooting?",
  photo: "Snap a spot",
  spot: "Pin it",
  send: "Send it",
  done: "Sent for review!",
};

interface Shot {
  key: number;
  url: string;
  blob: Blob;
  width: number;
  height: number;
  faces: FaceBox[];
  scan: "scanning" | "done" | "skipped";
}

type GpsStatus = "idle" | "locating" | "ok" | "denied" | "unavailable" | "far";

// ---------- local player (localStorage, so read it as an external store) ----------

let playerCache: LocalPlayer | null = null;
function readPlayer(): LocalPlayer {
  if (!playerCache) {
    try {
      playerCache = getPlayer();
    } catch {
      // Storage blocked: a throwaway id still lets this one upload through.
      playerCache = { id: crypto.randomUUID().replace(/-/g, ""), name: "" };
    }
  }
  return playerCache;
}
const noSubscribe = () => () => {};

const tidyName = (raw: string) => raw.trim().replace(/\s+/g, " ");

function timeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

interface SendResult {
  status: number;
  body: { error?: string; waiting?: number } | null;
}

/** XHR rather than fetch, for an upload progress bar. */
function upload(form: FormData, onProgress: (f: number) => void): Promise<SendResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/contribute");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: SendResult["body"] = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(form);
  });
}

export default function ContributeFlow() {
  const player = useSyncExternalStore(noSubscribe, readPlayer, () => null);
  const [step, setStep] = useState<Step>("name");
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const name = nameInput ?? player?.name ?? "";

  const [shot, setShot] = useState<Shot | null>(null);
  const [developing, setDeveloping] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const shotCount = useRef(0);
  const facesRef = useRef<{ key: number; promise: Promise<FaceBox[]> } | null>(null);

  const [pin, setPin] = useState<LngLat | null>(null);
  const [gps, setGps] = useState<{ pos: LngLat; accuracy: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [byHand, setByHand] = useState(false);
  const byHandRef = useRef(false);
  const [focusKey, setFocusKey] = useState(0);
  const watchRef = useRef<number | null>(null);
  const watchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [consent, setConsent] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(0);

  const spot = useMemo(() => (pin ? campusFeatureAt(CAMPUS, pin) : null), [pin]);
  const nameOk = NAME_PATTERN.test(tidyName(name));

  // Free the preview image when it's replaced.
  const shotUrl = shot?.url;
  useEffect(() => {
    if (!shotUrl) return;
    return () => URL.revokeObjectURL(shotUrl);
  }, [shotUrl]);

  // ---------- location ----------

  const stopLocating = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    if (watchTimer.current) clearTimeout(watchTimer.current);
    watchTimer.current = null;
  }, []);

  useEffect(() => stopLocating, [stopLocating]);

  const startLocating = () => {
    stopLocating();
    byHandRef.current = false;
    setByHand(false);
    if (!("geolocation" in navigator)) {
      setGpsStatus("unavailable");
      return;
    }
    setGpsStatus("locating");
    let first = true;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!onMapArea(p)) {
          setGpsStatus("far");
          stopLocating();
          return;
        }
        setGps({ pos: p, accuracy: pos.coords.accuracy });
        setGpsStatus("ok");
        if (!byHandRef.current) {
          setPin(p);
          if (first) setFocusKey((k) => k + 1);
          first = false;
        }
      },
      (err) => setGpsStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    // GPS settles within seconds; stop draining the battery after a minute.
    watchTimer.current = setTimeout(stopLocating, 60_000);
  };

  const movePin = (p: LngLat) => {
    byHandRef.current = true;
    setByHand(true);
    setPin(p);
  };

  // ---------- photo ----------

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(null);
    setDeveloping(true);
    loadFaceDetector().catch(() => {}); // warm up while the photo decodes
    try {
      const prepared = await preparePhoto(file);
      const key = ++shotCount.current;
      setShot({
        key,
        url: URL.createObjectURL(prepared.blob),
        blob: prepared.blob,
        width: prepared.width,
        height: prepared.height,
        faces: [],
        scan: "scanning",
      });
      const promise = timeout(
        detectFaces(prepared.canvas).then(
          (faces) => {
            setShot((s) => (s?.key === key ? { ...s, faces, scan: "done" } : s));
            return faces;
          },
          () => {
            setShot((s) => (s?.key === key ? { ...s, scan: "skipped" } : s));
            return [] as FaceBox[];
          },
        ),
        30_000,
        [] as FaceBox[],
      );
      facesRef.current = { key, promise };
    } catch (err) {
      setPhotoError(err instanceof PhotoError ? err.message : "Can't open that photo");
    } finally {
      setDeveloping(false);
    }
  };

  // ---------- navigation ----------

  const go = (next: Step) => {
    if (next !== "spot") stopLocating();
    setSendError(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toPhoto = () => {
    if (!nameOk) {
      setNameError("2–20 letters, numbers, spaces, . _ -");
      return;
    }
    setNameError(null);
    go("photo");
  };

  const toSpot = () => {
    go("spot");
    if (!pin || !byHandRef.current) startLocating();
  };

  const submit = async () => {
    if (!shot || !pin || !spot || !consent || !player || progress !== null) return;
    setSendError(null);
    setProgress(0);
    const scan = facesRef.current?.key === shot.key ? facesRef.current.promise : Promise.resolve(shot.faces);
    const faces = await timeout(scan, 8_000, shot.faces);
    const form = new FormData();
    form.set("name", tidyName(name));
    form.set("playerId", player.id);
    form.set("lat", String(pin.lat));
    form.set("lng", String(pin.lng));
    form.set("consent", "yes");
    form.set("faces", JSON.stringify(faces));
    form.set("photo", shot.blob, shot.blob.type === "image/webp" ? "photo.webp" : "photo.jpg");
    try {
      const res = await upload(form, setProgress);
      if (res.status === 201) {
        try {
          playerCache = setPlayerName(tidyName(name));
        } catch {}
        setWaiting(res.body?.waiting ?? 1);
        go("done");
      } else if (res.status === 409) {
        setNameError(res.body?.error ?? "That name is taken");
        go("name");
      } else {
        setSendError(res.body?.error ?? "Upload failed. Try again");
      }
    } catch {
      setSendError("No connection. Try again");
    } finally {
      setProgress(null);
    }
  };

  const another = () => {
    setShot(null);
    facesRef.current = null;
    setPin(null);
    setGps(null);
    setGpsStatus("idle");
    byHandRef.current = false;
    setByHand(false);
    setConsent(false);
    go("photo");
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const canReach = (id: FlowStep) => {
    if (id === "name") return true;
    if (id === "photo") return nameOk;
    if (id === "spot") return nameOk && !!shot;
    return nameOk && !!shot && !!spot;
  };

  return (
    <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-6">
      {step !== "done" && (
        <nav aria-label="Steps" className="mb-5 grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => {
            const done = i < stepIndex;
            const current = i === stepIndex;
            return (
              <button
                key={s.id}
                type="button"
                disabled={!done || !canReach(s.id)}
                onClick={() => (s.id === "spot" ? toSpot() : go(s.id))}
                aria-current={current ? "step" : undefined}
                className="group flex flex-col items-center gap-1.5 disabled:cursor-default"
              >
                <span
                  className={`h-2.5 w-full rounded-full transition-all duration-500 ${
                    current
                      ? "bg-maize shadow-[0_0_14px_var(--maize)]"
                      : done
                        ? "bg-gold group-hover:bg-maize"
                        : "bg-foreground/15"
                  }`}
                />
                <span
                  className={`flex items-center gap-1 font-display text-sm font-bold tracking-wide uppercase italic ${
                    current ? "text-maize" : done ? "text-gold" : "text-foreground/40"
                  }`}
                >
                  {done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
                  {s.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      <h1
        key={step}
        className="text-display mb-5 animate-in text-5xl text-maize-gradient duration-300 fade-in slide-in-from-bottom-3 sm:text-6xl"
      >
        {HEADINGS[step]}
      </h1>

      <div key={`body-${step}`} className="flex flex-1 animate-in flex-col duration-300 fade-in slide-in-from-right-6">
        {step === "name" && (
          <NameStep
            name={name}
            error={nameError}
            onChange={(v) => {
              setNameInput(v);
              setNameError(null);
            }}
            onNext={toPhoto}
            ready={!!player}
          />
        )}
        {step === "photo" && (
          <PhotoStep
            shot={shot}
            developing={developing}
            error={photoError}
            onFile={onFile}
            onBack={() => go("name")}
            onNext={toSpot}
          />
        )}
        {step === "spot" && (
          <SpotStep
            pin={pin}
            spotName={spot ? spotLabel(spot) : null}
            gps={byHand ? null : gps}
            gpsStatus={gpsStatus}
            focusKey={focusKey}
            onMove={movePin}
            onLocate={() => {
              startLocating();
              if (gps) {
                setPin(gps.pos);
                setFocusKey((k) => k + 1);
              }
            }}
            onBack={() => go("photo")}
            onNext={() => go("send")}
          />
        )}
        {step === "send" && shot && (
          <SendStep
            shot={shot}
            name={tidyName(name)}
            spotName={spot ? spotLabel(spot) : "Campus"}
            consent={consent}
            onConsent={setConsent}
            progress={progress}
            error={sendError}
            onBack={() => go("spot")}
            onSubmit={submit}
          />
        )}
        {step === "done" && shot && <DoneStep shot={shot} waiting={waiting} onAnother={another} />}
      </div>
    </div>
  );
}

// ---------- pieces ----------

function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-auto flex items-center gap-3 bg-gradient-to-t from-night from-60% to-transparent px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Back" className="btn-game btn-game-blue shrink-0 px-4">
      <ArrowLeft className="size-5" strokeWidth={3} />
    </button>
  );
}

function ErrorChip({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex animate-pop items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/15 px-3 py-2 text-sm font-semibold text-red-200"
    >
      <TriangleAlert className="size-4 shrink-0 text-red-300" aria-hidden />
      {children}
    </p>
  );
}

function NameStep({
  name,
  error,
  ready,
  onChange,
  onNext,
}: {
  name: string;
  error: string | null;
  ready: boolean;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      <label htmlFor="contrib-name" className="sr-only">
        Your name
      </label>
      <input
        id="contrib-name"
        value={name}
        onChange={(e) => onChange(e.target.value)}
        maxLength={20}
        autoComplete="nickname"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="next"
        placeholder="Your name"
        disabled={!ready}
        aria-invalid={!!error}
        className="w-full rounded-2xl border-2 border-maize/40 bg-mblue-deep/80 px-5 py-4 font-display text-4xl font-extrabold tracking-wide text-maize uppercase italic shadow-[inset_0_2px_10px_rgba(0,0,0,.4)] outline-none placeholder:text-maize/25 focus:border-maize focus:shadow-[0_0_0_4px_oklch(0.87_0.18_93/0.2)]"
      />
      {error && <ErrorChip>{error}</ErrorChip>}

      <div className="panel flex items-center gap-3 px-4 py-3" aria-label="Your photo credit">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-maize text-mblue">
          <Camera className="size-5" strokeWidth={2.5} aria-hidden />
        </span>
        <span className="min-w-0 truncate font-display text-2xl font-extrabold text-foreground uppercase italic">
          {tidyName(name) || "???"}
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-maize/15 px-2.5 py-1 text-xs font-bold text-maize">
          {PHOTO_LICENSE}
        </span>
      </div>

      <ActionBar>
        <button type="submit" disabled={!ready} className="btn-game flex-1 py-4 text-2xl">
          Next <ArrowRight className="size-6" strokeWidth={3} aria-hidden />
        </button>
      </ActionBar>
    </form>
  );
}

function FaceBoxes({ faces }: { faces: FaceBox[] }) {
  return faces.map((f, i) => (
    <span
      key={i}
      aria-hidden
      className="absolute animate-pop rounded-[30%] border-2 border-dashed border-maize bg-maize/10 backdrop-blur-md"
      style={{
        left: `${f.x * 100}%`,
        top: `${f.y * 100}%`,
        width: `${f.w * 100}%`,
        height: `${f.h * 100}%`,
        animationDelay: `${i * 60}ms`,
      }}
    />
  ));
}

function ScanChip({ shot }: { shot: Shot }) {
  const n = shot.faces.length;
  const text =
    shot.scan === "scanning"
      ? "Scanning for faces"
      : shot.scan === "skipped"
        ? "Face scan skipped"
        : n === 0
          ? "No faces"
          : `${n} face${n === 1 ? "" : "s"} · will be blurred`;
  return (
    <span
      aria-live="polite"
      className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-maize/40 bg-night/85 px-3 py-1.5 text-xs font-bold text-maize backdrop-blur"
    >
      {shot.scan === "scanning" ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <ScanFace className="size-3.5" aria-hidden />
      )}
      {text}
    </span>
  );
}

function PhotoStep({
  shot,
  developing,
  error,
  onFile,
  onBack,
  onNext,
}: {
  shot: Shot | null;
  developing: boolean;
  error: string | null;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const cameraInput = (
    <input
      type="file"
      accept="image/*"
      capture="environment"
      onChange={onFile}
      disabled={developing}
      className="sr-only"
    />
  );
  return (
    <div className="flex flex-1 flex-col gap-4">
      {shot ? (
        <div
          className="relative mx-auto overflow-hidden rounded-3xl border-2 border-maize/40 bg-mblue-deep shadow-[0_18px_40px_rgba(0,0,0,.45)]"
          // Width follows the photo's shape (capped by the screen height) so the face boxes line up.
          style={{
            width: `min(100%, calc(56vh * ${(shot.width / shot.height).toFixed(4)}))`,
            aspectRatio: `${shot.width} / ${shot.height}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.url} alt="Your photo" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0">
            <FaceBoxes faces={shot.faces} />
          </div>
          <span
            key={shot.key}
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-out bg-white duration-700 fade-out fill-mode-forwards"
          />
          <ScanChip shot={shot} />
        </div>
      ) : (
        <label
          className={`group relative grid aspect-[4/3] cursor-pointer place-items-center overflow-hidden rounded-3xl border-[3px] border-dashed border-maize/50 bg-[radial-gradient(circle_at_50%_40%,oklch(0.3_0.08_255),var(--mblue-deep))] transition hover:border-maize has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-maize/40 ${developing ? "pointer-events-none" : ""}`}
        >
          {cameraInput}
          <span className="flex flex-col items-center gap-3">
            {developing ? (
              <>
                <Loader2 className="size-16 animate-spin text-maize" aria-hidden />
                <span className="text-display text-3xl text-maize">Developing</span>
              </>
            ) : (
              <>
                <span className="grid size-24 animate-float place-items-center rounded-full bg-maize text-mblue shadow-[0_0_40px_oklch(0.87_0.18_93/0.45)] transition group-hover:scale-110 group-active:scale-95">
                  <Camera className="size-12" strokeWidth={2.25} aria-hidden />
                </span>
                <span className="text-display text-4xl text-maize">Take photo</span>
              </>
            )}
          </span>
        </label>
      )}

      {error && <ErrorChip>{error}</ErrorChip>}

      <label className="mx-auto inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-foreground/70 transition hover:bg-maize/10 hover:text-maize has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-maize/50">
        <input type="file" accept="image/*" onChange={onFile} disabled={developing} className="sr-only" />
        <ImageUp className="size-4" aria-hidden />
        Pick a file
      </label>

      <ActionBar>
        <BackButton onClick={onBack} />
        {shot ? (
          <>
            <label className="btn-game btn-game-blue shrink-0 cursor-pointer px-4 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-maize/40">
              {cameraInput}
              <RotateCcw className="size-5" strokeWidth={3} aria-hidden />
              <span className="sr-only">Retake</span>
            </label>
            <button type="button" onClick={onNext} disabled={developing} className="btn-game flex-1 py-4 text-2xl">
              Next <ArrowRight className="size-6" strokeWidth={3} aria-hidden />
            </button>
          </>
        ) : (
          <span className="flex-1" />
        )}
      </ActionBar>
    </div>
  );
}

function SpotStep({
  pin,
  spotName,
  gps,
  gpsStatus,
  focusKey,
  onMove,
  onLocate,
  onBack,
  onNext,
}: {
  pin: LngLat | null;
  spotName: string | null;
  gps: { pos: LngLat; accuracy: number } | null;
  gpsStatus: GpsStatus;
  focusKey: number;
  onMove: (p: LngLat) => void;
  onLocate: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  let chip: React.ReactNode;
  if (pin && spotName) {
    chip = (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-maize px-3 py-1.5 text-sm font-extrabold text-mblue shadow-lg">
        <Check className="size-4" strokeWidth={3} aria-hidden />
        {spotName}
      </span>
    );
  } else if (pin) {
    chip = (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 text-sm font-extrabold text-white shadow-lg">
        <TriangleAlert className="size-4" aria-hidden />
        Off campus
      </span>
    );
  } else if (gpsStatus === "locating") {
    chip = (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-night/90 px-3 py-1.5 text-sm font-bold text-maize shadow-lg">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Finding you
      </span>
    );
  } else {
    chip = (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-night/90 px-3 py-1.5 text-sm font-bold text-maize shadow-lg">
        <MapPin className="size-4" aria-hidden />
        {gpsStatus === "far" ? "You're off campus · tap the spot" : "Tap where you took it"}
      </span>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="relative h-[56vh] min-h-80 overflow-hidden rounded-3xl border-2 border-maize/40 shadow-[0_18px_40px_rgba(0,0,0,.45)]">
        <PinPicker value={pin} onChange={onMove} accuracy={gps?.accuracy ?? null} focusKey={focusKey} />
        <div aria-live="polite" className="pointer-events-none absolute top-3 left-3 flex max-w-[75%] flex-col items-start gap-2">
          {chip}
          {gps && pin && (
            <span className="rounded-full bg-night/85 px-2.5 py-1 text-xs font-bold text-foreground/80 backdrop-blur">
              ±{Math.max(1, Math.round(gps.accuracy))} m
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onLocate}
          aria-label="Use my location"
          className="absolute top-3 right-3 grid size-11 place-items-center rounded-xl border border-maize/40 bg-night/85 text-maize shadow-lg backdrop-blur transition hover:bg-mblue active:scale-95"
        >
          <LocateFixed className={`size-5 ${gpsStatus === "locating" ? "animate-pulse" : ""}`} aria-hidden />
        </button>
      </div>

      {(gpsStatus === "denied" || gpsStatus === "unavailable") && !pin && (
        <ErrorChip>{gpsStatus === "denied" ? "Location is blocked · tap the map instead" : "No GPS · tap the map instead"}</ErrorChip>
      )}

      <ActionBar>
        <BackButton onClick={onBack} />
        <button type="button" onClick={onNext} disabled={!spotName} className="btn-game flex-1 py-4 text-2xl">
          Next <ArrowRight className="size-6" strokeWidth={3} aria-hidden />
        </button>
      </ActionBar>
    </div>
  );
}

function SendStep({
  shot,
  name,
  spotName,
  consent,
  onConsent,
  progress,
  error,
  onBack,
  onSubmit,
}: {
  shot: Shot;
  name: string;
  spotName: string;
  consent: boolean;
  onConsent: (v: boolean) => void;
  progress: number | null;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const sending = progress !== null;
  const n = shot.faces.length;
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="panel flex gap-4 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shot.url}
          alt="Your photo"
          className="size-28 shrink-0 -rotate-3 rounded-xl border-4 border-white object-cover shadow-lg"
        />
        <div className="flex min-w-0 flex-col justify-center gap-2">
          <span className="truncate font-display text-2xl font-extrabold text-maize uppercase italic">{name}</span>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-maize/15 px-2.5 py-1 text-xs font-bold text-maize">
            <MapPin className="size-3.5" aria-hidden />
            {spotName}
          </span>
          {n > 0 && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-maize/15 px-2.5 py-1 text-xs font-bold text-maize">
              <ScanFace className="size-3.5" aria-hidden />
              {n} face{n === 1 ? "" : "s"} to blur
            </span>
          )}
        </div>
      </div>

      <label
        className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-maize/40 ${
          consent ? "border-maize bg-maize/10" : "border-maize/30 bg-mblue-deep/60 hover:border-maize/60"
        }`}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => onConsent(e.target.checked)}
          disabled={sending}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border-2 transition ${
            consent ? "scale-110 border-maize bg-maize text-mblue" : "border-maize/60"
          }`}
        >
          {consent && <Check className="size-5 animate-pop" strokeWidth={3.5} />}
        </span>
        <span className="text-sm leading-snug font-semibold">
          I took this photo and release it under{" "}
          <a
            href={PHOTO_LICENSE_URL}
            target="_blank"
            rel="noopener noreferrer license"
            className="text-maize underline underline-offset-2"
            onClick={(e) => e.stopPropagation()}
          >
            {PHOTO_LICENSE}
          </a>
          , credited to <span className="text-maize">{name}</span>.
        </span>
      </label>

      {error && <ErrorChip>{error}</ErrorChip>}

      <ActionBar>
        <BackButton onClick={onBack} />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!consent || sending}
          className="btn-game relative flex-1 overflow-hidden py-4 text-2xl"
        >
          {sending && (
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-white/35 transition-[width] duration-200"
              style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
            />
          )}
          <span className="relative inline-flex items-center gap-2">
            {sending ? (
              <>
                <Loader2 className="size-6 animate-spin" aria-hidden />
                {progress !== null && progress < 1 ? `${Math.round(progress * 100)}%` : "Saving"}
              </>
            ) : (
              <>
                Submit <Send className="size-6" strokeWidth={2.5} aria-hidden />
              </>
            )}
          </span>
        </button>
      </ActionBar>
    </div>
  );
}

function DoneStep({ shot, waiting, onAnother }: { shot: Shot; waiting: number; onAnother: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-6 pt-2">
      <Confetti originY={0.3} />
      <div className="relative w-64 rotate-[-4deg] animate-pop rounded-md bg-white p-3 pb-12 shadow-[0_24px_50px_rgba(0,0,0,.55)] sm:w-72">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot.url} alt="Your photo" className="aspect-square w-full rounded-sm object-cover" />
        <span className="absolute right-0 bottom-3 left-0 text-center font-display text-2xl font-extrabold text-mblue uppercase italic">
          In review
        </span>
        <span
          aria-hidden
          className="absolute -top-4 -right-6 rotate-12 animate-pop rounded-lg border-4 border-maize bg-mblue px-3 py-1 font-display text-xl font-black text-maize uppercase italic shadow-xl [animation-delay:350ms]"
        >
          +1
        </span>
      </div>

      <p className="flex items-baseline gap-2 font-display font-extrabold uppercase italic">
        <span className="text-5xl text-maize">{waiting}</span>
        <span className="text-xl text-foreground/70">waiting</span>
      </p>

      <ActionBar>
        <Link href="/play" className="btn-game btn-game-blue flex-1 py-4 text-xl">
          Play
        </Link>
        <button type="button" onClick={onAnother} className="btn-game flex-[1.4] py-4 text-xl">
          <Camera className="size-5" strokeWidth={2.5} aria-hidden />
          Snap another
        </button>
      </ActionBar>
    </div>
  );
}
