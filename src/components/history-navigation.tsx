"use client";

import { useRouter } from "next/navigation";

/** Browser history only. Destinations retain all existing server-side guards.
 * Neither history.length nor a client counter reveals forward availability.
 * Leave both controls enabled: browsers safely no-op at history boundaries.
 */
export function HistoryNavigation() {
  const router = useRouter();
  const buttonClass = "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border border-white/20 px-3 text-xs font-medium text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37]";

  return (
    <nav aria-label="Page history" className="flex shrink-0 items-center gap-2 print:hidden">
      <button type="button" aria-label="Back" title="Back" onClick={() => router.back()} className={buttonClass}>
        <span aria-hidden="true">←</span><span className="hidden sm:inline">Back</span>
      </button>
      <button type="button" aria-label="Next" title="Next" onClick={() => router.forward()} className={buttonClass}>
        <span className="hidden sm:inline">Next</span><span aria-hidden="true">→</span>
      </button>
    </nav>
  );
}
