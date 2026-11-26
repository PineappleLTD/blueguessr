import {
  Camera,
  Cpu,
  ExternalLink,
  Globe2,
  Images,
  Landmark,
  Map as MapIcon,
  Scale,
  Smartphone,
  Sparkles,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { io } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";
import Dunes from "@/components/contribute/Dunes";
import { PHOTO_LICENSE, PHOTO_LICENSE_URL } from "@/components/contribute/shared";
import Header from "@/components/site/Header";
import { playerPhotos, staticPhotos } from "@/lib/photos";
import type { Photo } from "@/lib/types";

export const metadata: Metadata = {
  title: "Credits | BlueGuessr",
};

interface CreditRow {
  author: string;
  license: string;
  licenseUrl: string;
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** One row per photographer + license, sorted by name. Never anything that points at a photo. */
function creditRows(photos: Pick<Photo, "author" | "license" | "licenseUrl">[]): CreditRow[] {
  const rows = new Map<string, CreditRow>();
  for (const p of photos) {
    const author = p.author?.trim() || "Unknown";
    const key = `${author.toLowerCase()}\u0000${p.license}`;
    if (!rows.has(key)) rows.set(key, { author, license: p.license, licenseUrl: p.licenseUrl });
  }
  return [...rows.values()].sort((a, b) => collator.compare(a.author, b.author) || collator.compare(a.license, b.license));
}

const photographers = (rows: CreditRow[]) => new Set(rows.map((r) => r.author.toLowerCase())).size;

function licenseList(photos: Pick<Photo, "license" | "licenseUrl">[]) {
  const seen = new Map<string, string>();
  for (const p of photos) if (p.license && !seen.has(p.license)) seen.set(p.license, p.licenseUrl);
  return [...seen.entries()].map(([name, url]) => ({ name, url })).sort((a, b) => collator.compare(a.name, b.name));
}

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
const linkClass = "font-semibold text-maize underline decoration-maize/40 underline-offset-2 hover:decoration-maize";

export default function CreditsPage() {
  const photos = staticPhotos();
  const mapillary = creditRows(photos.filter((p) => p.source === "mapillary"));
  const commons = creditRows(photos.filter((p) => p.source === "commons"));
  const licenses = licenseList([...photos, { license: PHOTO_LICENSE, licenseUrl: PHOTO_LICENSE_URL }]);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[80vh] bg-[radial-gradient(ellipse_at_top,oklch(0.87_0.18_93/0.12),transparent_65%)]"
      />
      <Header />
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 pb-56 sm:px-8">
        <h1 className="text-display animate-pop py-4 text-7xl text-maize-gradient sm:py-8 sm:text-9xl">Credits</h1>

        <section aria-labelledby="photos" className="flex flex-col gap-5">
          <SectionTitle id="photos" icon={Images}>
            Photos
          </SectionTitle>
          <Suspense fallback={<CreditGroup title="Players" icon={Smartphone} rows={null} />}>
            <PlayerCredits />
          </Suspense>
          <CreditGroup title="Mapillary" icon={Camera} rows={mapillary} href="https://www.mapillary.com/" />
          <CreditGroup title="Wikimedia Commons" icon={Landmark} rows={commons} href="https://commons.wikimedia.org/" />
        </section>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Panel title="Licenses" icon={Scale}>
            <ul className="flex flex-wrap gap-2">
              {licenses.map((l) => (
                <li key={l.name}>
                  <a
                    href={l.url}
                    {...ext}
                    rel="noopener noreferrer license"
                    className="inline-flex items-center gap-1.5 rounded-full border border-maize/30 bg-maize/10 px-3 py-1.5 text-sm font-bold text-maize transition hover:-translate-y-0.5 hover:bg-maize/20"
                  >
                    {l.name}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Changes" icon={Sparkles}>
            <div className="flex flex-col gap-2 text-sm leading-relaxed text-foreground/80">
              <p>
                Each photo was resized and saved again without its embedded data (camera, date, location). Nothing else
                about it was changed. Photos under a ShareAlike license stay under that license here.
              </p>
              <p>Faces in player photos may be blurred.</p>
            </div>
          </Panel>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Panel title="Map" icon={MapIcon}>
            <Lines>
              <li>
                Map data ©{" "}
                <a href="https://www.openstreetmap.org/copyright" {...ext} className={linkClass}>
                  OpenStreetMap contributors
                </a>{" "}
                under the{" "}
                <a href="https://opendatacommons.org/licenses/odbl/" {...ext} className={linkClass}>
                  ODbL
                </a>
              </li>
              <li>Campus boundary from OpenStreetMap</li>
              <li>
                Tiles and style by{" "}
                <a href="https://openfreemap.org/" {...ext} className={linkClass}>
                  OpenFreeMap
                </a>{" "}
                built on{" "}
                <a href="https://openmaptiles.org/" {...ext} className={linkClass}>
                  OpenMapTiles
                </a>
              </li>
              <li>
                Drawn with{" "}
                <a href="https://maplibre.org/" {...ext} className={linkClass}>
                  MapLibre GL JS
                </a>
              </li>
            </Lines>
          </Panel>
          <Panel title="Globe" icon={Globe2}>
            <Lines>
              <li>
                <a href="https://www.naturalearthdata.com/" {...ext} className={linkClass}>
                  Natural Earth
                </a>{" "}
                land data (public domain)
              </li>
              <li>
                <a href="https://d3js.org/" {...ext} className={linkClass}>
                  D3
                </a>
              </li>
            </Lines>
          </Panel>
          <Panel title="Type" icon={Type}>
            <Lines>
              <li>
                <span className="font-display text-lg font-bold uppercase italic">Barlow Condensed</span> by Jeremy Tribby
              </li>
              <li>
                <span className="font-semibold">Manrope</span> by Mikhail Sharanda
              </li>
              <li>
                <span className="font-mono">Geist Mono</span> by Vercel
              </li>
              <li>
                All under the{" "}
                <a href="https://openfontlicense.org/" {...ext} className={linkClass}>
                  SIL Open Font License
                </a>
              </li>
            </Lines>
          </Panel>
          <Panel title="Software" icon={Cpu}>
            <Lines>
              <li>
                <a href="https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector" {...ext} className={linkClass}>
                  MediaPipe
                </a>{" "}
                and its BlazeFace model
              </li>
              <li>
                <a href="https://www.apache.org/licenses/LICENSE-2.0" {...ext} className={linkClass}>
                  Apache License 2.0
                </a>
              </li>
            </Lines>
          </Panel>
        </div>

        <footer className="mt-16 flex flex-col items-center gap-3 text-center">
          <a
            href="https://pineapplehacks.com/"
            {...ext}
            className="group inline-flex items-center gap-3 rounded-full border border-maize/30 bg-night/70 py-2 pr-5 pl-2 backdrop-blur transition hover:-translate-y-0.5 hover:border-maize"
          >
            <span className="grid size-10 place-items-center rounded-full bg-maize/15 transition group-hover:rotate-12">
              <PineappleMark />
            </span>
            <span className="font-display text-2xl font-extrabold text-maize uppercase italic">Made by Pineapple</span>
          </a>
          <p className="text-xs text-foreground/50">Not affiliated with the University of Michigan.</p>
        </footer>
      </main>
      <Dunes className="absolute inset-x-0 bottom-0" />
    </div>
  );
}

/** Player photos live in KV, so this part streams in at request time. */
async function PlayerCredits() {
  await io();
  let rows: CreditRow[] = [];
  try {
    rows = creditRows(await playerPhotos());
  } catch (e) {
    console.error("[blueguessr] player credits unavailable:", e);
  }
  return <CreditGroup title="Players" icon={Smartphone} rows={rows} />;
}

function SectionTitle({ id, icon: Icon, children }: { id: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-display flex items-center gap-3 text-4xl text-maize sm:text-5xl">
      <Icon className="size-8 sm:size-9" strokeWidth={2.5} aria-hidden />
      {children}
    </h2>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="panel flex flex-col gap-4 p-5 sm:p-6">
      <h2 className="text-display flex items-center gap-2.5 text-3xl text-maize">
        <Icon className="size-6" strokeWidth={2.5} aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Lines({ children }: { children: React.ReactNode }) {
  return <ul className="flex flex-col gap-2 text-sm leading-snug text-foreground/85">{children}</ul>;
}

function CreditGroup({
  title,
  icon: Icon,
  rows,
  href,
}: {
  title: string;
  icon: LucideIcon;
  /** null while loading. */
  rows: CreditRow[] | null;
  href?: string;
}) {
  const count = rows ? photographers(rows) : null;
  return (
    <section className="panel p-5 sm:p-6" aria-label={title}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-maize text-mblue shadow-[0_4px_0_var(--gold-deep)]">
          <Icon className="size-6" strokeWidth={2.5} aria-hidden />
        </span>
        <h3 className="text-display text-3xl text-foreground sm:text-4xl">{title}</h3>
        <span className="rounded-full bg-maize/15 px-3 py-1 text-sm font-extrabold text-maize tabular-nums">
          {count === null ? "…" : `${count} photographer${count === 1 ? "" : "s"}`}
        </span>
        {href && (
          <a
            href={href}
            {...ext}
            aria-label={`${title} website`}
            className="ml-auto grid size-9 place-items-center rounded-lg text-foreground/50 transition hover:bg-maize/10 hover:text-maize"
          >
            <ExternalLink className="size-4" aria-hidden />
          </a>
        )}
      </div>
      {rows === null ? (
        <div className="h-16 animate-pulse rounded-xl bg-maize/5" />
      ) : rows.length ? (
        <ul className="columns-1 gap-x-10 sm:columns-2 lg:columns-3">
          {rows.map((r) => (
            <li
              key={`${r.author}\u0000${r.license}`}
              className="flex break-inside-avoid items-baseline justify-between gap-3 border-b border-maize/10 py-1.5"
            >
              <span className="min-w-0 font-semibold break-words">{r.author}</span>
              <a
                href={r.licenseUrl}
                target="_blank"
                rel="noopener noreferrer license"
                className="shrink-0 rounded-full bg-maize/10 px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-maize transition hover:bg-maize/25"
              >
                {r.license}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-semibold text-foreground/60">No player photos yet</span>
          <Link href="/contribute" className="btn-game px-5 py-3 text-lg">
            <Camera className="size-5" strokeWidth={2.5} aria-hidden />
            Add yours
          </Link>
        </div>
      )}
    </section>
  );
}

function PineappleMark() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
      <path d="M16 3c-1.2 2.4-1.4 4.6-.6 6.6M16 3c1.6 2.2 2 4.4 1.2 6.6M10.5 6.5c1.8 1 3.4 2.4 4.4 4.2M21.5 6.5c-1.8 1-3.4 2.4-4.4 4.2" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="16" cy="20" rx="7.5" ry="9" fill="var(--maize)" />
      <path d="M10 15l12 10M10 21l8 7M14 12l8 7M22 15l-12 10M22 21l-8 7M18 12l-8 7" stroke="var(--mblue)" strokeWidth="1.2" strokeOpacity="0.55" />
    </svg>
  );
}
