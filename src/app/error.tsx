"use client";

import { useEffect } from "react";
import { BeyuOsLogo } from "@/components/beyu-os-logo";

/**
 * BEYU OS — root route error boundary.
 *
 * WHY THIS FILE WAS CHANGED (evidence, 2026-10-12)
 *   This is the ONLY place in the repository that renders the reported
 *   post-sign-in screen — "BEYU OS could not load this view / Please try
 *   again." It is a Next.js route error boundary, so it appears for ANY
 *   uncaught render/loader failure below the root layout, and it is NOT an
 *   access decision: every authorization outcome in BEYU OS has its own
 *   governed copy (`Authorisation denied`, the destination denial surface,
 *   "No governed destination access").
 *
 *   The previous wording asserted "Access remains subject to your existing
 *   permissions", which stated a permissions fact about a failure that was
 *   usually not permissions at all. Reproduced: a database that has not
 *   applied a migration the principal resolver reads makes EVERY
 *   authenticated view return HTTP 500 while the unauthenticated sign-in page
 *   still returns 200 — i.e. a sign-in that "works" and a next view that
 *   always fails. The screen said nothing about the real cause and discarded
 *   `error.digest`, so the one identifier that correlates with the server log
 *   line (which does carry the real cause) never reached the operator.
 *
 * WHAT THIS BOUNDARY MUST DO
 *   • tell the truth about what happened: the view could not be LOADED, and
 *     no permission was changed by the attempt;
 *   • never claim an authorization decision — access outcomes render their own
 *     screens and a load failure must not be allowed to masquerade as one;
 *   • surface the Next.js `digest` as a support reference so an operator can
 *     find the corresponding server log entry. The digest is an opaque hash;
 *     it carries no payload, no identifier and no governed data;
 *   • never render the raw exception, a stack trace, credentials or governed
 *     data (the server already logs the cause; the browser gets a reference);
 *   • keep the branded, accessible reset affordance.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reference = typeof error.digest === "string" && error.digest.length > 0 ? error.digest : null;

  /**
   * ONE sanitized client diagnostic: the reference plus the error TYPE.
   *
   * The message is deliberately NOT logged here. For a server-component
   * failure the browser only receives a generic message and the real cause is
   * already in the server log under this same digest; for a client failure the
   * message is arbitrary and may quote governed data. The digest is the
   * correlation key, and it is the only thing this boundary publishes.
   */
  useEffect(() => {
    console.error(
      `[BEYU OS] view load failure${reference ? ` — reference ${reference}` : ""}`,
      { name: error.name, reference },
    );
  }, [error, reference]);

  return (
    <main className="beyu-panel mx-auto my-10 max-w-lg p-6">
      <BeyuOsLogo size={48} />
      <h1 className="mt-4 text-xl font-semibold">BEYU OS could not load this view</h1>
      <p className="mt-2 beyu-muted">
        The view could not be loaded from the BEYU OS server. Nothing was changed: no record was written, and
        your permissions were neither granted nor removed.
      </p>
      <p className="mt-3 beyu-muted">
        This is a load failure, not an access decision. When a destination refuses you, that destination shows
        its own governed denial instead.
      </p>
      {reference && (
        <p className="mt-3 text-[12.5px] beyu-muted">
          Reference <span className="font-mono break-all">{reference}</span> identifies this failure in the
          BEYU OS server log. Quote it if you report the problem.
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-4 min-h-11 rounded border px-4 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Try again
      </button>
    </main>
  );
}
