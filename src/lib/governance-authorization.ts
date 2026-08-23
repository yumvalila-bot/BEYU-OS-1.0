import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { capitalRequests, governanceBodies, resolutions } from "@/db/schema";
import { can, type Principal } from "./authz";
import { auditTrailsFor } from "./audit";
import { tenantScopeIds } from "./tenant-scope";
import { classificationRank, type Classification } from "./constants";
import { GovernanceError } from "./governance";

/**
 * BEYU OS — governance decision as an AUTHORIZATION SIGNAL (read-only).
 *
 * The first downstream consumer of `GOVERNANCE_RESOLUTION_DECIDED`. It answers a
 * single question for a governed object:
 *
 *   "Is this object authorised by an APPROVED BEYU OS governance resolution,
 *    and if so, on whose authority?"
 *
 * DESIGN CONSTRAINTS (deliberate, and load-bearing):
 *
 *  1. READ-ONLY. It performs no mutation, posts no journal, moves no capital and
 *     triggers no workflow. It cannot change governance state.
 *
 *  2. NOT A BYPASS. This is an ADDITIONAL governance prerequisite, never a
 *     replacement for the security kernel. A caller must still satisfy
 *     authentication, tenant scope, RBAC, ABAC, classification and policy for
 *     whatever action they are performing. A future capital execution would need
 *     its own authorization AND this signal — never this signal alone.
 *
 *  3. NO SECOND GOVERNANCE SYSTEM. Authority is derived entirely from the
 *     canonical `resolutions` record produced by the governed decision
 *     transaction, and provenance from the existing audit ledger via
 *     `auditTrailsFor()`. No new event, table, broker or state machine.
 *
 *  4. NO INVENTED SEMANTICS. The constitution defines no expiry or revocation
 *     for a decision, so none is claimed: the stored decision is reported as it
 *     stands. Only `APPROVED` authorises; every other status does not.
 */

/** Object types that can carry a governance authorization lookup. */
export const GOVERNED_OBJECT_TYPES = ["CAPITAL_REQUEST", "RESOLUTION"] as const;
export type GovernedObjectType = (typeof GOVERNED_OBJECT_TYPES)[number];

export type GovernanceAuthorization = {
  authorized: boolean;
  objectType: GovernedObjectType;
  objectId: string;
  /** Why the answer is what it is — safe to show the caller. */
  reason: string;
  /** The governing resolution, when one is linked. */
  resolutionId: string | null;
  reference: string | null;
  decision: string | null;
  governanceBodyId: string | null;
  governanceBodyCode: string | null;
  decidedAt: string | null;
  /** Governance seat that recorded the closure, where one is recorded. */
  decidedBy: string | null;
  tenantId: string | null;
  entityId: string | null;
  classification: string | null;
  /**
   * GOVERNED   — the decision has audit-ledger entries, so it was produced by a
   *              real governed transaction in this system.
   * REFERENCE_DATA — a seeded historical record with no ledger provenance.
   * NONE       — no governing resolution is linked at all.
   */
  provenance: "GOVERNED" | "REFERENCE_DATA" | "NONE";
};

/** The only status that authorises anything. */
const AUTHORIZING_STATUS = "APPROVED";

/**
 * Resolve the governance authorization state of a governed object.
 *
 * Tenant isolation is non-enumerating: an object in another tenant and an object
 * that does not exist produce the SAME `NOT_FOUND`, so a caller cannot discover
 * other tenants' identifiers by probing.
 */
