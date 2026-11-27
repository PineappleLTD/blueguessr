import type { Metadata } from "next";
import SoloGame from "@/components/solo/SoloGame";

export const metadata: Metadata = {
  title: "Daily · BlueGuessr",
};

/** The Daily BlueGuessr: today's five photos, the same for everyone, 30 seconds a round. */
export default function DailyPage() {
  return <SoloGame daily />;
}
