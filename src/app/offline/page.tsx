import type { Metadata } from "next";
import Link from "next/link";
import { BeyuOsLogo } from "@/components/beyu-os-logo";
import { OfflineRetryButton } from "./retry-button";

export const metadata: Metadata = {
  title: "Offline — BEYU OS",
  description: "You are currently offline. BEYU OS will reconnect automatically when network access returns.",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="beyu-panel mx-auto my-10 max-w-lg p-6 text-center">
      <BeyuOsLogo size={48} />
      <h1 className="mt-4 text-xl font-semibold tracking-tight">You are offline</h1>
      <p className="mt-2 text-[13px] leading-relaxed beyu-muted">
        BEYU OS cannot reach the server right now. This may be a temporary network interruption.
      </p>
      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left">
        <p className="text-[12px] font-semibold text-amber-800">What you can do</p>
        <ul className="mt-2 list-disc pl-5 text-[12px] leading-relaxed text-amber-900/80">
          <li>Check your internet connection and try again.</li>
          <li>Static pages you have already visited may still be available from cache.</li>
          <li>Authenticated actions, financial postings, and governed approvals require connectivity and will resume when you are back online — nothing is queued silently.</li>
        </ul>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#0B1F4D] px-5 text-[13px] font-semibold text-white hover:bg-[#16294a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B1F4D]"
        >
          Return to sign-in
        </Link>
        <OfflineRetryButton />
      </div>
      <p className="mt-6 text-[11px] leading-relaxed beyu-muted">
        BEYU OS does not cache authenticated content, personal data, or session credentials for offline use.
        When you reconnect, your session will be re-validated server-side.
      </p>
    </main>
  );
}
