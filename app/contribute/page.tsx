import type { Metadata } from "next";
import ContributeFlow from "@/components/contribute/ContributeFlow";
import Dunes from "@/components/contribute/Dunes";
import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";

export const metadata: Metadata = {
  title: "Contribute | BlueGuessr",
};

export default function ContributePage() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] bg-[radial-gradient(ellipse_at_top,oklch(0.87_0.18_93/0.13),transparent_65%)]"
      />
      <Header />
      <main className="relative z-10 flex flex-1 flex-col pt-2">
        <ContributeFlow />
      </main>
      <Footer waves={false} solid={false} className="relative z-10" />
      <Dunes className="fixed inset-x-0 bottom-0 z-0 opacity-70" />
    </div>
  );
}
