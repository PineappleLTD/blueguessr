import Link from "next/link";
import PineappleGlyph from "./PineappleGlyph";
import Waves from "./Waves";
import { CREDITS_HREF, PINEAPPLE_URL } from "./nav";

/**
 * Site footer: drifting waves, then "a pineapple project" (links to pineapplehacks.com),
 * the disclaimer and Credits. `waves={false}` drops the wave edge.
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
          </nav>
        </div>
      </div>
    </footer>
  );
}
