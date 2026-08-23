/**
 * BEYU OS — Authority readiness engines (Phase 7I).
 *
 * Pure functions over authority, policy and decision records. No database, no principal lookup,
 * no mutation. Every function here is deterministic and independently replayable.
 *
 * FIVE INVARIANTS:
 *
 *   1. DEFAULT DENY. Every evaluation path that is not explicitly PERMITTED returns a specific
 *      failure code. There is no fall-through, and no `else` that admits.
 *   2. THREE SEPARATE QUESTIONS. exists / effective / permits are computed independently. A
 *      record can exist and be ineffective; be effective and out of scope.
 *   3. NO PRECEDENCE IS INVENTED. Overlapping or contradictory policies yield POLICY_CONFLICT
 *      with every participant listed. Choosing a winner requires a ratified precedence hierarchy,
 *      and none exists.
 *   4. AN INCOMPLETE CHAIN BLOCKS. A missing link anywhere in
 *      AUTHORITY → POLICY → DECISION → CAPABILITY → PERMISSION → SERVICE → EXECUTION
 *      yields AUTHORITY_CHAIN_INCOMPLETE.
 *   5. SIMULATION NEVER MUTATES. The simulator computes over a hypothetical set passed by value
 *      and returns `mutatedState: false` structurally.
 */
import { checksumOf, sha256 } from "@/lib/crypto";
import { SpecialistError } from "../specialist/platform";
import type {
  AuthorityChain,
  AuthorityConditions,
  AuthorityDecisionCode,
  AuthorityEvaluation,
  AuthorityRecord,
  AuthoritySimulation,
  AuthorityStatus,
  ChainLink,
  DecisionReadiness,
  PolicyConflict,
  PolicyConflictCode,
  PolicyVersionIdentity,
} from "./model";

export const AUTHORITY_ENGINE_VERSION = "authority-1.0.0";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string, label: string): void {
  if (!ISO_DATE.test(value)) {
    throw new SpecialistError("RULE_VIOLATION", `${label} must be an ISO date (YYYY-MM-DD).`);
  }
}

/** Statuses that mean the authority is in force, subject to dates and scope. */
const IN_FORCE_STATUSES: AuthorityStatus[] = ["RATIFIED", "EFFECTIVE"];
/** Statuses that permanently disqualify an authority, whatever the dates say. */
const TERMINAL_STATUSES: AuthorityStatus[] = ["SUPERSEDED", "REVOKED", "EXPIRED"];

const NO_CONDITIONS: AuthorityConditions = {
  recordFound: false,
  statusRatified: false,
  approvalRecorded: false,
  effectiveDateReached: false,
  notExpired: false,
  notRevoked: false,
  notSuperseded: false,
  tenantInScope: false,
  entityInScope: false,
  principalAuthorized: false,
  noPolicyConflict: false,
  chainComplete: false,
};

// ===========================================================================
// 1. AUTHORITY EVALUATION — the §9 primitive
// ===========================================================================

/**
 * Evaluates a single authority record against a concrete request.
 *
 * This is the primitive the platform lacked: `checkCapabilityActivation()` answered only
 * "are the decisions activated?", with no tenant, entity or principal dimension. Evaluation order
 * is deliberate — existence, then force, then dates, then scope, then principal — so the reason
 * returned is always the FIRST and most fundamental failure, not an incidental later one.
 */