export async function getGovernanceDecisionAuthorization(
  principal: Principal,
  objectType: GovernedObjectType,
  objectId: string,
): Promise<GovernanceAuthorization> {
  const scope = await tenantScopeIds(principal);

  const target =
    objectType === "CAPITAL_REQUEST"
      ? await loadCapitalRequest(objectId, scope)
      : await loadResolutionTarget(objectId, scope);

  // ABAC: an entity-scoped principal cannot inspect an out-of-scope entity.
  // Reported as NOT_FOUND for the same non-enumerating reason.
  if (
    target.entityId &&
    principal.entityScope.length > 0 &&
    !principal.entityScope.includes(target.entityId)
  ) {
    throw new GovernanceError("NOT_FOUND", "Object not found within your authorised scope.");
  }

  const base = {
    objectType,
    objectId,
    tenantId: target.tenantId,
    entityId: target.entityId,
  };

  if (!target.resolutionId) {
    return {
      ...base,
      authorized: false,
      reason: "No governance resolution is linked to this object.",
      resolutionId: null,
      reference: null,
      decision: null,
      governanceBodyId: null,
      governanceBodyCode: null,
      decidedAt: null,
      decidedBy: null,
      classification: null,
      provenance: "NONE",
    };
  }

  // The governing resolution must itself be inside the caller's tenant scope; a
  // link alone never grants visibility of another tenant's governance record.
  const [row] = await db
    .select({ resolution: resolutions, body: governanceBodies })
    .from(resolutions)
    .innerJoin(governanceBodies, eq(governanceBodies.id, resolutions.bodyId))
    .where(and(eq(resolutions.id, target.resolutionId), inArray(resolutions.tenantId, scope)))
    .limit(1);

  if (!row) {
    return {
      ...base,
      authorized: false,
      reason: "The linked governance resolution is not available within your authorised scope.",
      resolutionId: null,
      reference: null,
      decision: null,
      governanceBodyId: null,
      governanceBodyCode: null,
      decidedAt: null,
      decidedBy: null,
      classification: null,
      provenance: "NONE",
    };
  }

  const { resolution, body } = row;

  // Classification ceiling: a caller below the resolution's classification is
  // told the object is not authorised, without leaking the resolution's content.
  if (classificationRank(resolution.classification) > classificationRank(principal.clearance)) {
    throw new GovernanceError(
      "CLASSIFICATION_DENIED",
      "The governing resolution is classified above your clearance.",
    );
  }

  // Provenance from the EXISTING audit ledger — the same mechanism the
  // governance workbench uses to distinguish governed records from seed data.
  const trails = await auditTrailsFor("RESOLUTION", [resolution.id], scope);
  const provenance = (trails.get(resolution.id) ?? []).length > 0 ? "GOVERNED" : "REFERENCE_DATA";

  const authorized = resolution.status === AUTHORIZING_STATUS;

  return {
    ...base,
    authorized,
    reason: authorized
      ? `Authorised by ${resolution.reference}, approved by ${body.name}.`
      : `Resolution ${resolution.reference} is ${resolution.status}; only an APPROVED resolution authorises this object.`,
    resolutionId: resolution.id,
    reference: resolution.reference,
    decision: resolution.status,
    governanceBodyId: body.id,
    governanceBodyCode: body.code,
    decidedAt: resolution.decisionDate?.toISOString() ?? null,
    decidedBy: resolution.decidedByMemberId,
    classification: resolution.classification,
    provenance,
  };
}

type Target = { tenantId: string; entityId: string | null; resolutionId: string | null };

async function loadCapitalRequest(objectId: string, scope: string[]): Promise<Target> {
  const [row] = await db
    .select({
      tenantId: capitalRequests.tenantId,
      entityId: capitalRequests.legalEntityId,
      resolutionId: capitalRequests.resolutionId,
    })
    .from(capitalRequests)
    .where(and(eq(capitalRequests.id, objectId), inArray(capitalRequests.tenantId, scope)))
    .limit(1);

  if (!row) {
    throw new GovernanceError("NOT_FOUND", "Object not found within your authorised scope.");
  }
  return row;
}

/**
 * A resolution can be asked about itself, which is how a caller inspects the
 * authorization state of a governance decision directly.
 */
async function loadResolutionTarget(objectId: string, scope: string[]): Promise<Target> {
  const [row] = await db
    .select({
      tenantId: resolutions.tenantId,
      entityId: governanceBodies.legalEntityId,
      id: resolutions.id,
    })
    .from(resolutions)
    .innerJoin(governanceBodies, eq(governanceBodies.id, resolutions.bodyId))
    .where(and(eq(resolutions.id, objectId), inArray(resolutions.tenantId, scope)))
    .limit(1);

  if (!row) {
    throw new GovernanceError("NOT_FOUND", "Object not found within your authorised scope.");
  }
  return { tenantId: row.tenantId, entityId: row.entityId, resolutionId: row.id };
}

