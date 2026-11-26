import type { Metadata } from "next";
import Footer from "@/components/site/Footer";
import Header from "@/components/site/Header";
import Leaderboard, { LeaderboardBackdrop } from "@/components/solo/Leaderboard";

export const metadata: Metadata = {
  title: "Leaderboard · BlueGuessr",
};

/** Ranked solo leaderboard. The shell is static; rankings load from /api/leaderboard. */
export default function LeaderboardPage() {
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <LeaderboardBackdrop />
      <Header />
      <Leaderboard />
      <Footer waves={false} solid={false} className="z-10 shrink-0" />
    </div>
  );
}