export function evaluateAuthority(
  record: AuthorityRecord | null,
  request: {
    authorityId: string;
    asOf: string;
    tenantId: string;
    legalEntityId: string | null;
    principalPermissions: ReadonlySet<string>;
    requiredPermission: string | null;
    conflicts?: number;
    chainComplete?: boolean;
  },
): AuthorityEvaluation {
  assertIsoDate(request.asOf, "asOf");

  const fail = (
    decision: AuthorityDecisionCode,
    reason: string,
    conditions: Partial<AuthorityConditions> = {},
  ): AuthorityEvaluation => ({
    authorityId: request.authorityId,
    exists: conditions.recordFound ?? false,
    effective: false,
    permits: false,
    decision,
    reason,
    conditions: { ...NO_CONDITIONS, ...conditions },
    evaluatedAt: request.asOf,
  });

  // --- 1. EXISTS ---
  if (!record) {
    return fail("AUTHORITY_MISSING", `No authority record found for ${request.authorityId}.`);
  }
  const c: AuthorityConditions = { ...NO_CONDITIONS, recordFound: true };

  // --- 2. TERMINAL STATES, checked before dates so a revoked-but-in-window record cannot pass ---
  if (record.status === "SUPERSEDED") {
    return fail("AUTHORITY_SUPERSEDED", `${request.authorityId} has been superseded and is no longer authoritative.`, c);
  }
  if (record.status === "REVOKED") {
    return fail("AUTHORITY_REVOKED", `${request.authorityId} has been revoked.`, c);
  }
  if (record.status === "EXPIRED") {
    return fail("AUTHORITY_EXPIRED", `${request.authorityId} is expired.`, c);
  }
  c.notSuperseded = true;
  c.notRevoked = true;

  // --- 3. RATIFICATION. APPROVED is NOT ratified: approval by one body is not the ratification
  //        the constitution requires before execution. ---
  if (!IN_FORCE_STATUSES.includes(record.status)) {
    return fail(
      "AUTHORITY_NOT_EFFECTIVE",
      `${request.authorityId} has status ${record.status}; only RATIFIED or EFFECTIVE authority is in force.`,
      c,
    );
  }
  c.statusRatified = true;

  if (!record.approvalDate) {
    return fail("AUTHORITY_NOT_EFFECTIVE", `${request.authorityId} records no approval date.`, c);
  }
  c.approvalRecorded = true;

  // --- 4. EFFECTIVE DATING (inclusive both ends) ---
  if (!record.effectiveFrom) {
    return fail("AUTHORITY_NOT_EFFECTIVE", `${request.authorityId} has no effective_from date.`, c);
  }
  if (record.effectiveFrom > request.asOf) {
    return fail(
      "AUTHORITY_NOT_EFFECTIVE",
      `${request.authorityId} becomes effective ${record.effectiveFrom}, after ${request.asOf}. A future authority does not act early.`,
      c,
    );
  }
  c.effectiveDateReached = true;

  if (record.effectiveTo && record.effectiveTo < request.asOf) {
    return fail("AUTHORITY_EXPIRED", `${request.authorityId} expired on ${record.effectiveTo}.`, c);
  }
  c.notExpired = true;

  // At this point the authority EXISTS and is EFFECTIVE. Scope is a separate question.

  // --- 5. TENANT SCOPE. A null tenant means group-wide, which is a deliberate recorded choice. ---
  if (record.tenantId !== null && record.tenantId !== request.tenantId) {
    return {
      ...fail("TENANT_SCOPE_MISMATCH",
        `${request.authorityId} is scoped to tenant ${record.tenantId}, not ${request.tenantId}.`, c),
      effective: true,
    };
  }
  c.tenantInScope = true;

  // --- 6. ENTITY SCOPE ---
  if (record.entityScope !== null && request.legalEntityId !== null && record.entityScope !== request.legalEntityId) {
    return {
      ...fail("ENTITY_SCOPE_MISMATCH",
        `${request.authorityId} is scoped to entity ${record.entityScope}, not ${request.legalEntityId}.`, c),
      effective: true,
    };
  }
  // An entity-scoped authority cannot authorise an unscoped (all-entity) request.
  if (record.entityScope !== null && request.legalEntityId === null) {
    return {
      ...fail("ENTITY_SCOPE_MISMATCH",
        `${request.authorityId} is scoped to entity ${record.entityScope} and cannot authorise an unscoped request.`, c),
      effective: true,
    };
  }
  c.entityInScope = true;

  // --- 7. PRINCIPAL ---
  if (request.requiredPermission !== null && !request.principalPermissions.has(request.requiredPermission)) {
    return {
      ...fail("PRINCIPAL_NOT_AUTHORIZED",
        `The principal does not hold ${request.requiredPermission}.`, c),
      effective: true,
    };
  }
  c.principalAuthorized = true;

  // --- 8. CONFLICT ---
  if ((request.conflicts ?? 0) > 0) {
    return {
      ...fail("POLICY_CONFLICT",
        `${request.conflicts} unresolved policy conflict(s) affect ${request.authorityId}. Precedence is unratified.`, c),
      effective: true,
    };
  }
  c.noPolicyConflict = true;

  // --- 9. CHAIN ---
  if (request.chainComplete === false) {
    return {
      ...fail("AUTHORITY_CHAIN_INCOMPLETE",
        `The authority chain for ${request.authorityId} is incomplete; execution fails closed.`, c),
      effective: true,
    };
  }
  c.chainComplete = true;

  return {
    authorityId: request.authorityId,
    exists: true,
    effective: true,
    permits: true,
    decision: "PERMITTED",
    reason: `${request.authorityId} is ratified, effective at ${request.asOf}, in scope, and the principal is authorised.`,
    conditions: c,
    evaluatedAt: request.asOf,
  };
}

