import type { Metadata } from "next";
import Header from "@/components/site/Header";
import Screen from "@/components/site/Screen";
import VersusHome from "@/components/versus/VersusHome";

export const metadata: Metadata = {
  title: "Versus | BlueGuessr",
};

export default function VersusPage() {
  return (
    <Screen header={<Header />}>
      <VersusHome />
    </Screen>
  );
}
