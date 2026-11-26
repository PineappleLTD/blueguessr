import Link from "next/link";
import { Suspense } from "react";
import AccountButton from "./AccountButton";
import HeaderNav from "./HeaderNav";
import { MenuButtonPlaceholder, NavList } from "./NavList";

/** Top bar used on every page except the in-game screens. */
export default function Header({ className = "" }: { className?: string }) {
  return (
    <header
      className={`relative z-30 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-8 sm:py-4 ${className}`}
    >
      <Link href="/" aria-label="BlueGuessr home" className="site-logo group">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon.svg"
          alt=""
          width={36}
          height={36}
          className="size-9 rounded-[10px] shadow-[0_3px_0_var(--gold-deep)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:-rotate-12"
        />
        <span className="text-display text-[1.75rem] text-maize-gradient">BlueGuessr</span>
      </Link>
      {/* The active tab reads the URL, which can suspend on dynamic routes: keep the rest static. */}
      <div className="flex items-center gap-1.5">
        <Suspense
          fallback={
            <>
              <NavList pathname={null} />
              <MenuButtonPlaceholder />
            </>
          }
        >
          <HeaderNav />
        </Suspense>
        <AccountButton />
      </div>
    </header>
  );
}
