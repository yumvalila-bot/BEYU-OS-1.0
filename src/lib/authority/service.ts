/**
 * BEYU OS — Authority readiness service (Phase 7I).
 *
 * READ-ONLY BY CONSTRUCTION. SELECT statements only. This module defines no table, adds no
 * migration, ratifies nothing and activates nothing. It reads `policies`,
 * `governance_decision_registry`, `governance_capability_registry` and `resolutions` — all of
 * which already carry the authority primitives — and assembles them into the canonical model.
 *
 * WHY NO SECOND TRUTH SOURCE. Every authority record returned here is projected from an existing
 * registry row at read time. Nothing is copied into a new store, so there is no possibility of the
 * authority view drifting from the registries it describes.
 *
 * THE PRIMITIVE THIS PHASE ADDS. `checkScopedCapability()` extends the existing 6C gate with the
 * tenant, entity and principal dimensions it never had. It does NOT replace
 * `checkCapabilityActivation()` — that function remains the decision-level authority engine and is
 * called from inside this one. Adding a parallel authority engine would create exactly the
 * second-source problem the constitution forbids, so this composes rather than duplicates.
 */
import { eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  governanceCapabilityRegistry,
  governanceDecisionRegistry,
  legalEntities,
  policies,
  resolutions,
} from "@/db/schema";
import { checksumOf } from "@/lib/crypto";
import { checkCapabilityActivation } from "@/lib/decision-authority";
import type { Principal } from "@/lib/authz";
import { tenantScopeIds } from "@/lib/tenant-scope";
import {
  AUTHORITY_ENGINE_VERSION,
  assessDecisionReadiness,
  buildChain,
  computePolicyVersion,
  detectPolicyConflicts,
  evaluateAuthority,
  simulateRatification,
} from "./engines";
import type {
  AuthorityChain,
  AuthorityDecisionCode,
  AuthorityEvaluation,
  AuthorityExplanation,
  AuthorityRecord,
  AuthoritySimulation,
  AuthorityStatus,
  ChainLink,
  DecisionReadiness,
  PolicyConflict,
  PolicyVersionIdentity,
} from "./model";

export { AUTHORITY_ENGINE_VERSION };

const MAX_ROWS = 5000;

function isoDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.slice(0, 10);
  return null;
}

/**
 * Maps a registry status string onto the canonical lifecycle.
 *
 * Anything unrecognised becomes UNKNOWN, never a permissive default — an unfamiliar status must
 * not be silently read as ratified.
 */
export function toAuthorityStatus(raw: string | null | undefined): AuthorityStatus {
  const known: AuthorityStatus[] = [
    "DRAFT", "SUBMITTED", "REVIEW", "PENDING", "TABLED", "APPROVED",
    "RATIFIED", "EFFECTIVE", "SUPERSEDED", "REVOKED", "EXPIRED",
  ];
  // Case-sensitive on purpose. A registry status is a controlled value, so "ratified" is not a
  // sloppy spelling of RATIFIED — it is a string that did not come from the enum, and normalising
  // it would let an unvetted write path acquire the meaning of a ratified decision.
  const value = (raw ?? "") as AuthorityStatus;
  return known.includes(value) ? value : "UNKNOWN";
}

/** Projects a decision-registry row into the canonical authority model. */
export async function loadAuthorityRecord(decisionId: string): Promise<AuthorityRecord | null> {
  const [row] = await db
    .select()
    .from(governanceDecisionRegistry)
    .where(eq(governanceDecisionRegistry.decisionId, decisionId))
    .limit(1);

  if (!row) return null;

  const scope = (row.scope ?? null) as Record<string, unknown> | null;
  const scopedTenant = typeof scope?.tenantId === "string" ? scope.tenantId : null;
  const scopedEntity = typeof scope?.legalEntityId === "string" ? scope.legalEntityId : null;

  return {
    authorityId: row.decisionId,
    authorityType: "DECISION",
    source: "governance_decision_registry",
    issuer: row.approvingBody,
    approver: row.decisionMaker,
    approvalDate: row.approvalDate ? new Date(row.approvalDate).toISOString().slice(0, 10) : null,
    effectiveFrom: isoDate(row.effectiveFrom),
    effectiveTo: isoDate(row.effectiveTo),
    status: toAuthorityStatus(row.status),
    // A registry row is GOVERNED authority only when its provenance says so; otherwise it is
    // unverified intake, never authority.
    authorityClass: row.provenance === "GOVERNED" ? "GOVERNED_AUTHORITY" : "UNVERIFIED",
    jurisdiction: null,
    tenantId: scopedTenant,
    entityScope: scopedEntity,
    scope,
    policyVersion: null,
    evidence: row.evidence,
    provenance: row.provenance,
    checksum: checksumOf([
      row.decisionId, row.status, row.resolutionId, row.approvalDate,
      row.effectiveFrom, row.effectiveTo, row.provenance, row.evidence,
    ]),
    supersedes: row.supersedes,
    revokes: null,
    rationale: row.conditions,
  };
}

