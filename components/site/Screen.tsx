import type { ReactNode } from "react";
import ParticleDunes from "@/components/landing/ParticleDunes";
import Footer from "./Footer";

/**
 * The home page's look for every other page: its night sky and maize particle dunes, the page
 * filling one screen, and the footer just below it, a short scroll away. `fit` holds the page to
 * exactly one screen (long lists then scroll inside it); otherwise long pages can grow.
 */
export default function Screen({
  header,
  children,
  fit = false,
  className = "",
}: {
  header?: ReactNode;
  children: ReactNode;
  fit?: boolean;
  className?: string;
}) {
  return (
    <>
      <div className={`scene ${fit ? "h-svh" : "min-h-svh"}`}>
        <div className="lp-sky" aria-hidden />
        <ParticleDunes className="scene-dunes" />
        {header}
        <main className={`relative z-10 flex min-h-0 flex-1 flex-col ${className}`}>{children}</main>
      </div>
      <Footer waves={false} solid={false} />
    </>
  );
}
