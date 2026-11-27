import Link from "next/link";
import PineappleGlyph from "./PineappleGlyph";
import Waves from "./Waves";
import { CREDITS_HREF, GITHUB_URL, PINEAPPLE_URL } from "./nav";

function GitHubMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/**
 * Site footer: drifting waves, then "a pineapple project" (links to pineapplehacks.com),
 * Credits and GitHub. `waves={false}` drops the wave edge.
 */
export default function Footer({
  className = "",
  waves = true,
  solid = true,
}: {
  className?: string;
  waves?: boolean;
  /** `false` lets whatever is behind the footer show through (the home page's dunes). */
  solid?: boolean;
}) {
  return (
    <footer className={`relative ${className}`}>
      {waves && <Waves />}
      <div className={solid ? "bg-mblue-deep" : undefined}>
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-between sm:px-8 sm:pb-6">
          <a href={PINEAPPLE_URL} target="_blank" rel="noopener noreferrer" className="site-pineapple group">
            <PineappleGlyph className="h-8 w-auto transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110" />
            <span>a pineapple project</span>
          </a>
          <p className="order-last text-center text-xs text-foreground/45 sm:order-none">
            Not affiliated with the University of Michigan.
          </p>
          <nav aria-label="Footer" className="flex items-center gap-1">
            <Link href={CREDITS_HREF} className="site-footer-link">
              Credits
            </Link>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="site-footer-link">
              <GitHubMark className="size-4" />
              GitHub
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
