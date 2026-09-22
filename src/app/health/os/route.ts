/**
 * `/health/os` — pre-existing Health OS mount URL, retained as a compatibility
 * alias for the canonical Sector OS route `/os/health`.
 *
 * The governed mount (session gate + canonical identity federation gate +
 * compiled sector SPA) now lives in exactly ONE place — `src/app/os/health/mount.ts`
 * — and BOTH URLs delegate to it. Existing deep links, bookmarks and external
 * references to `/health/os` therefore keep working with identical authority:
 * a request here re-runs the full gate server-side and can never be served from
 * a cache or from a previously authorized response.
 *
 * See `src/app/os/health/route.ts` for why the Health OS mount is a route
 * handler and not a page inside the control-plane shell, and
 * `src/app/os/health/mount.ts` for the gate itself.
 */
import { serveHealthOS } from "@/app/os/health/mount";

// Session + federation state is per-request; never prerender or cache.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return serveHealthOS();
}