/**
 * The Phase 7I primitive: a capability gate WITH tenant, entity and principal scope.
 *
 * Composes the existing decision-level gate rather than replacing it, then applies the three
 * dimensions the old gate never had. Returns a deterministic reason code in every path; there is
 * no default-allow branch.
 */
export async function checkScopedCapability(input: {
  capabilityCode: string;
  principal: Principal;
  tenantId: string;
  legalEntityId: string | null;
  asOf?: string;
}): Promise<{
  permitted: boolean;
  decision: AuthorityDecisionCode;
  reason: string;
  capabilityExists: boolean;
  capabilityEnabled: boolean;
  authorityEvaluations: AuthorityEvaluation[];
  blockedBy: string[];
}> {
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);

  const [cap] = await db
    .select()
    .from(governanceCapabilityRegistry)
    .where(eq(governanceCapabilityRegistry.capabilityCode, input.capabilityCode))
    .limit(1);

  if (!cap) {
    return {
      permitted: false,
      decision: "CAPABILITY_UNKNOWN",
      reason: `Unknown capability ${input.capabilityCode}; denied by default.`,
      capabilityExists: false,
      capabilityEnabled: false,
      authorityEvaluations: [],
      blockedBy: [],
    };
  }

  // --- The principal's resolved scope, checked before anything else.
  //     Enterprise governance principals may act for descendants in their explicit
  //     subtree; a direct caller still cannot assert an unrelated tenant.
  const principalScope = await tenantScopeIds(input.principal);
  if (!principalScope.includes(input.tenantId)) {
    return {
      permitted: false,
      decision: "TENANT_SCOPE_MISMATCH",
      reason: `Tenant ${input.tenantId} is outside the principal's authorised scope.`,
      capabilityExists: true,
      capabilityEnabled: false,
      authorityEvaluations: [],
      blockedBy: [],
    };
  }

  // An empty entityScope means "all entities within the tenant subtree" — the existing convention.
  if (
    input.legalEntityId !== null &&
    input.principal.entityScope.length > 0 &&
    !input.principal.entityScope.includes(input.legalEntityId)
  ) {
    return {
      permitted: false,
      decision: "ENTITY_SCOPE_MISMATCH",
      reason: `Principal is not scoped to legal entity ${input.legalEntityId}.`,
      capabilityExists: true,
      capabilityEnabled: false,
      authorityEvaluations: [],
      blockedBy: [],
    };
  }

  // Entity identity is part of the authority boundary, not merely an input
  // format check. A valid entity id belonging to a different tenant must not be
  // usable with a capability scoped to the requested tenant.
  if (input.legalEntityId !== null) {
    const [entity] = await db
      .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
      .from(legalEntities)
      .where(eq(legalEntities.id, input.legalEntityId))
      .limit(1);
    if (!entity || entity.tenantId !== input.tenantId || !principalScope.includes(entity.tenantId)) {
      return {
        permitted: false,
        decision: "ENTITY_SCOPE_MISMATCH",
        reason: "The legal entity is outside the requested tenant scope.",
        capabilityExists: true,
        capabilityEnabled: false,
        authorityEvaluations: [],
        blockedBy: [],
      };
    }
  }

  // A capability without a bound execution permission cannot satisfy the
  // principal-authorisation leg of the canonical gate. Do not let a malformed
  // activated registry row become a permissionless execution path.
  if (!cap.executionPermission) {
    return {
      permitted: false,
      decision: "AUTHORITY_CHAIN_INCOMPLETE",
      reason: `${input.capabilityCode} has no execution permission; the authority chain is incomplete.`,
      capabilityExists: true,
      capabilityEnabled: false,
      authorityEvaluations: [],
      blockedBy: [input.capabilityCode],
    };
  }

  // --- Decision-level authority, delegated to the existing 6C engine ---
  const gate = await checkCapabilityActivation(input.capabilityCode);

  if (!gate.executable) {
    return {
      permitted: false,
      decision: "CAPABILITY_LOCKED",
      reason: gate.reason,
      capabilityExists: true,
      capabilityEnabled: false,
      authorityEvaluations: [],
      blockedBy: gate.blockedBy,
    };
  }

  // --- Scope, applied per required decision. Reached only once the decisions are ACTIVATED. ---
  const required = Array.isArray(cap.requiredDecisions) ? (cap.requiredDecisions as string[]) : [];
  const evaluations: AuthorityEvaluation[] = [];

  for (const decisionId of required) {
    const record = await loadAuthorityRecord(decisionId);
    evaluations.push(
      evaluateAuthority(record, {
        authorityId: decisionId,
        asOf,
        tenantId: input.tenantId,
        legalEntityId: input.legalEntityId,
        principalPermissions: input.principal.permissions as ReadonlySet<string>,
        requiredPermission: cap.executionPermission ?? null,
      }),
    );
  }

  const failed = evaluations.find((e) => e.decision !== "PERMITTED");
  if (failed) {
    return {
      permitted: false,
      decision: failed.decision,
      reason: failed.reason,
      capabilityExists: true,
      capabilityEnabled: true,
      authorityEvaluations: evaluations,
      blockedBy: [failed.authorityId],
    };
  }

  return {
    permitted: true,
    decision: "PERMITTED",
    reason: `${input.capabilityCode} is authorised for tenant ${input.tenantId} at ${asOf}.`,
    capabilityExists: true,
    capabilityEnabled: true,
    authorityEvaluations: evaluations,
    blockedBy: [],
  };
}

