/**
 * Health OS mount — serves the EXISTING Health OS implementation.
 *
 * The sector's single-file SPA (`sectors/health`, React/Vite, compiled by
 * `scripts/build-health-spa.mjs` into `./spa-content`) is served at this route.
 *
 * Authorization is re-checked HERE, on every request, with the exact same
 * BEYU gate the `/health` page applies — a deep link must not trust the
 * referrer:
 *
 *   1. `resolvePrincipal()` — canonical BEYU session (unauthenticated → 307 `/`).
 *   2. `checkHealthOSAuthorization()` — canonical identity federation link in
 *      `beyu_identity.beyu_identity_links`, fail-closed (not linked / service
 *      unavailable → 307 back to `/health`, which renders the truthful
 *      denial/availability pages).
 *
 * What is deliberately NOT done here:
 *   - No second shell, sidebar, session system or authorization provider.
 *   - No bridging of the BEYU session into the sector's own JWT session —
 *     that runtime auth-flow integration is a documented architectural
 *     decision (`sectors/health/INTEGRATION.md`), not this wiring.
 *   - The SPA's only network surface is same-origin `/health-os/auth/*`
 *     (its existing `VITE_API_BASE_URL` knob, set at build time). Those paths
 *     are proxied to the sector backend by `next.config.ts` rewrites ONLY when
 *     `HEALTH_API_URL` is configured; otherwise they 404 and the SPA's own
 *     sign-in fails closed. No backend credential ever reaches the browser.
 */
import { NextResponse } from "next/server";
import { resolvePrincipal } from "@/lib/session";
import { checkHealthOSAuthorization } from "@/lib/health-os-authorization";
import { healthSpaHtml } from "./spa-content";

// Session + federation state is per-request; never prerender or cache.
export const dynamic = "force-dynamic";

export async function GET() {
  // Gate 1 — canonical BEYU session (fail closed).
  const principal = await resolvePrincipal();
  if (!principal) {
    return new NextResponse(null, {
      status: 307,
      headers: { Location: "/" },
    });
  }

  // Gate 2 — canonical identity federation link (fail closed).
  const healthAuth = await checkHealthOSAuthorization(principal.userId);
  if (!healthAuth.authorized) {
    // Reuse the /health page: it renders the truthful denial and
    // availability states ("This availability state does not prove …").
    return new NextResponse(null, {
      status: 307,
      headers: { Location: "/health" },
    });
  }

  // Authorized — serve the compiled sector SPA document (one document; the
  // SPA navigates in memory and owns its own in-UI chrome).
  return new NextResponse(healthSpaHtml, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      // Session-bearing, authorization-scoped content: no caching layers.
      "Cache-Control": "no-store",
    },
  });
}
