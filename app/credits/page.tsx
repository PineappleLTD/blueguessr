import type { Metadata } from "next";
import { io } from "next/cache";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { PHOTO_LICENSE, PHOTO_LICENSE_URL } from "@/components/contribute/shared";
import Footer from "@/components/site/Footer";
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

function licenseList(photos: Pick<Photo, "license" | "licenseUrl">[]) {
  const seen = new Map<string, string>();
  for (const p of photos) if (p.license && !seen.has(p.license)) seen.set(p.license, p.licenseUrl);
  return [...seen.entries()].map(([name, url]) => ({ name, url })).sort((a, b) => collator.compare(a.name, b.name));
}

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
const link = "text-maize underline decoration-maize/40 underline-offset-2 hover:decoration-maize";

export default function CreditsPage() {
  const photos = staticPhotos();
  const mapillary = creditRows(photos.filter((p) => p.source === "mapillary"));
  const commons = creditRows(photos.filter((p) => p.source === "commons"));
  const licenses = licenseList([...photos, { license: PHOTO_LICENSE, licenseUrl: PHOTO_LICENSE_URL }]);

  return (
    <div className="relative flex min-h-dvh flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 sm:px-8">
        <h1 className="text-display py-4 text-6xl text-maize-gradient sm:py-6 sm:text-8xl">Credits</h1>

        <Section title="Photos">
          <Sub title="Mapillary" href="https://www.mapillary.com/">
            <CreditList rows={mapillary} />
          </Sub>
          <Sub title="Wikimedia Commons" href="https://commons.wikimedia.org/">
            <CreditList rows={commons} />
          </Sub>
          <Suspense fallback={<Sub title="Players">…</Sub>}>
            <PlayerCredits />
          </Suspense>
        </Section>

        <Section title="Licenses">
          <List>
            {licenses.map((l) => (
              <li key={l.name}>
                <a href={l.url} {...ext} rel="noopener noreferrer license" className={link}>
                  {l.name}
                </a>
              </li>
            ))}
          </List>
        </Section>

        <Section title="Changes">
          <List>
            <li>Photos are resized and saved without their embedded camera, date and location data. Nothing else is changed.</li>
            <li>Photos under a ShareAlike license stay under that license here.</li>
            <li>Faces in player photos may be blurred.</li>
          </List>
        </Section>

        <Section title="Map">
          <List>
            <li>
              Map data ©{" "}
              <a href="https://www.openstreetmap.org/copyright" {...ext} className={link}>
                OpenStreetMap contributors
              </a>
              , under the{" "}
              <a href="https://opendatacommons.org/licenses/odbl/" {...ext} className={link}>
                ODbL
              </a>
            </li>
            <li>Campus boundary and landmark locations from OpenStreetMap</li>
            <li>
              Tiles and style by{" "}
              <a href="https://openfreemap.org/" {...ext} className={link}>
                OpenFreeMap
              </a>
              , built on{" "}
              <a href="https://openmaptiles.org/" {...ext} className={link}>
                OpenMapTiles
              </a>
            </li>
            <li>
              Drawn with{" "}
              <a href="https://maplibre.org/" {...ext} className={link}>
                MapLibre GL JS
              </a>
            </li>
          </List>
        </Section>

        <Section title="Globe">
          <List>
            <li>
              Land and lakes from{" "}
              <a href="https://www.naturalearthdata.com/" {...ext} className={link}>
                Natural Earth
              </a>{" "}
              (public domain)
            </li>
            <li>
              Drawn with{" "}
              <a href="https://d3js.org/" {...ext} className={link}>
                D3
              </a>
            </li>
          </List>
        </Section>

        <Section title="Type">
          <List>
            <li>Barlow Condensed by Jeremy Tribby</li>
            <li>Manrope by Mikhail Sharanda</li>
            <li>Geist Mono by Vercel</li>
            <li>
              All under the{" "}
              <a href="https://openfontlicense.org/" {...ext} className={link}>
                SIL Open Font License
              </a>
            </li>
          </List>
        </Section>

        <Section title="Software">
          <List>
            <li>
              <a href="https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector" {...ext} className={link}>
                MediaPipe
              </a>{" "}
              and its BlazeFace model, under the{" "}
              <a href="https://www.apache.org/licenses/LICENSE-2.0" {...ext} className={link}>
                Apache License 2.0
              </a>
            </li>
          </List>
        </Section>

        <p className="mt-12 text-sm text-foreground/50">Not affiliated with the University of Michigan.</p>
      </main>
      <Footer />
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
  return (
    <Sub title="Players">
      {rows.length ? (
        <CreditList rows={rows} />
      ) : (
        <p className="text-sm text-foreground/60">
          None yet.{" "}
          <Link href="/contribute" className={link}>
            Add yours
          </Link>
        </p>
      )}
    </Sub>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 first-of-type:mt-2">
      <h2 className="text-display mb-3 text-3xl text-maize sm:text-4xl">{title}</h2>
      {children}
    </section>
  );
}

function Sub({ title, href, children }: { title: string; href?: string; children: ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <h3 className="mb-1.5 text-base font-extrabold text-foreground">
        {href ? (
          <a href={href} {...ext} className="hover:text-maize">
            {title}
          </a>
        ) : (
          title
        )}
      </h3>
      {children}
    </div>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-1.5 text-sm leading-relaxed text-foreground/85">{children}</ul>;
}

function CreditList({ rows }: { rows: CreditRow[] }) {
  return (
    <List>
      {rows.map((r) => (
        <li key={`${r.author}\u0000${r.license}`}>
          {r.author}
          <span className="text-foreground/40"> · </span>
          <a href={r.licenseUrl} target="_blank" rel="noopener noreferrer license" className={link}>
            {r.license}
          </a>
        </li>
      ))}
    </List>
  );
}
