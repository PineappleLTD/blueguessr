import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "@/components/site/Header";
import VersusRoom, { RoomLoading } from "@/components/versus/VersusRoom";

export const metadata: Metadata = {
  title: "Versus | BlueGuessr",
};

export default function VersusRoomPage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense fallback={<RoomLoading />}>
      {params.then(({ code }) => (
        <VersusRoom code={code.toUpperCase()} header={<Header />} />
      ))}
    </Suspense>
  );
}
