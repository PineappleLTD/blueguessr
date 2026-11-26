import Link from "next/link";
import { Menu } from "lucide-react";
import { isActive, NAV_LINKS } from "./nav";

/** Desktop menu tabs. Server-safe: the active tab comes in as a prop. */
export function NavList({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="hidden items-center gap-1.5 md:flex">
      {NAV_LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className="site-tab">
            <Icon className="size-4" strokeWidth={2.5} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Stand-in for the phone menu button while the client part loads. */
export function MenuButtonPlaceholder() {
  return (
    <span className="site-menu-btn md:hidden" aria-hidden>
      <Menu className="size-5" strokeWidth={2.75} />
      Menu
    </span>
  );
}
