"use client";

import {
  Check,
  Eye,
  EyeOff,
  Inbox,
  Loader2,
  LogOut,
  MapPin,
  PartyPopper,
  RefreshCw,
  ScanFace,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import PinPicker from "@/components/contribute/PinPicker";
import { AREA_LABEL, spotLabel } from "@/components/contribute/shared";
import { CAMPUS } from "@/lib/campus";
import type { ApprovedView, PendingView } from "@/lib/contributions";
import { campusFeatureAt } from "@/lib/geo";
import type { LngLat } from "@/lib/types";
import FaceBoxEditor, { type EditBox } from "./FaceBoxEditor";
import { timeAgo, useNow } from "./useNow";

export interface ReviewData {
  pending: PendingView[];
  approved: ApprovedView[];
}

const JSON_HEADERS = { "content-type": "application/json" };

async function errorOf(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Failed (${res.status})`;
}

export default function ReviewDesk({ initial }: { initial: ReviewData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"queue" | "live">("queue");
  const [selectedId, setSelectedId] = useState<string | null>(initial.pending[0]?.id ?? null);
  const [loading, setLoading] = useState(false);
  const now = useNow();

  const selected = data.pending.find((p) => p.id === selectedId) ?? data.pending[0] ?? null;

  const reload = async (afterId?: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/queue", { cache: "no-store" });
      if (res.status === 401) {
        router.refresh();
        return;
      }
      if (!res.ok) return;
      const next = (await res.json()) as ReviewData;
      setData(next);
      if (afterId !== undefined) {
        // Move on to whatever was after the photo just handled.
        const oldIndex = data.pending.findIndex((p) => p.id === afterId);
        const candidates = next.pending.filter((p) => p.id !== afterId);
        setSelectedId(candidates[Math.min(Math.max(0, oldIndex), candidates.length - 1)]?.id ?? null);
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <h1 className="text-display text-6xl text-maize-gradient sm:text-7xl">Review</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => reload()}
            aria-label="Refresh"
            className="grid size-10 place-items-center rounded-xl border border-maize/30 text-maize transition hover:bg-maize/10"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          </button>
          <button
            type="button"
            onClick={logout}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-maize/30 px-3 text-sm font-bold text-foreground/80 transition hover:bg-maize/10 hover:text-maize"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>
      </div>

      <div role="tablist" aria-label="Review sections" className="flex gap-2">
        {(
          [
            ["queue", "Queue", data.pending.length],
            ["live", "Live", data.approved.length],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-display text-xl font-extrabold uppercase italic transition ${
              tab === id ? "bg-maize text-mblue shadow-[0_4px_0_var(--gold-deep)]" : "bg-mblue/60 text-maize hover:bg-mblue"
            }`}
          >
            {label}
            <span
              className={`min-w-7 rounded-full px-2 py-0.5 text-center text-base not-italic ${
                tab === id ? "bg-mblue text-maize" : "bg-maize/15"
              }`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {tab === "queue" ? (
        selected ? (
          <div className="grid gap-5 lg:grid-cols-[148px_minmax(0,1fr)]">
            <ul className="flex gap-3 overflow-x-auto pb-2 lg:max-h-[78vh] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pr-1">
              {data.pending.map((p) => (
                <li key={p.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    aria-current={p.id === selected.id}
                    className={`relative block w-28 overflow-hidden rounded-xl border-[3px] transition lg:w-full ${
                      p.id === selected.id ? "border-maize shadow-[0_0_18px_oklch(0.87_0.18_93/0.4)]" : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt="" className="aspect-[4/3] w-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-night/95 to-transparent px-2 pt-4 pb-1 text-left text-xs font-bold">
                      {p.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <PendingEditor key={selected.id} item={selected} now={now} onHandled={(id) => reload(id)} onSignedOut={() => router.refresh()} />
          </div>
        ) : (
          <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
            <PartyPopper className="size-14 animate-float text-maize" aria-hidden />
            <p className="text-display text-5xl text-maize">All clear</p>
          </div>
        )
      ) : (
        <LiveGrid photos={data.approved} now={now} onRemoved={() => reload()} onSignedOut={() => router.refresh()} />
      )}
    </div>
  );
}

function PendingEditor({
  item,
  now,
  onHandled,
  onSignedOut,
}: {
  item: PendingView;
  now: number | null;
  onHandled: (id: string) => void;
  onSignedOut: () => void;
}) {
  const [pin, setPin] = useState<LngLat>({ lat: item.lat, lng: item.lng });
  const [boxes, setBoxes] = useState<EditBox[]>(() =>
    item.faces.map((f, i) => ({ ...f, id: `auto-${i}`, on: true, auto: true })),
  );
  const [showBoxes, setShowBoxes] = useState(true);
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [stamp, setStamp] = useState<null | "live" | "tossed">(null);
  const [error, setError] = useState<string | null>(null);

  const spot = useMemo(() => campusFeatureAt(CAMPUS, pin), [pin]);
  const moved = pin.lat !== item.lat || pin.lng !== item.lng;
  const blurCount = boxes.filter((b) => b.on).length;

  const act = async (kind: "approve" | "reject") => {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pending/${item.id}`, {
        method: kind === "approve" ? "POST" : "DELETE",
        headers: JSON_HEADERS,
        body:
          kind === "approve"
            ? JSON.stringify({
                lat: pin.lat,
                lng: pin.lng,
                faces: boxes.filter((b) => b.on).map(({ x, y, w, h }) => ({ x, y, w, h })),
              })
            : undefined,
      });
      if (res.status === 401) return onSignedOut();
      if (res.ok || res.status === 404) {
        setStamp(kind === "approve" ? "live" : "tossed");
        setTimeout(() => onHandled(item.id), 850);
        return;
      }
      setError(await errorOf(res));
    } catch {
      setError("No connection");
    }
    setBusy(null);
  };

  return (
    <div className="grid animate-in gap-5 duration-300 fade-in xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="relative">
          <FaceBoxEditor
            src={item.src}
            width={item.width}
            height={item.height}
            boxes={boxes}
            onChange={setBoxes}
            show={showBoxes}
            disabled={!!busy}
          />
          {stamp && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <span
                className={`animate-pop rounded-2xl border-[6px] px-6 py-2 font-display text-6xl font-black uppercase italic shadow-2xl ${
                  stamp === "live" ? "-rotate-6 border-maize bg-mblue text-maize" : "rotate-6 border-red-400 bg-night text-red-300"
                }`}
              >
                {stamp === "live" ? "Live!" : "Tossed"}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-display text-3xl font-extrabold text-maize uppercase italic">{item.name}</span>
          {now && (
            <span className="rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-bold text-foreground/70">
              {timeAgo(item.createdAt, now)}
            </span>
          )}
          <span className="rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-bold text-foreground/70">
            {item.width}×{item.height}
          </span>
          <button
            type="button"
            onClick={() => setShowBoxes((s) => !s)}
            aria-pressed={showBoxes}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-maize/40 px-3 py-1.5 text-xs font-bold text-maize transition hover:bg-maize/10"
          >
            {showBoxes ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
            Boxes
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-maize/15 px-3 py-1.5 text-xs font-bold text-maize">
            <ScanFace className="size-3.5" aria-hidden />
            {blurCount} to blur
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="relative h-[42vh] min-h-72 overflow-hidden rounded-2xl border-2 border-maize/30">
          <PinPicker value={pin} onChange={busy ? undefined : setPin} focusKey={item.id} />
          <span
            className={`pointer-events-none absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-extrabold shadow-lg ${
              spot ? "bg-maize text-mblue" : "bg-destructive text-white"
            }`}
          >
            {spot ? <MapPin className="size-4" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />}
            {spot ? spotLabel(spot) : "Off campus"}
          </span>
          {moved && (
            <button
              type="button"
              onClick={() => setPin({ lat: item.lat, lng: item.lng })}
              className="absolute top-3 right-3 rounded-full bg-night/85 px-3 py-1.5 text-xs font-bold text-maize shadow-lg backdrop-blur hover:bg-mblue"
            >
              Reset pin
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-xl bg-destructive/15 px-3 py-2 text-sm font-semibold text-red-200">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <div className="flex gap-3">
          {confirmReject ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmReject(false)}
                disabled={!!busy}
                aria-label="Keep it"
                className="btn-game btn-game-blue shrink-0 px-4"
              >
                <X className="size-5" strokeWidth={3} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => act("reject")}
                disabled={!!busy}
                className="btn-game flex-1 bg-none py-4 text-xl text-white [background-color:var(--destructive)] [box-shadow:0_6px_0_oklch(0.45_0.18_25)]"
              >
                {busy === "reject" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Trash2 className="size-5" aria-hidden />}
                Toss it
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReject(true)}
              disabled={!!busy}
              className="btn-game btn-game-blue flex-1 py-4 text-xl"
            >
              <X className="size-5" strokeWidth={3} aria-hidden />
              Reject
            </button>
          )}
          <button
            type="button"
            onClick={() => act("approve")}
            disabled={!!busy || !spot || confirmReject}
            className="btn-game flex-[1.4] py-4 text-xl"
          >
            {busy === "approve" ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <Check className="size-5" strokeWidth={3} aria-hidden />
            )}
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveGrid({
  photos,
  now,
  onRemoved,
  onSignedOut,
}: {
  photos: ApprovedView[];
  now: number | null;
  onRemoved: () => void;
  onSignedOut: () => void;
}) {
  if (!photos.length) {
    return (
      <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Inbox className="size-14 text-maize/70" aria-hidden />
        <p className="text-display text-5xl text-maize">None yet</p>
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((p) => (
        <LiveCard key={p.id} photo={p} now={now} onRemoved={onRemoved} onSignedOut={onSignedOut} />
      ))}
    </ul>
  );
}

function LiveCard({
  photo,
  now,
  onRemoved,
  onSignedOut,
}: {
  photo: ApprovedView;
  now: number | null;
  onRemoved: () => void;
  onSignedOut: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/photos/${photo.id}`, { method: "DELETE" });
      if (res.status === 401) return onSignedOut();
      if (res.ok || res.status === 404) return onRemoved();
      setError(await errorOf(res));
    } catch {
      setError("No connection");
    }
    setBusy(false);
  };

  return (
    <li className="panel flex flex-col overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.src} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <span className="truncate font-display text-2xl font-extrabold text-maize uppercase italic">{photo.author}</span>
        <span className="flex flex-wrap gap-1.5 text-xs font-bold text-foreground/70">
          <span className="rounded-full bg-foreground/10 px-2 py-0.5">{AREA_LABEL[photo.area ?? "other"]}</span>
          {now && photo.approvedAt && (
            <span className="rounded-full bg-foreground/10 px-2 py-0.5">{timeAgo(photo.approvedAt, now)}</span>
          )}
        </span>
        {error && <span className="text-xs font-semibold text-red-300">{error}</span>}
        <div className="mt-auto flex gap-2 pt-1">
          {confirm ? (
            <>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                disabled={busy}
                className="flex-1 rounded-xl bg-mblue px-2 py-2 text-sm font-bold text-maize hover:bg-mblue/80"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-destructive px-2 py-2 text-sm font-bold text-white hover:brightness-110"
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                Remove
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-destructive/50 px-2 py-2 text-sm font-bold text-red-300 transition hover:bg-destructive/15"
            >
              <Trash2 className="size-4" aria-hidden />
              Remove
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
