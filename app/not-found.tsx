import type { Metadata } from "next";
import Link from "next/link";
import { House } from "lucide-react";
import Footer from "@/components/site/Footer";
import Header from "@/components/site/Header";
import LostPin from "@/components/site/LostPin";

export const metadata: Metadata = {
  title: "Lost on campus? | BlueGuessr",
};

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="relative isolate flex flex-1 flex-col items-center justify-center overflow-hidden px-5 pt-4 pb-14 text-center">
        <div className="lp-sky" aria-hidden />
        <LostPin className="w-[min(78vw,320px)]" />
        <p aria-hidden className="nf-404 text-display text-maize-gradient -mt-2 pr-[0.08em]">
          404
        </p>
        <h1 className="text-display mt-5 text-[clamp(2.5rem,9vw,4.75rem)] text-foreground">Lost on campus?</h1>
        <Link href="/" className="btn-game mt-8 gap-3 rounded-[1.3rem] px-10 py-5 text-[2rem]">
          <House className="size-7" strokeWidth={2.75} aria-hidden />
          Home
        </Link>
      </main>
      <Footer />
    </>
  );
}