// ===========================================================================
// 2. POLICY VERSION IDENTITY (§6)
// ===========================================================================

/**
 * Reproducible policy version identity.
 *
 * Two checksums are produced deliberately: `contentChecksum` over the policy body and rules alone,
 * and `checksum` over content plus scope, dates and authority. The pair makes it detectable when
 * the same code+version carries different content — the exact silent-substitution failure §6
 * forbids.
 */
export function computePolicyVersion(policy: {
  id: string;
  code: string;
  version: string;
  body: string;
  rules: unknown;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  jurisdictionCode: string | null;
  tenantId: string | null;
  entityScope: string | null;
  approvedByResolutionId: string | null;
  approvingResolutionStatus?: string | null;
}): PolicyVersionIdentity {
  const contentChecksum = sha256(`${policy.body}|${checksumOf(policy.rules)}`);

  const provenanceComplete =
    policy.approvedByResolutionId !== null && policy.approvingResolutionStatus === "APPROVED";

  let provenanceGap: string | null = null;
  if (policy.approvedByResolutionId === null) {
    provenanceGap =
      "No approving resolution is recorded; the policy's authority cannot be evidenced in-system (C-1).";
  } else if (policy.approvingResolutionStatus !== "APPROVED") {
    provenanceGap =
      `Approving resolution ${policy.approvedByResolutionId} has status ` +
      `${policy.approvingResolutionStatus ?? "UNKNOWN"}, not APPROVED.`;
  }

  return {
    policyId: policy.id,
    code: policy.code,
    version: policy.version,
    checksum: checksumOf([
      policy.code, policy.version, contentChecksum, policy.effectiveFrom, policy.effectiveTo,
      policy.jurisdictionCode, policy.tenantId, policy.entityScope, policy.approvedByResolutionId,
    ]),
    contentChecksum,
    effectiveFrom: policy.effectiveFrom,
    effectiveTo: policy.effectiveTo,
    status: policy.status,
    jurisdiction: policy.jurisdictionCode,
    tenantId: policy.tenantId,
    entityScope: policy.entityScope,
    approvedByResolutionId: policy.approvedByResolutionId,
    provenanceComplete,
    provenanceGap,
  };
}

// ===========================================================================
// 3. CONFLICT DETECTION (§8)
// ===========================================================================

function conflict(
  code: PolicyConflictCode,
  policies: PolicyVersionIdentity[],
  detail: string,
): PolicyConflict {
  return {
    code,
    policyIds: policies.map((p) => p.policyId).sort(),
    policyCodes: policies.map((p) => p.code).sort(),
    detail,
    requiresAuthority: true,
  };
}

/**
 * Deterministic conflict detection. Never nominates a winner.
 *
 * Only structural conflicts are detected — overlapping windows for the same code, identical
 * code+version with different content, and so on. Semantic contradiction between rule bodies is
 * deliberately NOT attempted: deciding that two rules contradict requires interpreting them, which
 * is a legal judgement, not a computation.
 */
