"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/** A small back arrow: back in history when we came from this site, else home. */
export default function BackLink({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <Link
      href="/"
      aria-label="Back"
      onClick={(e) => {
        if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) {
          e.preventDefault();
          router.back();
        }
      }}
      className={`grid size-10 place-items-center rounded-xl border border-maize/20 bg-night/60 text-maize backdrop-blur transition hover:-translate-x-0.5 hover:border-maize/50 ${className}`}
    >
      <ArrowLeft className="size-5" strokeWidth={2.75} />
    </Link>
  );
}
