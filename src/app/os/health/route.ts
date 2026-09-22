/**
 * `/os/health` — canonical Health OS route (Sector OS: HEALTH → Health OS).
 *
 * This is the route the canonical OS registry resolves Health OS to
 * (`src/lib/operating-system-catalog.ts` → `href: "/os/health"`), advertised by
 * the governed launcher, the capability map and the sidebar only when
 * `authorizedOperatingSystems()` proves Health federation is authorized for the
 * principal.
 *
 * WHY A ROUTE HANDLER, NOT A PAGE UNDER `src/app/os/layout.tsx`
 *   Health OS is the EXISTING federated sector SPA: it is served as one
 *   self-contained document and owns its own in-UI chrome. It is mounted as a
 *   route handler for the same reason `/health/os` always was — the BEYU OS
 *   shell (`src/app/os/layout.tsx`) is the CONTROL PLANE shell, and forcing a
 *   Health-only principal (valid session + federation link, but deliberately
 *   granted no control-plane capability) through it would bounce them to
 *   `/launcher` and break the canonical Health destination. A route handler is
 *   not rendered through layouts, so the canonical route reaches the sector
 *   implementation directly — with no second shell and no relaxation of the
 *   gate, which still runs server-side on every request (`./mount`).
 *
 * The route adds NO authorization logic of its own: it delegates to the single
 * shared Health OS mount, so the canonical route and the legacy alias cannot
 * diverge.
 */
import { serveHealthOS } from "./mount";

// Session + federation state is per-request; never prerender or cache.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return serveHealthOS();
}
