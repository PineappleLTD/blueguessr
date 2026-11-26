"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Menu, X } from "lucide-react";
import { NavList } from "./NavList";
import PineappleGlyph from "./PineappleGlyph";
import { CREDITS_HREF, isActive, NAV_LINKS, PINEAPPLE_URL } from "./nav";

/** Desktop tabs with the current page highlighted, plus the phone menu. */
export default function HeaderNav() {
  const pathname = usePathname();
  return (
    <>
      <NavList pathname={pathname} />
      <MobileMenu pathname={pathname} />
    </>
  );
}

/** Phone menu: a full-screen "pause menu" of big buttons. */
function MobileMenu({ pathname }: { pathname: string | null }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const close = useCallback(() => dialogRef.current?.close(), []);
  const open = () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
  };

  // Unlock scrolling however the dialog closes (button, Esc, backdrop, link).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      document.documentElement.style.overflow = "";
    };
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  // Pages stay mounted (hidden) after navigating away; don't come back to an open menu.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open) dialog.close();
      document.documentElement.style.overflow = "";
    };
  }, []);

  return (
    <>
      <button type="button" onClick={open} aria-haspopup="dialog" className="site-menu-btn md:hidden">
        <Menu className="size-5" strokeWidth={2.75} aria-hidden />
        Menu
      </button>
      <dialog
        ref={dialogRef}
        aria-label="Menu"
        className="site-menu"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="flex min-h-full flex-col gap-6 px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <span className="text-display text-3xl text-maize-gradient">Menu</span>
            <button type="button" onClick={close} aria-label="Close menu" className="site-menu-close">
              <X className="size-6" strokeWidth={3} aria-hidden />
            </button>
          </div>
          <nav aria-label="Main" className="flex flex-col gap-4">
            {NAV_LINKS.map(({ href, label, icon: Icon }, i) => (
              <Link
                key={href}
                href={href}
                onClick={close}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={`site-menu-item btn-game ${i === 0 ? "" : "btn-game-blue"}`}
                style={{ "--i": i } as React.CSSProperties}
              >
                <Icon className="size-6" strokeWidth={2.75} aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex items-center justify-between gap-4 text-sm font-semibold text-foreground/70">
            <Link href={CREDITS_HREF} onClick={close} className="rounded-lg px-2 py-1.5 hover:text-maize">
              Credits
            </Link>
            <a
              href={PINEAPPLE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 hover:text-maize"
            >
              <PineappleGlyph className="h-6 w-auto" />
              a pineapple project
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}
