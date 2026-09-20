"use client";

import { BeyuOsLogo } from "@/components/beyu-os-logo";

/** Never render raw server errors, credentials, or governed data. */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="beyu-panel mx-auto my-10 max-w-lg p-6">
      <BeyuOsLogo size={48} />
      <h1 className="mt-4 text-xl font-semibold">BEYU OS could not load this view</h1>
      <p className="mt-2 beyu-muted">Please try again. Access remains subject to your existing permissions.</p>
      <button type="button" onClick={reset} className="mt-4 min-h-11 rounded border px-4 focus-visible:outline-2 focus-visible:outline-offset-2">Try again</button>
    </main>
  );
}
