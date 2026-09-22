/**
 * Canonical Health OS mount — ONE implementation for the governed Health OS
 * entry points.
 *
 * `sectors/health` (the EXISTING federated sector SPA, compiled by
 * `scripts/build-health-spa.mjs` into `src/app/health/os/spa-content.ts`) is
 * mounted here so that the canonical Sector OS route `/os/health` and the
 * pre-existing legacy alias `/health/os` serve the SAME document from the SAME
 * gate. There is no second mount, no second shell, no second authorization
 * check and no duplicated sector bundle.
 *
 * Authorization is re-run HERE, on every request, on both URLs:
 *
 *   1. `resolvePrincipal()` — canonical BEYU session (unauthenticated → 307 `/`).
 *      A direct deep link is never trusted.
 *   2. `checkHealthOSAuthorization()` — canonical identity federation link in
 *      `beyu_identity.beyu_identity_links`, fail-closed (not linked / service
 *      unavailable → 307 back to `/health`, which renders the truthful denial
 *      or availability page).
 *
 * The URL is NOT an authorization input: no branch in this module reads the
 * pathname, a header or search params. Health OS authority comes only from the
 * canonical session and the federation link, exactly as before this route was
 * made canonical.
 *
 * What is deliberately NOT done here:
 *   - No second shell, sidebar, session system or authorization provider.
 *   - No bridging of the BEYU session into the sector's own JWT session — that
 *     runtime auth-flow integration is a documented architectural decision
 *     (`sectors/health/INTEGRATION.md`), not routing.
 *   - The SPA's only network surface remains same-origin `/health-os/auth/*`
 *     (its existing `VITE_API_BASE_URL` build-time knob), proxied to the sector
 *     backend by `next.config.ts` rewrites ONLY when `HEALTH_API_URL` is
 *     configured; otherwise those paths 404 and the SPA's sign-in fails closed.
 *     No backend credential ever reaches the browser.
 */
import { NextResponse } from "next/server";
import { healthSpaHtml } from "@/app/health/os/spa-content";
import { checkHealthOSAuthorization } from "@/lib/health-os-authorization";
import { resolvePrincipal } from "@/lib/session";

/**
 * Truthful Health OS denial/availability surface (`src/app/health/page.tsx`).
 * Both gates fail closed TO this page rather than to an error or a fallback OS.
 */
export const HEALTH_OS_DENIAL_PATH = "/health";

/**
 * Serve Health OS for the current request, or fail closed.
 *
 * Returns the compiled sector SPA document as `text/html` (one document; the
 * SPA navigates in memory and owns its own in-UI chrome) only after BOTH gates
 * pass. Every other outcome is a 307 redirect — never a partial render.
 */
export async function serveHealthOS(): Promise<NextResponse> {
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
    return new NextResponse(null, {
      status: 307,
      headers: { Location: HEALTH_OS_DENIAL_PATH },
    });
  }

  // Authorized — serve the compiled sector SPA document.
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
