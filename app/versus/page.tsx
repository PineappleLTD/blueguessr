import type { Metadata } from "next";
import Header from "@/components/site/Header";
import VersusHome from "@/components/versus/VersusHome";
import Footer from "@/components/site/Footer";

export const metadata: Metadata = {
  title: "Versus | BlueGuessr",
};

export default function VersusPage() {
  return (
    <>
      <Header />
      <VersusHome />
      <Footer waves={false} solid={false} className="relative z-10" />
    </>
  );
}