/**
 * Batch read model for the capital workbench.
 *
 * Same rules as the single lookup, expressed as one round trip. Returns only the
 * capital requests the caller may see; anything out of scope is simply absent
 * rather than reported, so the list cannot be used to enumerate either.
 */
export async function capitalGovernanceAuthorizations(
  principal: Principal,
  capitalRequestIds: string[],
): Promise<Map<string, GovernanceAuthorization>> {
  const out = new Map<string, GovernanceAuthorization>();
  if (capitalRequestIds.length === 0) return out;
  if (!can(principal, "finance:capital.read").allowed) return out;

  const scope = await tenantScopeIds(principal);

  const rows = await db
    .select({
      id: capitalRequests.id,
      tenantId: capitalRequests.tenantId,
      entityId: capitalRequests.legalEntityId,
      resolutionId: capitalRequests.resolutionId,
    })
    .from(capitalRequests)
    .where(and(inArray(capitalRequests.id, capitalRequestIds), inArray(capitalRequests.tenantId, scope)));

  const visible = rows.filter(
    (r) =>
      !r.entityId ||
      principal.entityScope.length === 0 ||
      principal.entityScope.includes(r.entityId),
  );
  if (visible.length === 0) return out;

  const resolutionIds = [...new Set(visible.map((r) => r.resolutionId).filter(Boolean))] as string[];

  const governing = resolutionIds.length
    ? await db
        .select({ resolution: resolutions, body: governanceBodies })
        .from(resolutions)
        .innerJoin(governanceBodies, eq(governanceBodies.id, resolutions.bodyId))
        .where(and(inArray(resolutions.id, resolutionIds), inArray(resolutions.tenantId, scope)))
    : [];

  const trails = await auditTrailsFor(
    "RESOLUTION",
    governing.map((g) => g.resolution.id),
    scope,
  );

  for (const r of visible) {
    const found = governing.find((g) => g.resolution.id === r.resolutionId);

    if (!found) {
      out.set(r.id, {
        authorized: false,
        objectType: "CAPITAL_REQUEST",
        objectId: r.id,
        reason: r.resolutionId
          ? "The linked governance resolution is not available within your authorised scope."
          : "No governance resolution is linked to this object.",
        resolutionId: null,
        reference: null,
        decision: null,
        governanceBodyId: null,
        governanceBodyCode: null,
        decidedAt: null,
        decidedBy: null,
        tenantId: r.tenantId,
        entityId: r.entityId,
        classification: null,
        provenance: "NONE",
      });
      continue;
    }

    const { resolution, body } = found;

    // A resolution above the caller's clearance is omitted from the read model
    // rather than throwing: the list must not become an oracle for classified
    // governance activity.
    if (classificationRank(resolution.classification) > classificationRank(principal.clearance)) {
      continue;
    }

    const authorized = resolution.status === AUTHORIZING_STATUS;
    out.set(r.id, {
      authorized,
      objectType: "CAPITAL_REQUEST",
      objectId: r.id,
      reason: authorized
        ? `Authorised by ${resolution.reference}, approved by ${body.name}.`
        : `Resolution ${resolution.reference} is ${resolution.status}; only an APPROVED resolution authorises this object.`,
      resolutionId: resolution.id,
      reference: resolution.reference,
      decision: resolution.status,
      governanceBodyId: body.id,
      governanceBodyCode: body.code,
      decidedAt: resolution.decisionDate?.toISOString() ?? null,
      decidedBy: resolution.decidedByMemberId,
      tenantId: r.tenantId,
      entityId: r.entityId,
      classification: resolution.classification,
      provenance: (trails.get(resolution.id) ?? []).length > 0 ? "GOVERNED" : "REFERENCE_DATA",
    });
  }

  return out;
}
