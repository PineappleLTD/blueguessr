import { Camera, ExternalLink } from "lucide-react";
import type { PhotoSource, RoundReveal } from "@/lib/types";

const SOURCE_LABEL: Record<PhotoSource, string> = {
  mapillary: "Mapillary",
  commons: "Wikimedia Commons",
  player: "BlueGuessr player",
};

/**
 * Attribution for a revealed photo: title (if any), photographer, license (linked to the deed)
 * and where it came from (linked to the original page). Required by the CC licenses, so show it
 * on every reveal. Never render this before the guess: the source link gives the place away.
 */
export default function PhotoCredit({ reveal, className = "" }: { reveal: RoundReveal; className?: string }) {
  const sourceLabel = SOURCE_LABEL[reveal.source];
  return (
    <p className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-foreground/60 ${className}`}>
      <Camera className="size-3.5 shrink-0 text-maize/80" aria-hidden />
      {reveal.title && <span className="italic">“{reveal.title}”</span>}
      {reveal.title && <span aria-hidden>·</span>}
      <span className="font-semibold text-foreground/80">{reveal.author}</span>
      <span aria-hidden>·</span>
      <a
        href={reveal.licenseUrl}
        target="_blank"
        rel="noopener noreferrer license"
        className="underline decoration-maize/40 underline-offset-2 hover:text-maize"
      >
        {reveal.license}
      </a>
      <span aria-hidden>·</span>
      {reveal.sourceUrl ? (
        <a
          href={reveal.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 underline decoration-maize/40 underline-offset-2 hover:text-maize"
        >
          {sourceLabel}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : (
        <span>{sourceLabel}</span>
      )}
    </p>
  );
}
