import type { Metadata } from "next";
import Header from "@/components/site/Header";
import Leaderboard, { LeaderboardBackdrop } from "@/components/solo/Leaderboard";

export const metadata: Metadata = {
  title: "Leaderboard · BlueGuessr",
};

/** Ranked solo leaderboard. The shell is static; rankings load from /api/leaderboard. */
export default function LeaderboardPage() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <LeaderboardBackdrop />
      <Header />
      <Leaderboard />
    </div>
  );
}
