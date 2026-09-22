/**
 * BEYU OS — VISUALIZATION AUTHORIZATION LAYER (shared capability, §19–§22).
 *
 * THE PIPELINE (canonical, non-negotiable order):
 *
 *   Identity → RBAC → ABAC → Policy → Scope → Data Authorization
 *          → Sector Adapter → Visualization Model → Renderer
 *
 * Every stage REUSES the existing kernel — nothing here is a second
 * authorization model:
 *   • Identity     — resolvePrincipal()/guarded() (src/lib/session.ts, api.ts)
 *   • RBAC + ABAC  — can() (src/lib/authz.ts): role grants, classification
 *                    ceilings, tenant isolation, entity scope, MFA step-up,
 *                    emergency + delegation paths all evaluated by ONE primitive
 *   • Policy/Scope — guarded() + withTenantDatabaseContext() (tenant-scope.ts);
 *                    PostgreSQL RLS remains the FINAL database boundary
 *   • Data auth    — `assertSectorAccess()` below: the SAME canonical Sector OS
 *                    resolver the launcher uses (operating-systems.ts), so the
 *                    viz boundary and the sector's own boundary cannot diverge
 *   • Model        — buildSceneManifest() allowlist projection (scene-model.ts)
 *   • Renderer     — presentation only; NEVER an authorization boundary
 *
 * DEEP-LINK SECURITY (§21): a scene id, twin id, layer id, object id,
 * dimension code, export id or URL parameter is a REFERENCE, never a grant.
 * `reauthorizeDeepLink()` re-checks tenant, entity, role, permission,
 * classification and sector scope on EVERY access, resolved from the
 * authenticated principal — never from the request's claimed identity.
 *
 * TRUSTED-NEVER LIST (§20): URL parameters, route ids, query parameters,
 * hidden UI elements, client state, browser storage, cached objects,
 * tooltips, export requests, download endpoints, scene ids, layer ids and
 * object ids are NEVER treated as authorization anywhere in this module.
 */
import { can, type AccessDecision, type Principal } from "@/lib/authz";
import {
  FINANCE_OS_READ_PERMISSIONS,
  FOUNDATION_OS_READ_PERMISSIONS,
  UJENZI_OS_READ_PERMISSIONS,
  operatingSystemTenantInScope,
} from "@/lib/operating-systems";
import { checkHealthOSAuthorization } from "@/lib/health-os-authorization";
import type { Classification, PermissionCode } from "@/lib/constants";
import type { VizSectorCode } from "./dimensions";

export type VizAuthorizationDecision = AccessDecision & {
  /** Sector-level denial reason, when the viz permission passed but the
   * sector grant did not. Kept separate so audit records WHICH boundary held. */
  sectorReason: string | null;
};

/**
 * RBAC/ABAC stage for the viz capability itself, through the SAME can()
 * primitive every BEYU route uses. Classification ceilings, tenant isolation,
 * entity scope and MFA step-up all apply unchanged.
 */
export function authorizeVisualization(
  principal: Principal,
  request: {
    permission: PermissionCode;
    classification?: Classification;
    tenantId?: string;
    entityId?: string;
  },
): VizAuthorizationDecision {
  const base = can(principal, request.permission, {
    ...(request.classification ? { classification: request.classification } : {}),
    ...(request.tenantId ? { tenantId: request.tenantId } : {}),
    ...(request.entityId ? { entityId: request.entityId } : {}),
  });
  return { ...base, sectorReason: null };
}

/**
 * DATA AUTHORIZATION stage: prove the principal may read the SECTOR whose
 * data a visualization would present. This is the canonical Sector OS
 * resolution — the identical conjunctions `authorizedOperatingSystems()`
 * applies for the launcher (permission grant + tenant scope for the
 * tenant-backed Sector OSs; the federation identity bridge for Health OS).
 *
 * Holding `viz:scene.read` is NEVER access to sector data on its own:
 *   • UJENZI      — ujenzi:data.read AND the BEYU-UJENZI tenant in scope;
 *   • AGRICULTURE — agriculture:data.read AND the BEYU-AGRI tenant in scope;
 *   • FOUNDATION  — a Foundation read grant AND the BEYU-FOUNDATION tenant;
 *   • FINANCE     — a Finance OS read permission (ledger/treasury/…);
 *   • HEALTH      — the federated identity bridge (fail-closed when absent);
 *   • BEYU        — the control plane: viz permissions + RLS scope only.
 */
