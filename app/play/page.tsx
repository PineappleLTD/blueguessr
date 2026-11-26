import type { Metadata } from "next";
import SoloGame from "@/components/solo/SoloGame";

export const metadata: Metadata = {
  title: "Play · BlueGuessr",
};

/** Solo game. Everything happens in the browser against /api/game; the shell is static. */
export default function PlayPage() {
  return <SoloGame />;
}
