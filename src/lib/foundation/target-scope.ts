/**
 * BEYU Foundation OS — canonical Foundation target scope (server side).
 *
 * ONE boundary, TWO callers. The Foundation deep-link layout
 * (`src/app/os/foundation/layout.tsx`) has always proved that the canonical
 * Foundation tenant (`BEYU-FOUNDATION`) is inside the principal's resolved
 * tenant and classification scope, and that a legal-entity-scoped grant does
 * not read tenant-wide Foundation records. Protected API execution must prove
 * the SAME facts independently — never from the URL, a query parameter, a
 * client-supplied tenant, hidden UI state or a prior navigation.
 *
 * This module is that single server-side statement of the boundary. It adds no
 * authorization model: it calls the existing canonical Sector OS resolver
 * (`resolveOperatingSystemTenant`) and the existing tenant/classification
 * primitives, so a change to those primitives changes both boundaries at once.
 *
 * Every function here FAILS CLOSED. When the canonical Foundation target cannot
 * be resolved, nothing is returned that could be used to widen a query — the
 * caller is denied. There is deliberately no fallback to all tenants, a default
 * tenant, the first tenant, the principal's own tenant, or public data.
 */
import type { Principal } from "@/lib/authz";
import {
  resolveOperatingSystemTenant,
  type ResolvedOperatingSystemTenant,
} from "@/lib/operating-systems";

/** The canonical Foundation Sector OS tenant code (seeded in src/db/seed.ts). */
export const FOUNDATION_TARGET_TENANT_CODE = "BEYU-FOUNDATION";

/**
 * Denial reasons are stable, non-leaking identifiers: they never disclose which
 * tenant, classification or record exists. They are used verbatim by the API
 * boundary (403 + DENIED audit) and by the domain services (FoundationError).
 */
export const FOUNDATION_TARGET_SCOPE_REASONS = {
  ENTITY_SCOPED:
    "Foundation OS target scope: this grant is limited to named legal entities, and Foundation records cannot prove complete entity containment; tenant-wide Foundation access is refused.",
  UNRESOLVED:
    "Foundation OS target scope: the canonical Foundation tenant is outside the principal's resolved tenant and classification scope.",
} as const;

export type FoundationTargetScope = {
  /** Authoritative Foundation tenant for every read and mutation. */
  tenantId: string;
  classification: ResolvedOperatingSystemTenant["classification"];
};

export type FoundationTargetResolution =
  | { ok: true; scope: FoundationTargetScope }
  | { ok: false; reason: string };

/**
 * Resolve the authoritative Foundation target scope from the authenticated
 * principal alone.
 *
 * Fails closed when the grant is entity-scoped, when the canonical Foundation
 * tenant is not inside the principal's resolved tenant subtree, when it is not
 * ACTIVE, when its classification exceeds the principal's clearance, or when
 * the principal's clearance is unknown/malformed.
 */
export async function resolveFoundationTargetScope(
  principal: Principal,
): Promise<FoundationTargetResolution> {
  // Entity-scoped grants are refused before any Foundation row is considered:
  // Foundation substrates mix foundation-keyed and legal-entity-keyed records,
  // so a named-entity grant must never be widened into a tenant-wide read.
  if (principal.entityScope.length > 0) {
    return { ok: false, reason: FOUNDATION_TARGET_SCOPE_REASONS.ENTITY_SCOPED };
  }

  const tenant = await resolveOperatingSystemTenant(principal, FOUNDATION_TARGET_TENANT_CODE);
  if (!tenant) {
    return { ok: false, reason: FOUNDATION_TARGET_SCOPE_REASONS.UNRESOLVED };
  }

  return {
    ok: true,
    scope: { tenantId: tenant.id, classification: tenant.classification },
  };
}

/**
 * Denial reason for the API boundary, or `null` when the Foundation target scope
 * resolves. Kept separate from the throwing wrappers so `guarded()` can audit a
 * denial and return the canonical error envelope instead of an exception.
 */
export async function foundationTargetScopeDenial(principal: Principal): Promise<string | null> {
  const resolution = await resolveFoundationTargetScope(principal);
  return resolution.ok ? null : resolution.reason;
}