export async function assertSectorAccess(
  principal: Principal,
  sector: VizSectorCode,
): Promise<{ allowed: boolean; reason: string }> {
  switch (sector) {
    case "BEYU":
      return { allowed: true, reason: "Control-plane scene; RLS scope applies." };
    case "UJENZI": {
      const granted = UJENZI_OS_READ_PERMISSIONS.some((p) => can(principal, p).allowed);
      const inScope = granted && (await operatingSystemTenantInScope(principal, "BEYU-UJENZI"));
      return inScope
        ? { allowed: true, reason: "Authorized" }
        : { allowed: false, reason: "Sector authorization: Ujenzi OS data requires 'ujenzi:data.read' and the BEYU-UJENZI tenant inside the principal's resolved scope." };
    }
    case "AGRICULTURE": {
      const granted = can(principal, "agriculture:data.read").allowed;
      const inScope = granted && (await operatingSystemTenantInScope(principal, "BEYU-AGRI"));
      return inScope
        ? { allowed: true, reason: "Authorized" }
        : { allowed: false, reason: "Sector authorization: Agriculture OS data requires 'agriculture:data.read' and the BEYU-AGRI tenant inside the principal's resolved scope." };
    }
    case "FOUNDATION": {
      const granted = FOUNDATION_OS_READ_PERMISSIONS.some((p) => can(principal, p).allowed);
      const inScope = granted && (await operatingSystemTenantInScope(principal, "BEYU-FOUNDATION"));
      return inScope
        ? { allowed: true, reason: "Authorized" }
        : { allowed: false, reason: "Sector authorization: Foundation OS data requires a Foundation read grant and the BEYU-FOUNDATION tenant inside the principal's resolved scope." };
    }
    case "FINANCE": {
      const granted = FINANCE_OS_READ_PERMISSIONS.some((p) => can(principal, p).allowed);
      return granted
        ? { allowed: true, reason: "Authorized" }
        : { allowed: false, reason: "Sector authorization: Finance OS visualization requires an authorized Finance read path (READ-GOVERNED; CAP_POSTING remains LOCKED and visualization never posts)." };
    }
    case "HEALTH": {
      const health = await checkHealthOSAuthorization(principal.userId);
      return health.authorized
        ? { allowed: true, reason: "Authorized through the Health federation identity bridge." }
        : { allowed: false, reason: `Sector authorization: Health OS visualization requires the federated Health identity link (${health.reason ?? "NOT_LINKED"}). No PHI is ever exposed through visualization.` };
    }
    default: {
      // Fail closed on any sector this build does not know.
      return { allowed: false, reason: `Sector authorization: unknown sector '${String(sector)}'.` };
    }
  }
}

/**
 * Entity-scope fail-closed rule for visualization routes (§20 + the existing
 * guarded() sector rule): viz aggregates sector rows that may lack complete
 * legal-entity keys, so an entity-scoped principal is REFUSED rather than
 * silently widened to tenant level. Mirrors the agriculture/ujenzi/foundation
 * boundary in src/lib/api.ts — one rule, same reasoning.
 */
export function entityScopeRefusal(principal: Principal): string | null {
  if (principal.entityScope.length === 0) return null;
  return "This visualization capability aggregates sector rows without complete legal-entity keys; entity-scoped access is refused rather than widened to tenant level.";
}

/**
 * Deep-link re-authorization (§21).
 *
 * The caller supplies the ALREADY-LOADED record (loaded inside the principal's
 * tenant/RLS context — a cross-tenant id loads nothing) plus the request's
 * sector and declared permission. This function proves the remaining
 * boundaries: classification ceiling and the sector conjunction. A valid URL
 * is never sufficient: every check derives from the authenticated principal.
 */
export async function reauthorizeDeepLink(
  principal: Principal,
  record: { tenantId: string; classification: string; sector?: VizSectorCode; legalEntityId?: string | null } | null,
  permission: PermissionCode,
): Promise<VizAuthorizationDecision & { notFound: boolean }> {
  // A record outside the principal's RLS scope simply does not exist here.
  // NOT_FOUND (not FORBIDDEN) for cross-tenant probes: the existence of
  // another tenant's scene is itself protected information.
  if (!record) {
    return {
      allowed: false,
      reason: "No visualization resource exists at this reference within your authorized scope.",
      requiresMfa: false,
      highRisk: false,
      sectorReason: null,
      notFound: true,
    };
  }
  const base = authorizeVisualization(principal, {
    permission,
    classification: record.classification as Classification,
    tenantId: record.tenantId,
    entityId: record.legalEntityId ?? undefined,
  });
  if (!base.allowed) return { ...base, notFound: false };

  if (record.sector) {
    const sectorDecision = await assertSectorAccess(principal, record.sector);
    if (!sectorDecision.allowed) {
      return { allowed: false, reason: sectorDecision.reason, requiresMfa: false, highRisk: base.highRisk, sectorReason: sectorDecision.reason, notFound: false };
    }
  }
  return { ...base, notFound: false };
}

/**
 * Export authorization (§31): viewing is not exporting. The export path
 * requires `viz:export` IN ADDITION to everything the view required, and the
 * export content is the governed manifest — never a wider dataset.
 */
export async function authorizeExport(
  principal: Principal,
  sector: VizSectorCode | undefined,
  classification: Classification | undefined,
): Promise<VizAuthorizationDecision> {
  const base = authorizeVisualization(principal, { permission: "viz:export", classification });
  if (!base.allowed) return base;
  if (sector) {
    const sectorDecision = await assertSectorAccess(principal, sector);
    if (!sectorDecision.allowed) {
      return { allowed: false, reason: sectorDecision.reason, requiresMfa: false, highRisk: base.highRisk, sectorReason: sectorDecision.reason };
    }
  }
  return base;
}
