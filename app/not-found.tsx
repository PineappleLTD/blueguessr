import type { Metadata } from "next";
import Link from "next/link";
import { House } from "lucide-react";
import Header from "@/components/site/Header";
import LostPin from "@/components/site/LostPin";
import Screen from "@/components/site/Screen";

export const metadata: Metadata = {
  title: "Lost on campus? | BlueGuessr",
};

export default function NotFound() {
  return (
    <Screen header={<Header />} className="items-center justify-center px-5 pb-[10svh] text-center">
      <LostPin className="w-[min(60vw,240px)]" />
      <p aria-hidden className="nf-404 text-display text-maize-gradient -mt-2">
        404
      </p>
      <h1 className="text-display mt-4 text-[clamp(2.3rem,8vw,4rem)] text-foreground">Lost on campus?</h1>
      <Link href="/" className="btn-game mt-6 gap-3 rounded-[1.3rem] px-10 py-4 text-[1.8rem]">
        <House className="size-7" strokeWidth={2.75} aria-hidden />
        Home
      </Link>
    </Screen>
  );
}
