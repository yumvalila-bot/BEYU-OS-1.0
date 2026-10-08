/**
 * BEYU OS request proxy — the ONE hostname-aware routing layer.
 *
 * Adapter only. Every decision is made by the pure, unit-tested
 * `decideProxyAction()` in `src/lib/sector-domains.ts`; this file turns a
 * `NextRequest` into request facts and a `ProxyAction` into a response.
 *
 * What it does (and the complete list of what it does):
 *   1. refuses unsafe-method requests whose `Origin` is foreign (CSRF
 *      hardening across the canonical hosts; no CORS header is ever added);
 *   2. on a canonical Sector OS host, redirects paths owned by a DIFFERENT
 *      canonical sector to that sector's canonical host — same path, target
 *      host built from the catalogue + `BEYU_CANONICAL_DOMAIN`, never from the
 *      request; cannot loop because the target host owns the path;
 *   3. passes everything else through unchanged.
 *
 * What it never does: it reads no cookie, resolves no session, touches no
 * database, and grants nothing. A hostname selects a home; the route's own
 * server-side gate (session → tenant → entity → country → classification →
 * RBAC/ABAC → permission → policy → OS authorization → RLS) decides access on
 * every request, on every host, exactly as before this file existed.
 *
 * When `BEYU_CANONICAL_DOMAIN` is not configured, no host resolves to a sector
 * and only the Origin check is active.
 */
import { NextResponse, type NextRequest } from "next/server";
import { decideProxyAction, sectorDomainOptionsFromEnvironment } from "@/lib/sector-domains";

export function proxy(request: NextRequest): NextResponse {
  const action = decideProxyAction(
    {
      host: request.headers.get("host"),
      pathname: request.nextUrl.pathname,
      method: request.method,
      origin: request.headers.get("origin"),
      protocol: request.nextUrl.protocol,
      port: request.nextUrl.port,
    },
    sectorDomainOptionsFromEnvironment(),
  );

  switch (action.kind) {
    case "FORBIDDEN":
      // Uniform and information-free: no detail about which origins are trusted.
      return new NextResponse("Forbidden", {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    case "REDIRECT": {
      const location = new URL(action.location);
      location.search = request.nextUrl.search;
      return NextResponse.redirect(location, action.status);
    }
    default:
      return NextResponse.next();
  }
}

export const config = {
  // Static assets and framework internals are never routed; everything else —
  // pages, the Health mount, the launcher and the API — passes through the one
  // decision function.
  matcher: ["/((?!_next/static|_next/image|brand/|noelia/|favicon\\.ico|manifest\\.webmanifest|NOELIA\\.png).*)"],
};