export function detectPolicyConflicts(policies: PolicyVersionIdentity[]): PolicyConflict[] {
  const conflicts: PolicyConflict[] = [];
  const active = policies.filter((p) => p.status === "ACTIVE" || p.status === "APPROVED");

  // --- Missing provenance ---
  for (const p of policies) {
    if (!p.provenanceComplete) {
      conflicts.push(conflict("MISSING_PROVENANCE", [p], p.provenanceGap ?? "Provenance incomplete."));
    }
  }

  const byCode = new Map<string, PolicyVersionIdentity[]>();
  for (const p of active) byCode.set(p.code, [...(byCode.get(p.code) ?? []), p]);

  for (const [code, group] of byCode) {
    // --- Same code + version, different content ---
    const byVersion = new Map<string, PolicyVersionIdentity[]>();
    for (const p of group) byVersion.set(p.version, [...(byVersion.get(p.version) ?? []), p]);
    for (const [version, versionGroup] of byVersion) {
      if (versionGroup.length > 1) {
        const contents = new Set(versionGroup.map((p) => p.contentChecksum));
        if (contents.size > 1) {
          conflicts.push(conflict("SAME_CODE_DIFFERENT_CONTENT", versionGroup,
            `${code} v${version} exists ${versionGroup.length} times with ${contents.size} different contents. ` +
            "The same policy version must not silently represent different rules."));
        } else {
          conflicts.push(conflict("DUPLICATE_CODE_VERSION", versionGroup,
            `${code} v${version} is recorded ${versionGroup.length} times.`));
        }
      }
    }

    // --- Effective-date overlap between different versions of the same code ---
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i];
        const b = group[j];
        if (a.version === b.version) continue;
        const aEnd = a.effectiveTo ?? "9999-12-31";
        const bEnd = b.effectiveTo ?? "9999-12-31";
        if (a.effectiveFrom <= bEnd && b.effectiveFrom <= aEnd) {
          // Overlap is only a conflict where the scopes actually collide.
          const sameTenant = a.tenantId === b.tenantId;
          const sameEntity = a.entityScope === b.entityScope;
          if (sameTenant && sameEntity) {
            conflicts.push(conflict("EFFECTIVE_DATE_OVERLAP", [a, b],
              `${code} v${a.version} (${a.effectiveFrom}..${a.effectiveTo ?? "open"}) overlaps ` +
              `v${b.version} (${b.effectiveFrom}..${b.effectiveTo ?? "open"}) in the same scope. ` +
              "No precedence hierarchy is ratified, so neither takes priority."));
          }
          if (!sameTenant && a.tenantId !== null && b.tenantId !== null) {
            conflicts.push(conflict("TENANT_CONFLICT", [a, b],
              `${code} is active for tenants ${a.tenantId} and ${b.tenantId} with overlapping windows.`));
          }
          if (a.jurisdiction !== b.jurisdiction && a.jurisdiction !== null && b.jurisdiction !== null) {
            conflicts.push(conflict("JURISDICTION_CONFLICT", [a, b],
              `${code} is active in jurisdictions ${a.jurisdiction} and ${b.jurisdiction} with overlapping windows.`));
          }
        }
      }
    }
  }

  return conflicts.sort((a, b) => a.code.localeCompare(b.code) || a.policyIds[0].localeCompare(b.policyIds[0]));
}

// ===========================================================================
// 4. DEPENDENCY CHAIN (§11)
// ===========================================================================

/**
 * Builds a forward or reverse trace. Any missing link makes the chain incomplete, and an
 * incomplete chain must block execution.
 */
export function buildChain(input: {
  direction: "FORWARD" | "REVERSE";
  origin: string;
  links: ChainLink[];
}): AuthorityChain {
  const brokenAt = input.links.filter((l) => !l.present).map((l) => `${l.layer}:${l.id}`);
  const complete = brokenAt.length === 0;

  const ordered = input.direction === "FORWARD" ? input.links : [...input.links].reverse();

  return {
    direction: input.direction,
    origin: input.origin,
    links: ordered,
    complete,
    brokenAt,
    explanation: [
      `${input.direction} trace from ${input.origin} across ${input.links.length} layer(s).`,
      complete
        ? "Every link is present; the chain is explainable end to end."
        : `Chain incomplete at: ${brokenAt.join(", ")}. Execution must fail closed (AUTHORITY_CHAIN_INCOMPLETE).`,
      "A complete chain proves traceability. It does NOT by itself authorise execution — the " +
        "authority must also be ratified, effective and in scope.",
    ],
  };
}

// ===========================================================================
// 5. DECISION READINESS (§10)
// ===========================================================================

/**
 * Computes readiness for one decision. Reports only — nothing here changes a decision's state.
 */
