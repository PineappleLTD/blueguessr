import type { Metadata } from "next";
import BackLink from "@/components/site/BackLink";
import Screen from "@/components/site/Screen";
import Leaderboard from "@/components/solo/Leaderboard";

export const metadata: Metadata = {
  title: "Leaderboard · BlueGuessr",
};

/** The daily leaderboard. The shell is static; rankings load from /api/leaderboard. */
export default function LeaderboardPage() {
  return (
    <Screen fit header={<BackLink className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-4 z-30 sm:left-6" />}>
      <Leaderboard />
    </Screen>
  );
}
