/**
 * BEYU OS — Common specialist platform (Phase 7B).
 *
 * ONE canonical execution pattern for every specialist domain (forecasting, audit intelligence,
 * tax intelligence, and every later specialist). The alternative — bespoke governance and
 * security logic inside twenty modules — would guarantee twenty subtly different security
 * boundaries. This module exists so there is exactly one.
 *
 * WHAT A SPECIALIST MAY DO. Analyse, calculate, simulate, forecast, detect, recommend, explain,
 * score risk and assemble evidence. All of that is read-only with respect to financial truth.
 *
 * WHAT A SPECIALIST MAY NEVER DO. Post a journal, move money, create a chart of accounts, open a
 * period, or convert its own recommendation into execution. Those require the Phase 6C capability
 * gate, and `runSpecialist` refuses to run a WRITE operation whose capability is not activated.
 *
 * THE THREE-LAYER SEPARATION THIS ENFORCES:
 *
 *     INTELLIGENCE (this layer)  ->  GOVERNANCE (decision-authority)  ->  EXECUTION (posting-engine)
 *
 * An output of this layer is an OPINION with provenance. It becomes an instruction only if a
 * ratified authority later activates the corresponding capability.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { recordAuditTx, publishEventTx } from "@/lib/audit";
import { can, type Principal } from "@/lib/authz";
import type { PermissionCode } from "@/lib/constants";
import { checkCapabilityActivation } from "@/lib/decision-authority";
import { legalEntities } from "@/db/schema";

/**
 * Classification of a specialist operation.
 *
 *  READ       — reads existing data, produces no stored output. Never gated by a capability.
 *  ANALYSIS   — derives an opinion and may persist it as a specialist output with provenance.
 *  SIMULATION — hypothetical; explicitly marked, never presented as fact.
 *  WRITE      — changes financial or governance truth. ALWAYS requires an activated capability.
 */
export type SpecialistOperationKind = "READ" | "ANALYSIS" | "SIMULATION" | "WRITE";

/** Why a specialist result cannot be treated as authoritative. */
export const SPECIALIST_QUALIFIER = [
  "AUTHORITATIVE",
  "PENDING_POLICY",
  "REQUIRES_AUTHORITY",
  "REQUIRES_SPECIALIST_REVIEW",
  "SIMULATION_ONLY",
  "LOCKED",
] as const;
export type SpecialistQualifier = (typeof SPECIALIST_QUALIFIER)[number];

export type SpecialistContext = {
  principal: Principal;
  tenantId: string;
  legalEntityId?: string | null;
  /** Correlates every log, audit and event row produced by this operation. */
  traceId: string;
};

export type SpecialistDescriptor = {
  /** Stable domain code, e.g. "FORECASTING". */
  specialist: string;
  /** Stable operation code, e.g. "PROJECT_SERIES". */
  operation: string;
  kind: SpecialistOperationKind;
  /** RBAC permission required. Always enforced, for every kind including READ. */
  permission: PermissionCode;
  /**
   * Capability from `governance_capability_registry`. Required for WRITE. For ANALYSIS it is
   * advisory: the operation runs, but its output is qualified REQUIRES_AUTHORITY when locked, so
   * an unratified opinion can never masquerade as an instruction.
   */
  capabilityCode?: string;
  /** Model or ruleset version, recorded on every output for deterministic replay. */
  version: string;
  riskClass: "LOW" | "MEDIUM" | "HIGH";
};

export type SpecialistResult<T> = {
  specialist: string;
  operation: string;
  version: string;
  kind: SpecialistOperationKind;
  qualifier: SpecialistQualifier;
  /** Plain-language reason the qualifier is what it is. Safe for UI and audit. */
  qualifierReason: string;
  tenantId: string;
  legalEntityId: string | null;
  traceId: string;
  producedAt: string;
  /** Inputs this result depends on, for provenance and replay. */
  provenance: SpecialistProvenance;
  /** Human-readable derivation. A specialist result without an explanation is not acceptable. */
  explanation: string[];
  data: T;
};

export type SpecialistProvenance = {
  /** Identifiers of the records the result was derived from. */
  sources: Array<{ type: string; id: string }>;
  /** Named assumptions. An empty list means the result asserts it made none. */
  assumptions: string[];
  /** Decisions whose absence limits this result. */
  blockedBy: string[];
};

export class SpecialistError extends Error {
  constructor(
    readonly code: SpecialistErrorCode,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SpecialistError";
  }
}

export type SpecialistErrorCode =
  | "DENIED"
  | "NOT_FOUND"
  | "RULE_VIOLATION"
  | "CAPABILITY_LOCKED"
  | "INVALID_SCOPE";

/** Structural validation of a trace id, to keep log correlation trustworthy. */
function assertTraceId(traceId: string): void {
  if (typeof traceId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(traceId)) {
    throw new SpecialistError("RULE_VIOLATION", "A well-formed traceId is required.");
  }
}

