/**
 * Canonical OS context for the ACTIVE application route.
 *
 * PRESENTATION ONLY. This module answers exactly one question — "which
 * canonical operating system is this route part of?" — so the existing Noelia
 * contextual appearance engine, and anything else that needs the active OS, is
 * driven by the canonical registry instead of by string matching.
 *
 * Hard boundaries:
 *   • Route → OS identity is resolved from the CANONICAL registry
 *     (`operating-system-catalog.ts`, the same catalogue the launcher, the
 *     sidebar, the capability map and the OS brand all consume). There is no
 *     second route table and no `pathname.includes("/health")`-style inference
 *     anywhere: a path only ever selects an entry that the registry already
 *     declares.
 *   • Nothing here is an authorization input. These functions return
 *     presentation identity only; no Principal, no `can()`, no database and no
 *     policy is read, and the value they return can never grant, widen or
 *     imply access. Every Sector OS route re-runs its own server-side
 *     authorization on every request regardless of what the URL says.
 *   • An unknown or unauthorised path resolves to the CONTROL PLANE (BEYU OS),
 *     never to a sector: there is no fallback that could present a sector
 *     context the route does not belong to.
 */
import {
  BEYU_CONTROL_PLANE,
  SECTOR_OPERATING_SYSTEMS,
  type OperatingSystemDestination,
} from "./operating-system-catalog";

/**
 * The canonical operating-system destination whose route contains `pathname`.
 *
 * Exact routes and their nested paths resolve to their declared destination
 * (`/os/ujenzi/projects` → UJENZI); everything else — including `/os` itself,
 * an invalid route such as `/os/unknown`, or a missing pathname — resolves to
 * the BEYU OS control plane.
 */
export function operatingSystemForPath(
  pathname: string | null | undefined,
): OperatingSystemDestination {
  const path = pathname ?? "";
  const withinRoute = (href: string) =>
    path === href || path.startsWith(`${href}/`);
  return (
    SECTOR_OPERATING_SYSTEMS.find((destination) => withinRoute(destination.href)) ??
    BEYU_CONTROL_PLANE
  );
}

/**
 * Noelia's OS-context vocabulary (`src/lib/noelia/context-resolver.ts`) for each
 * canonical registry destination.
 *
 * The mapping is by registry CODE, not by URL text, so a route can only ever
 * yield a context the registry declares for it. FOUNDATION is a canonical
 * Sector OS with no registered Noelia manifestation of its own; the engine
 * resolves that value to the canonical NOELIA_AI fallback, which is the
 * truthful manifestation — no Foundation asset is invented here.
 */
export const NOELIA_OS_CONTEXT_BY_OS_CODE: Record<
  OperatingSystemDestination["code"],
  string
> = {
  BEYU: "BEYU_OS",
  FINANCE: "FINANCE_OS",
  HEALTH: "HEALTH_OS",
  AGRICULTURE: "AGRICULTURE_OS",
  FOUNDATION: "FOUNDATION_OS",
  UJENZI: "UJENZI_OS",
};

/**
 * The Noelia contextual-appearance OS context for the active route.
 *
 * `/os` → BEYU_OS · `/os/health` → HEALTH_OS · `/os/finance` → FINANCE_OS ·
 * `/os/agriculture` → AGRICULTURE_OS · `/os/ujenzi` → UJENZI_OS ·
 * `/os/foundation` → FOUNDATION_OS (canonical Noelia fallback, see above).
 */
export function noeliaOSContextForPath(
  pathname: string | null | undefined,
): string {
  return NOELIA_OS_CONTEXT_BY_OS_CODE[operatingSystemForPath(pathname).code];
}