export function assessDecisionReadiness(input: {
  decisionId: string;
  title: string;
  status: string;
  activationStatus: string;
  requiredAuthority: string | null;
  approvingBody: string | null;
  resolutionId: string | null;
  provenance: string | null;
  approvalDate: string | null;
  effectiveFrom: string | null;
  evidence: string | null;
  dependencies: string[];
  dependencyStatuses: Record<string, string>;
  affectedCapabilities: string[];
}): DecisionReadiness {
  const blockers: string[] = [];

  if (input.status !== "RATIFIED" && input.status !== "APPROVED") {
    blockers.push(`AUTHORITY_NOT_RATIFIED (status=${input.status})`);
  }
  if (!input.resolutionId) blockers.push("NO_APPROVING_RESOLUTION");
  if (input.provenance !== "GOVERNED") blockers.push(`PROVENANCE_NOT_GOVERNED (${input.provenance ?? "null"})`);
  if (!input.approvalDate) blockers.push("NO_APPROVAL_DATE");
  if (!input.effectiveFrom) blockers.push("NO_EFFECTIVE_DATE");
  if (!input.evidence) blockers.push("NO_EVIDENCE");
  if (input.activationStatus !== "ACTIVATED") blockers.push(`NOT_ACTIVATED (${input.activationStatus})`);

  const unmetDependencies = input.dependencies.filter(
    (d) => (input.dependencyStatuses[d] ?? "UNKNOWN") !== "RATIFIED",
  );
  if (unmetDependencies.length > 0) {
    blockers.push(`UNMET_DEPENDENCIES (${unmetDependencies.join(", ")})`);
  }

  const readiness = blockers.length === 0 ? "READY" : blockers.length <= 2 ? "PARTIAL" : "BLOCKED";

  return {
    decisionId: input.decisionId,
    title: input.title,
    status: input.status,
    activationStatus: input.activationStatus,
    requiredAuthority: input.requiredAuthority,
    approvingBody: input.approvingBody,
    dependencies: input.dependencies,
    unmetDependencies,
    affectedCapabilities: input.affectedCapabilities,
    blockedExecutionPaths: input.affectedCapabilities.map((c) => `capability:${c}`),
    blockers,
    readiness,
    reason:
      blockers.length === 0
        ? `${input.decisionId} satisfies every recorded readiness condition.`
        : `${input.decisionId} is blocked by: ${blockers.join("; ")}.`,
  };
}

// ===========================================================================
// 6. SIMULATION (§17)
// ===========================================================================

/**
 * Answers "if these decisions were ratified, what would become eligible?"
 *
 * Operates entirely on values passed in. It reads no live activation state, writes nothing, and
 * returns `mutatedState: false` as a structural constant. Output is classified SIMULATION and
 * uses the word "eligible", never "activated" or "approved".
 */
export function simulateRatification(input: {
  hypotheticalRatifiedDecisions: string[];
  capabilities: Array<{ capabilityCode: string; requiredDecisions: string[] }>;
  alreadyRatifiedDecisions?: string[];
}): AuthoritySimulation {
  const ratified = new Set([
    ...(input.alreadyRatifiedDecisions ?? []),
    ...input.hypotheticalRatifiedDecisions,
  ]);

  const wouldBecomeEligible: string[] = [];
  const wouldRemainBlocked: Array<{ capabilityCode: string; stillBlockedBy: string[] }> = [];

  for (const cap of input.capabilities) {
    // A capability declaring no required decisions is a registry defect, never a free pass —
    // the same rule the live gate applies.
    if (cap.requiredDecisions.length === 0) {
      wouldRemainBlocked.push({
        capabilityCode: cap.capabilityCode,
        stillBlockedBy: ["DECLARES_NO_REQUIRED_DECISIONS"],
      });
      continue;
    }
    const unmet = cap.requiredDecisions.filter((d) => !ratified.has(d));
    if (unmet.length === 0) wouldBecomeEligible.push(cap.capabilityCode);
    else wouldRemainBlocked.push({ capabilityCode: cap.capabilityCode, stillBlockedBy: unmet });
  }

  return {
    classification: "SIMULATION",
    hypotheticalRatifiedDecisions: [...input.hypotheticalRatifiedDecisions].sort(),
    wouldBecomeEligible: wouldBecomeEligible.sort(),
    wouldRemainBlocked: wouldRemainBlocked.sort((a, b) => a.capabilityCode.localeCompare(b.capabilityCode)),
    mutatedState: false,
    explanation: [
      `Hypothetical: if ${input.hypotheticalRatifiedDecisions.join(", ") || "(nothing)"} were ratified, ` +
        `${wouldBecomeEligible.length} capability/capabilities would become ELIGIBLE for activation.`,
      "ELIGIBLE is not ACTIVATED. Eligibility means the decision dependencies would be satisfied; " +
        "activation additionally requires effective dating, scope and an authorised principal.",
      "This simulation changed nothing. No decision was ratified, no capability activated, no permission granted.",
    ],
  };
}
