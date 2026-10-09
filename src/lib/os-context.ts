/**
 * Canonical presentation context for the active application route.
 *
 * PRESENTATION ONLY. Route context is selected from the canonical catalogue;
 * it is never an authorization input. Every destination independently re-runs
 * its server-side RBAC/ABAC, tenant/entity scope and RLS checks.
 */
import {
  BEYU_CONTROL_PLANE,
  GOVERNED_ROUTE_DESTINATIONS,
  type GovernedDestination,
} from "./operating-system-catalog";

/**
 * Resolve a known governed route from catalogue facts, never URL-derived
 * authority. Unknown paths resolve to the BEYU control-plane presentation.
 */
export function governedDestinationForPath(
  pathname: string | null | undefined,
): GovernedDestination {
  const path = pathname ?? "";
  const withinRoute = (href: string) =>
    path === href || path.startsWith(`${href}/`);
  return (
    GOVERNED_ROUTE_DESTINATIONS.find((destination) =>
      withinRoute(destination.href),
    ) ?? BEYU_CONTROL_PLANE
  );
}

/**
 * Noelia's appearance context for each governed destination. The Foundation
 * organization deliberately uses BEYU_OS: Foundation is not a Sector OS and no
 * sector-specific Noelia identity or manifestation is created. Identity remains
 * the one canonical NOELIA_AI in every context.
 */
export const NOELIA_OS_CONTEXT_BY_DESTINATION_CODE: Record<
  GovernedDestination["code"],
  string
> = {
  BEYU: "BEYU_OS",
  FINANCE: "FINANCE_OS",
  HEALTH: "HEALTH_OS",
  AGRICULTURE: "AGRICULTURE_OS",
  FOUNDATION: "BEYU_OS",
  UJENZI: "UJENZI_OS",
};

/** Return the canonical Noelia appearance context for the active route. */
export function noeliaOSContextForPath(
  pathname: string | null | undefined,
): string {
  return NOELIA_OS_CONTEXT_BY_DESTINATION_CODE[
    governedDestinationForPath(pathname).code
  ];
}