/**
 * Policy version identities applying to a tenant, with provenance completeness.
 *
 * INCLUDES GROUP-WIDE POLICIES. A policy with `tenant_id IS NULL` is constitutional and binds
 * every tenant — in the current seed ALL FIVE policies are group-wide. A plain
 * `tenant_id = :tenant` filter therefore returns nothing and would make conflict detection
 * silently vacuous, reporting a clean bill of health for a policy set it never examined.
 */
export async function loadPolicyVersions(tenantId: string): Promise<PolicyVersionIdentity[]> {
  const rows = await db
    .select()
    .from(policies)
    .where(or(isNull(policies.tenantId), eq(policies.tenantId, tenantId)))
    .limit(MAX_ROWS);

  const resolutionIds = rows
    .map((r) => r.approvedByResolutionId)
    .filter((id): id is string => id !== null);

  const resolutionStatuses = new Map<string, string>();
  if (resolutionIds.length > 0) {
    const res = await db
      .select({ id: resolutions.id, status: resolutions.status })
      .from(resolutions)
      .where(inArray(resolutions.id, resolutionIds));
    for (const r of res) resolutionStatuses.set(r.id, r.status);
  }

  return rows
    .map((r) =>
      computePolicyVersion({
        id: r.id,
        code: r.code,
        version: r.version,
        body: r.body,
        rules: r.rules,
        effectiveFrom: isoDate(r.effectiveFrom) ?? "",
        effectiveTo: isoDate(r.effectiveTo),
        status: r.status,
        jurisdictionCode: r.jurisdictionCode,
        tenantId: r.tenantId,
        entityScope: r.entityScope,
        approvedByResolutionId: r.approvedByResolutionId,
        approvingResolutionStatus: r.approvedByResolutionId
          ? (resolutionStatuses.get(r.approvedByResolutionId) ?? null)
          : null,
      }),
    )
    .sort((a, b) => a.code.localeCompare(b.code) || a.version.localeCompare(b.version));
}

/** Conflicts across a tenant's policy set. */
export async function detectConflicts(tenantId: string): Promise<PolicyConflict[]> {
  return detectPolicyConflicts(await loadPolicyVersions(tenantId));
}

/** Readiness matrix across every registered decision (§10). Changes nothing. */
export async function buildReadinessMatrix(): Promise<DecisionReadiness[]> {
  const decisions = await db.select().from(governanceDecisionRegistry).limit(MAX_ROWS);
  const capabilities = await db.select().from(governanceCapabilityRegistry).limit(MAX_ROWS);

  const statusById: Record<string, string> = {};
  for (const d of decisions) statusById[d.decisionId] = d.status;

  return decisions
    .map((d) => {
      const dependencies = Array.isArray(d.dependencies) ? (d.dependencies as string[]) : [];
      const affectedCapabilities = capabilities
        .filter((c) => {
          const req = Array.isArray(c.requiredDecisions) ? (c.requiredDecisions as string[]) : [];
          return req.includes(d.decisionId);
        })
        .map((c) => c.capabilityCode)
        .sort();

      return assessDecisionReadiness({
        decisionId: d.decisionId,
        title: d.title,
        status: d.status,
        activationStatus: d.activationStatus,
        requiredAuthority: d.requiredAuthority,
        approvingBody: d.approvingBody,
        resolutionId: d.resolutionId,
        provenance: d.provenance,
        approvalDate: d.approvalDate ? new Date(d.approvalDate).toISOString() : null,
        effectiveFrom: isoDate(d.effectiveFrom),
        evidence: d.evidence,
        dependencies,
        dependencyStatuses: statusById,
        affectedCapabilities,
      });
    })
    .sort((a, b) => a.decisionId.localeCompare(b.decisionId));
}

