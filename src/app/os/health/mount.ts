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
 * pathname or search params, and the host is used for ONE purpose only — to
 * REFUSE. Health OS authority comes only from the canonical session and the
 * federation link, exactly as before this route was made canonical.
 *
 * TENANT HOSTNAMES (governed tenant domains, Phase 2)
 *   The third gate resolves the request's Host header against the governed
 *   tenant-domain registry. It can only ever NARROW:
 *
 *     • a name inside a registered OS namespace that no governed row proves
 *       (`unknown.health.beyuos.co.tz`) is REFUSED — never served as the base
 *       tenant, never served as another tenant, never redirected somewhere that
 *       reveals whether the name exists;
 *     • a governed tenant hostname is accepted only after the registry row is
 *       ACTIVE, VERIFIED, bound to an ACTIVE tenant whose binding the request's
 *       resolved tenant scope already covers (the resolver reads the registry
 *       through RLS, so an out-of-scope tenant's hostname is indistinguishable
 *       from an unregistered one);
 *     • a host that belongs to no registered namespace (the deployment
 *       platform's own domain, localhost, an IP literal, a preview URL) yields
 *       NOT_APPLICABLE and this module behaves exactly as it did before, with
 *       every existing check untouched;
 *     • an unclassifiable Host value is refused.
 *
 *   What the resolved binding does NOT do: it grants nothing, skips nothing and
 *   replaces nothing. Gates 1 and 2 still run and still decide. Which tenant a
 *   hostname belongs to never substitutes for authorization, and the sector
 *   runtime still resolves its own identity federation and tenant context
 *   (`sectors/health/INTEGRATION.md`).
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
import {
  hostnameDenialResponse,
  resolutionBelongsToNamespace,
  resolutionIsPlatformNeutral,
  resolveRequestHostname,
} from "@/lib/tenant-domain";

/**
 * Truthful Health OS denial/availability surface (`src/app/health/page.tsx`).
 * Both gates fail closed TO this page rather than to an error or a fallback OS.
 */
export const HEALTH_OS_DENIAL_PATH = "/health";

/**
 * The request facts this mount is allowed to consider. Only the `Host` header is
 * passed, and only so it can cause a refusal — never a grant.
 */
export type HealthOSMountRequest = { host?: string | null };

/**
 * Serve Health OS for the current request, or fail closed.
 *
 * Returns the compiled sector SPA document as `text/html` (one document; the
 * SPA navigates in memory and owns its own in-UI chrome) only after ALL gates
 * pass. Every other outcome is a 307 redirect or a uniform 404 — never a partial
 * render, never a fallback tenant.
 */
export async function serveHealthOS(request: HealthOSMountRequest = {}): Promise<NextResponse> {
  // Gate 1 — canonical BEYU session (fail closed).
  const principal = await resolvePrincipal();
  if (!principal) {
    return new NextResponse(null, {
      status: 307,
      headers: { Location: "/" },
    });
  }

  // Gate 3 (evaluated before the federation gate because it is the cheapest and
  // the most specific): governed tenant-domain resolution. A refusal is
  // information-free and identical for every denial reason.
  const tenantDomain = await resolveRequestHostname(principal, request.host);
  if (tenantDomain.kind === "DENIED") {
    return hostnameDenialResponse();
  }

  // Gate 3b — NAMESPACE SCOPE. Health OS may only be served on a host that is
  // either platform-neutral (the deployment platform's own hostname, localhost,
  // no Host — the pre-existing execution surfaces, unchanged) or inside the
  // HEALTH OS namespace: the `health.beyuos.co.tz` base itself, or a governed
  // tenant domain bound to HEALTH_OS.
  //
  // Every other governed namespace is refused. A request arriving on
  // `familyoffice.beyuos.co.tz` (a SHARED CAPABILITY base, never an OS), on
  // `finance.beyuos.co.tz`, or on a tenant host belonging to another OS or
  // capability therefore CANNOT be answered with the Health OS document: a
  // hostname can never carry one surface's identity into another's. This is the
  // cross-OS / cross-capability half of the fail-closed contract, and it is
  // enforced here for the same reason gates 1 and 2 are — server-side, on every
  // request, regardless of what the URL says.
  const hostInHealthNamespace =
    resolutionIsPlatformNeutral(tenantDomain) || resolutionBelongsToNamespace(tenantDomain, "HEALTH_OS");
  if (!hostInHealthNamespace) {
    return hostnameDenialResponse();
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
  //
  // When a governed tenant hostname resolved, the binding it proved is exactly
  // this: hostname → ONE canonical tenant/OS that the principal's resolved tenant
  // scope already covers. The document served is byte-identical to the one served
  // on `/os/health` and on the OS base domain — the tenant hostname selects no
  // different implementation, no different data path and no different authority.
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
