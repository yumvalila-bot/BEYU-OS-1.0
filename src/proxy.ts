/**
 * BEYU OS request proxy — the ONE hostname-aware routing layer.
 *
 * Adapter only. Every decision is made by the pure, unit-tested
 * `decideProxyAction()` in `src/lib/canonical-hosts.ts`; this file turns a
 * `NextRequest` into request facts and a `ProxyAction` into a response.
 *
 * What it does (and the complete list of what it does):
 *   1. refuses unsafe-method requests whose `Origin` is foreign (CSRF
 *      hardening across the canonical hosts; no CORS header is ever added);
 *   2. returns an information-free 404 for the Foundation organization route
 *      on another canonical destination host (Foundation is never treated as
 *      an OS-owned path);
 *   3. on a canonical OS/surface host, redirects paths owned by a DIFFERENT
 *      canonical Sector OS to that OS's canonical host — same path, target
 *      host built from the catalogue + `BEYU_CANONICAL_DOMAIN`, never from the
 *      request; cannot loop because the target host owns the path;
 *   4. calls a Foundation-only pre-stream refusal boundary; all page and API
 *      guards remain in place; passes other requests through unchanged.
 *
 * The hostname adapter itself reads no session and grants nothing; the separate
 * Foundation refusal boundary checks the live session and scope before streaming. A hostname selects a home; the route's own
 * server-side gate (session → tenant → entity → country → classification →
 * RBAC/ABAC → permission → policy → OS authorization → RLS) decides access on
 * every request, on every host, exactly as before this file existed.
 *
 * When `BEYU_CANONICAL_DOMAIN` is not configured, no host resolves to a
 * destination and only the Origin check is active.
 */
import { NextResponse, type NextRequest } from "next/server";
import { foundationPagePreflight } from "@/lib/foundation/page-preflight";
import { canonicalHostOptionsFromEnvironment, decideProxyAction } from "@/lib/canonical-hosts";

export function proxy(request: NextRequest): NextResponse | Promise<NextResponse> {
  const action = decideProxyAction(
    {
      host: request.headers.get("host"),
      pathname: request.nextUrl.pathname,
      method: request.method,
      origin: request.headers.get("origin"),
      protocol: request.nextUrl.protocol,
      port: request.nextUrl.port,
    },
    canonicalHostOptionsFromEnvironment(),
  );

  switch (action.kind) {
    case "FORBIDDEN":
      // Uniform and information-free: no detail about which origins are trusted.
      return new NextResponse("Forbidden", {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    case "NOT_FOUND":
      // Uniform and information-free: no route, session, or authority detail.
      return new NextResponse("Not Found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    case "REDIRECT": {
      const location = new URL(action.location);
      location.search = request.nextUrl.search;
      return NextResponse.redirect(location, action.status);
    }
    default:
      // Foundation performs an additional refusal-only live authorization before
      // streaming. The renderer and services independently recheck authority.
      if (request.nextUrl.pathname === "/os/foundation" || request.nextUrl.pathname.startsWith("/os/foundation/")) {
        return foundationPagePreflight(request);
      }
      return NextResponse.next();
  }
}

export const config = {
  // Static assets and framework internals are never routed; everything else —
  // pages, the Health mount, the launcher and the API — passes through the one
  // decision function.
  matcher: ["/((?!_next/static|_next/image|brand/|noelia/|favicon\\.ico|manifest\\.webmanifest|NOELIA\\.png).*)"],
};
