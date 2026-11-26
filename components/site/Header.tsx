import Link from "next/link";

const LINKS = [
  { href: "/play", label: "Play" },
  { href: "/versus", label: "Versus" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/contribute", label: "Contribute" },
];

/** Top bar used on every page except the in-game screens. */
export default function Header() {
  return (
    <header className="relative z-30 flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
      <Link href="/" className="group flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="size-8 transition-transform group-hover:-rotate-12 group-hover:scale-110" />
        <span className="text-display text-2xl text-maize-gradient">BlueGuessr</span>
      </Link>
      <nav className="flex items-center gap-1 text-sm font-semibold sm:gap-2">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-full px-3 py-1.5 text-foreground/70 transition-colors hover:bg-maize/10 hover:text-maize"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
