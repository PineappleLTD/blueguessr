import { Loader2, Lock } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import AdminLogin from "@/components/admin/AdminLogin";
import ReviewDesk from "@/components/admin/ReviewDesk";
import Header from "@/components/site/Header";
import { adminEnabled, isAdmin } from "@/lib/admin-auth";
import { reviewData } from "@/lib/contributions";

export const metadata: Metadata = {
  title: "Review | BlueGuessr",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-16 sm:px-8">
        <Suspense
          fallback={
            <div className="grid flex-1 place-items-center py-24">
              <Loader2 className="size-10 animate-spin text-maize" aria-label="Loading" />
            </div>
          }
        >
          <AdminGate />
        </Suspense>
      </main>
    </div>
  );
}

/** Reads the session cookie, so it renders at request time inside the Suspense boundary. */
async function AdminGate() {
  const signedIn = await isAdmin();
  if (!adminEnabled()) {
    return (
      <div className="panel mx-auto mt-[8vh] flex w-full max-w-sm flex-col items-center gap-4 p-8 text-center">
        <Lock className="size-12 text-maize/70" aria-hidden />
        <h1 className="text-display text-5xl text-maize">Admin is off</h1>
        <code className="rounded-lg bg-mblue-deep px-3 py-1.5 font-mono text-sm text-foreground/70">ADMIN_PASSWORD</code>
      </div>
    );
  }
  if (!signedIn) return <AdminLogin />;
  return <ReviewDesk initial={await reviewData()} />;
}