/**
 * THE CANONICAL SPECIALIST EXECUTION PATTERN.
 *
 * Enforcement order, applied identically for every specialist so no domain can invent a weaker
 * path:
 *
 *   1. TRACE     — a well-formed trace id, so every downstream record correlates.
 *   2. RBAC      — the declared permission, enforced even for READ operations.
 *   3. TENANT    — principal tenant must match; failure is non-enumerating.
 *   4. ENTITY    — when supplied: must exist, belong to the tenant, be within entity scope.
 *   5. CAPABILITY— WRITE is refused unless activated. ANALYSIS is qualified, not refused.
 *   6. EXECUTE   — the domain logic, which receives an already-validated context.
 *   7. AUDIT     — WRITE and ANALYSIS emit an audit record and an event, atomically.
 *
 * The domain function never sees an unvalidated principal, tenant or entity.
 */
export async function runSpecialist<T>(
  descriptor: SpecialistDescriptor,
  context: SpecialistContext,
  execute: (scope: ValidatedScope) => Promise<{
    data: T;
    provenance: SpecialistProvenance;
    explanation: string[];
  }>,
): Promise<SpecialistResult<T>> {
  // --- 1. TRACE ---
  assertTraceId(context.traceId);

  // --- 2. RBAC ---
  const decision = can(context.principal, descriptor.permission);
  if (!decision.allowed) {
    throw new SpecialistError(
      "DENIED",
      `You do not hold authority for ${descriptor.specialist}.${descriptor.operation}.`,
    );
  }

  // --- 3. TENANT ISOLATION (non-enumerating) ---
  if (context.principal.tenantId !== context.tenantId) {
    throw new SpecialistError("NOT_FOUND", "The requested scope was not found.");
  }

  // --- 4. ENTITY SCOPE ---
  let entityId: string | null = null;
  if (context.legalEntityId) {
    const [entity] = await db
      .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
      .from(legalEntities)
      .where(eq(legalEntities.id, context.legalEntityId))
      .limit(1);

    if (!entity || entity.tenantId !== context.tenantId) {
      throw new SpecialistError("NOT_FOUND", "The requested scope was not found.");
    }
    if (
      context.principal.entityScope.length > 0 &&
      !context.principal.entityScope.includes(entity.id)
    ) {
      throw new SpecialistError("NOT_FOUND", "The requested scope was not found.");
    }
    entityId = entity.id;
  }

  // --- 5. CAPABILITY GATE ---
  let qualifier: SpecialistQualifier = "AUTHORITATIVE";
  let qualifierReason = "No governance dependency limits this result.";
  let blockedBy: string[] = [];

  if (descriptor.capabilityCode) {
    const gate = await checkCapabilityActivation(descriptor.capabilityCode);
    blockedBy = gate.blockedBy;

    if (!gate.executable) {
      if (descriptor.kind === "WRITE") {
        // Execution fails closed. Always.
        throw new SpecialistError("CAPABILITY_LOCKED", gate.reason, { blockedBy: gate.blockedBy });
      }
      qualifier = descriptor.kind === "SIMULATION" ? "SIMULATION_ONLY" : "REQUIRES_AUTHORITY";
      qualifierReason = gate.reason;
    }
  } else if (descriptor.kind === "SIMULATION") {
    qualifier = "SIMULATION_ONLY";
    qualifierReason = "Simulated result. Not a statement of fact and not an instruction.";
  }

  const scope: ValidatedScope = {
    principal: context.principal,
    tenantId: context.tenantId,
    legalEntityId: entityId,
    traceId: context.traceId,
    capabilityExecutable: qualifier === "AUTHORITATIVE",
  };

  // --- 6. EXECUTE ---
  const outcome = await execute(scope);

  const result: SpecialistResult<T> = {
    specialist: descriptor.specialist,
    operation: descriptor.operation,
    version: descriptor.version,
    kind: descriptor.kind,
    qualifier,
    qualifierReason,
    tenantId: context.tenantId,
    legalEntityId: entityId,
    traceId: context.traceId,
    producedAt: new Date().toISOString(),
    provenance: {
      ...outcome.provenance,
      blockedBy: [...new Set([...(outcome.provenance.blockedBy ?? []), ...blockedBy])],
    },
    explanation: outcome.explanation,
    data: outcome.data,
  };

  // --- 7. AUDIT. READ operations are intentionally not audited individually: auditing every
  //     read would flood the append-only ledger without improving accountability. ---
  if (descriptor.kind !== "READ") {
    await db.transaction(async (tx) => {
      await recordAuditTx(tx, {
        tenantId: context.tenantId,
        actorUserId: context.principal.userId,
        actorType: "HUMAN",
        action: `specialist.${descriptor.specialist.toLowerCase()}.${descriptor.operation.toLowerCase()}`,
        objectType: "SPECIALIST_RESULT",
        objectId: context.traceId,
        outcome: "SUCCESS",
        authority: descriptor.capabilityCode ?? "NONE_REQUIRED",
        reason: qualifierReason,
        // Phase 7G: the platform's trace id was previously dropped, leaving audit_log.trace_id
        // NULL and making an audit row impossible to correlate with its event. Auditing the
        // audit trail exposed it.
        traceId: context.traceId,
        newValue: {
          specialist: descriptor.specialist,
          operation: descriptor.operation,
          version: descriptor.version,
          kind: descriptor.kind,
          qualifier,
          riskClass: descriptor.riskClass,
          sourceCount: result.provenance.sources.length,
          // Phase 7G: records WHICH PERMISSION authorised the operation. Without it the audit
          // trail cannot answer the §13 observability question, and a permission-model change
          // could not be reconstructed against historical activity.
          permission: descriptor.permission,
          legalEntityId: entityId,
        },
      });

      await publishEventTx(tx, {
        type: "SPECIALIST_ANALYSIS_PRODUCED",
        source: `specialist.${descriptor.specialist.toLowerCase()}`,
        domain: descriptor.specialist.toUpperCase(),
        operation: descriptor.operation,
        destinationDomain: null,
        tenantId: context.tenantId,
        legalEntityId: entityId,
        subjectType: "SPECIALIST_RESULT",
        subjectId: context.traceId,
        actorUserId: context.principal.userId,
        classification: "RESTRICTED",
        // Phase 7G: previously defaulted to the event's own id, so an event could not be joined
        // to the audit row it accompanied. Both now carry the caller's trace id.
        traceId: context.traceId,
        payload: {
          specialist: descriptor.specialist,
          operation: descriptor.operation,
          version: descriptor.version,
          qualifier,
          legalEntityId: entityId,
        },
        correlationId: context.traceId,
        causationId: null,
        authorityContext: { authorityId: null, decisionId: null, capabilityCode: descriptor.capabilityCode ?? null, permissionCode: descriptor.permission, policyVersion: null },
        policyVersion: null,
      });
    });
  }

  return result;
}