/**
 * Reverse trace from an execution path back to its authority (§11).
 * Any missing link makes the chain incomplete, which must block execution.
 */
export async function traceCapabilityChain(capabilityCode: string): Promise<AuthorityChain> {
  const links: ChainLink[] = [];

  const [cap] = await db
    .select()
    .from(governanceCapabilityRegistry)
    .where(eq(governanceCapabilityRegistry.capabilityCode, capabilityCode))
    .limit(1);

  links.push({
    layer: "CAPABILITY",
    id: capabilityCode,
    present: Boolean(cap),
    status: cap?.activationStatus ?? null,
    detail: cap ? `Capability registered, activation ${cap.activationStatus}.` : "Capability not registered.",
  });

  links.push({
    layer: "PERMISSION",
    id: cap?.executionPermission ?? "(none declared)",
    present: Boolean(cap?.executionPermission),
    status: null,
    detail: cap?.executionPermission
      ? `Execution permission ${cap.executionPermission}.`
      : "No execution permission declared; the capability cannot bind to a principal.",
  });

  const required = cap && Array.isArray(cap.requiredDecisions) ? (cap.requiredDecisions as string[]) : [];

  if (required.length === 0) {
    links.push({
      layer: "DECISION",
      id: "(none declared)",
      present: false,
      status: null,
      detail: "Capability declares no required decisions; authority cannot be traced.",
    });
  } else {
    const rows = await db
      .select()
      .from(governanceDecisionRegistry)
      .where(inArray(governanceDecisionRegistry.decisionId, required));

    for (const decisionId of required) {
      const row = rows.find((r) => r.decisionId === decisionId);
      links.push({
        layer: "DECISION",
        id: decisionId,
        present: Boolean(row),
        status: row?.status ?? null,
        detail: row ? `Decision ${decisionId} status ${row.status}.` : `Decision ${decisionId} not registered.`,
      });

      links.push({
        layer: "AUTHORITY",
        id: row?.resolutionId ?? `(no resolution for ${decisionId})`,
        present: Boolean(row?.resolutionId) && row?.provenance === "GOVERNED",
        status: row?.provenance ?? null,
        detail: row?.resolutionId
          ? `Approving resolution ${row.resolutionId}, provenance ${row.provenance ?? "null"}.`
          : `No approving resolution recorded for ${decisionId}.`,
      });
    }
  }

  return buildChain({ direction: "REVERSE", origin: `capability:${capabilityCode}`, links });
}

/** Safe ratification simulation (§17). Mutates nothing. */
export async function simulate(hypotheticalRatifiedDecisions: string[]): Promise<AuthoritySimulation> {
  const capabilities = await db.select().from(governanceCapabilityRegistry).limit(MAX_ROWS);

  const ratifiedRows = await db
    .select({ decisionId: governanceDecisionRegistry.decisionId })
    .from(governanceDecisionRegistry)
    .where(eq(governanceDecisionRegistry.status, "RATIFIED"));

  return simulateRatification({
    hypotheticalRatifiedDecisions,
    alreadyRatifiedDecisions: ratifiedRows.map((r) => r.decisionId),
    capabilities: capabilities.map((c) => ({
      capabilityCode: c.capabilityCode,
      requiredDecisions: Array.isArray(c.requiredDecisions) ? (c.requiredDecisions as string[]) : [],
    })),
  });
}

/** Explainability payload (§12). Carries evidence REFERENCES only, never evidence content. */
export function explainAuthority(input: {
  principal: Principal;
  operation: string;
  tenantId: string;
  legalEntityId: string | null;
  traceId: string;
  capabilityCode: string | null;
  permission: string | null;
  evaluations: AuthorityEvaluation[];
  decision: AuthorityDecisionCode;
  reason: string;
  policyVersion?: string | null;
  evidenceReference?: string | null;
  asOf: string;
}): AuthorityExplanation {
  const effective = input.evaluations.find((e) => e.effective);
  return {
    who: input.principal.userId,
    what: input.operation,
    when: input.asOf,
    why: input.reason,
    underWhichAuthority: input.evaluations.map((e) => e.authorityId).join(", ") || null,
    underWhichPolicy: null,
    policyVersion: input.policyVersion ?? null,
    whichDecision: input.evaluations.map((e) => e.authorityId),
    whichCapability: input.capabilityCode,
    whichPermission: input.permission,
    whichTenant: input.tenantId,
    whichEntity: input.legalEntityId,
    effectivePeriod: effective ? `evaluated at ${effective.evaluatedAt}` : null,
    evidenceReference: input.evidenceReference ?? null,
    traceId: input.traceId,
    decision: input.decision,
  };
}
