import Link from "next/link";
import { isActive, NAV_LINKS } from "./nav";

/** Header links. On phones only the icon shows. */
export function NavList({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="flex items-center gap-1.5">
      {NAV_LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link key={href} href={href} aria-label={label} aria-current={active ? "page" : undefined} className="site-tab">
            <Icon className="size-4" strokeWidth={2.5} aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