export type ValidatedScope = {
  principal: Principal;
  tenantId: string;
  legalEntityId: string | null;
  traceId: string;
  /** True only when the governing capability is genuinely activated. */
  capabilityExecutable: boolean;
};

/**
 * Effective-dated rule selection, shared by every specialist that carries versioned rules.
 * Extracted here because forecasting, tax and audit all need identical semantics — the criterion
 * for shared infrastructure in §5.
 *
 * Boundaries are inclusive at both ends, matching the policy engine fixed in Phase 5O.
 */
export function selectEffectiveRules<R extends { effectiveFrom: string; effectiveTo?: string | null }>(
  rules: R[],
  asOf: string,
): R[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new SpecialistError("RULE_VIOLATION", "asOf must be an ISO date (YYYY-MM-DD).");
  }
  return rules.filter(
    (rule) => rule.effectiveFrom <= asOf && (!rule.effectiveTo || rule.effectiveTo >= asOf),
  );
}

/** Deterministic risk banding, shared by tax and audit specialists. */
export function bandRisk(score: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new SpecialistError("RULE_VIOLATION", "Risk score must be between 0 and 100.");
  }
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

/** Registry of every specialist capability, for reporting and for the API surface. */
export async function listSpecialistCapabilities(): Promise<
  Array<{ capabilityCode: string; activationStatus: string; requiredDecisions: string[] }>
> {
  const rows = await db.execute(sql`
    select capability_code, activation_status, required_decisions
    from governance_capability_registry
    where capability_code like 'CAP_SPEC_%'
    order by capability_code
  `);
  const list = (rows as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
  return list.map((r) => ({
    capabilityCode: String(r.capability_code),
    activationStatus: String(r.activation_status),
    requiredDecisions: (r.required_decisions as string[]) ?? [],
  }));
}

/** Guard used by specialists that must never write financial truth. */
export function assertNonFinancial(descriptor: SpecialistDescriptor): void {
  if (descriptor.kind === "WRITE" && !descriptor.capabilityCode) {
    throw new SpecialistError(
      "RULE_VIOLATION",
      "A WRITE specialist operation must declare a capability. Refusing to run ungoverned.",
    );
  }
}

/** Convenience: scope-safe existence check used by several specialists. */
export async function entityInScope(
  principal: Principal,
  tenantId: string,
  legalEntityId: string,
): Promise<boolean> {
  const [entity] = await db
    .select({ id: legalEntities.id })
    .from(legalEntities)
    .where(and(eq(legalEntities.id, legalEntityId), eq(legalEntities.tenantId, tenantId)))
    .limit(1);
  if (!entity) return false;
  if (principal.entityScope.length > 0 && !principal.entityScope.includes(entity.id)) return false;
  return true;
}
