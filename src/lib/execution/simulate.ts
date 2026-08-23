/**
 * BEYU OS — Isolated governed-execution simulation (Phase 11).
 *
 * EXISTING PRIMITIVES: evaluateAuthority, can(), checkCanonicalWriter,
 * checkSegregationOfDuties, evaluateWorkflowTransition, buildLineage,
 * simulateRatification.
 *
 * VERIFIED GAP: those primitives each answer one layer. Nothing composed
 * IDENTITY → GOVERNANCE → AUTHORITY → CAPABILITY → PERMISSION → SERVICE →
 * EXECUTION → AUDIT/EVENT/TRACE/LINEAGE as a single SIMULATION that a
 * production caller cannot mistake for ratification.
 *
 * THIS MODULE:
 *   - classifies every output SIMULATION
 *   - sets mutatedProductionState: false structurally
 *   - never imports db, never calls postJournal, never writes
 *   - never returns the words RATIFIED, APPROVED, or EFFECTIVE as a result status
 *
 * A valid synthetic fixture can become SIMULATION_ELIGIBLE. That is not
 * ACTIVATED and not an instruction.
 */
import { can, type Principal } from "@/lib/authz";
import type { PermissionCode } from "@/lib/constants";
import { evaluateAuthority } from "@/lib/authority/engines";
import type { AuthorityDecisionCode, AuthorityEvaluation, AuthorityRecord } from "@/lib/authority/model";
import { checkCanonicalWriter, checkSegregationOfDuties } from "@/lib/finance/contract";
import { assertNotSynthetic, canPromote, type EpistemicClass } from "@/lib/finance/epistemics";
import { assertNotCanonical, buildLineage, type Lineage, type LineageNode } from "@/lib/finance/lineage";
import {
  evaluateWorkflowTransition,
  type ControlRole,
  type WorkflowState,
  type WorkflowStep,
} from "@/lib/finance/workflow";

export const EXECUTION_SIM_VERSION = "execution-sim-1.0.0";

export const SIMULATION_VERDICT = ["SIMULATION_ELIGIBLE", "SIMULATION_DENIED"] as const;
export type SimulationVerdict = (typeof SIMULATION_VERDICT)[number];

export type SimulationStageName =
  | "PRINCIPAL"
  | "TENANT"
  | "ENTITY"
  | "PERMISSION"
  | "AUTHORITY_EXISTS"
  | "AUTHORITY_EFFECTIVE"
  | "AUTHORITY_PERMITS"
  | "CAPABILITY"
  | "EPISTEMIC"
  | "CANONICAL_WRITER"
  | "SEGREGATION"
  | "WORKFLOW"
  | "LINEAGE"
  | "CORRELATION";

export type SimulationStage = {
  stage: SimulationStageName;
  passed: boolean;
  detail: string;
};

export type ExecutionCorrelation = {
  traceId: string;
  actor: string | null;
  tenantId: string;
  entityId: string | null;
  capability: string;
  permission: string;
  authorityId: string | null;
  decision: string | null;
  policyRef: string | null;
  classification: "SIMULATION";
};

export type GovernedSimulation = {
  classification: "SIMULATION";
  verdict: SimulationVerdict;
  wouldExecute: boolean;
  /** Always false. Simulation writes nothing. */
  mutatedProductionState: false;
  stages: SimulationStage[];
  authority: {
    exists: boolean;
    effective: boolean;
    permits: boolean;
    decision: AuthorityDecisionCode | "NOT_EVALUATED";
  };
  correlation: ExecutionCorrelation;
  lineage: Lineage | null;
  explanation: string[];
};

export type SimulationInput = {
  traceId: string;
  principal: Principal | null;
  tenantId: string;
  legalEntityId: string | null;
  capabilityCode: string;
  permission: PermissionCode;
  /** Isolated fixture. Never loaded from production registries. */
  authority: AuthorityRecord | null;
  requiredPermission?: string | null;
  asOf: string;
  capabilityDeclared: boolean;
  sourceClass?: EpistemicClass | null;
  targetClass?: EpistemicClass | null;
  writerModule?: string | null;
  writesTable?: string | null;
  makerUserId?: string | null;
  checkerUserId?: string | null;
  requiresChecker?: boolean;
  workflow?: {
    from: WorkflowState;
    to: WorkflowState;
    role: ControlRole;
    history?: WorkflowStep[];
    capabilityActivated?: boolean;
  };
  lineageNodes?: LineageNode[];
  policyRef?: string | null;
};

function deny(
  stages: SimulationStage[],
  input: SimulationInput,
  authority: AuthorityEvaluation | null,
  lineage: Lineage | null,
  reason: string,
): GovernedSimulation {
  return {
    classification: "SIMULATION",
    verdict: "SIMULATION_DENIED",
    wouldExecute: false,
    mutatedProductionState: false,
    stages,
    authority: {
      exists: authority?.exists ?? false,
      effective: authority?.effective ?? false,
      permits: authority?.permits ?? false,
      decision: authority?.decision ?? "NOT_EVALUATED",
    },
    correlation: correlationOf(input, authority),
    lineage,
    explanation: [
      reason,
      "This is a SIMULATION. Nothing was ratified, approved, activated or posted.",
    ],
  };
}

function correlationOf(input: SimulationInput, authority: AuthorityEvaluation | null): ExecutionCorrelation {
  return {
    traceId: input.traceId,
    actor: input.principal?.userId ?? null,
    tenantId: input.tenantId,
    entityId: input.legalEntityId,
    capability: input.capabilityCode,
    permission: input.permission,
    authorityId: input.authority?.authorityId ?? null,
    decision: authority?.authorityId ?? null,
    policyRef: input.policyRef ?? null,
    classification: "SIMULATION",
  };
}

/**
 * EXPORTED FOR DIRECT TESTING. A simulation result must never carry a production
 * activation word as its verdict. FI: if this is deleted, a result labelled
 * RATIFIED / APPROVED / EFFECTIVE / ACTIVATED would pass unnoticed.
 */
export function assertSimulationVocabulary(verdict: string): void {
  const banned = ["RATIFIED", "APPROVED", "EFFECTIVE", "ACTIVATED"];
  if (banned.includes(verdict)) {
    throw new Error(
      `Simulation verdict '${verdict}' is a production activation word. ` +
        "A simulation may only conclude SIMULATION_ELIGIBLE or SIMULATION_DENIED.",
    );
  }
  if (verdict !== "SIMULATION_ELIGIBLE" && verdict !== "SIMULATION_DENIED") {
    throw new Error(`Unknown simulation verdict '${verdict}'.`);
  }
}

/**
 * Run the full governed-execution pipeline against isolated fixtures.
 *
 * Does not read or write the database. Production authority, capabilities and
 * financial tables are not consulted and cannot change.
 */
export function simulateGovernedExecution(input: SimulationInput): GovernedSimulation {
  const stages: SimulationStage[] = [];
  const stop = (stage: SimulationStageName, detail: string, authority: AuthorityEvaluation | null = null, lineage: Lineage | null = null) => {
    stages.push({ stage, passed: false, detail });
    const result = deny(stages, input, authority, lineage, detail);
    assertSimulationVocabulary(result.verdict);
    return result;
  };

  if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.traceId)) {
    return stop("CORRELATION", "A well-formed traceId is required; simulation refuses an uncorrelatable run.");
  }

  // --- 1. PRINCIPAL ---
  if (!input.principal) {
    return stop("PRINCIPAL", "Missing principal; execution cannot be attributed.");
  }
  stages.push({ stage: "PRINCIPAL", passed: true, detail: `Principal ${input.principal.userId}.` });

  // --- 2. TENANT ---
  if (input.principal.tenantId !== input.tenantId) {
    return stop(
      "TENANT",
      `Principal belongs to ${input.principal.tenantId} and cannot act for ${input.tenantId}.`,
    );
  }
  stages.push({ stage: "TENANT", passed: true, detail: `Tenant ${input.tenantId}.` });

  // --- 3. ENTITY ---
  if (
    input.legalEntityId &&
    input.principal.entityScope.length > 0 &&
    !input.principal.entityScope.includes(input.legalEntityId)
  ) {
    return stop("ENTITY", `Principal is not scoped to legal entity ${input.legalEntityId}.`);
  }
  stages.push({ stage: "ENTITY", passed: true, detail: input.legalEntityId ?? "unscoped (all entities in tenant)." });

  // --- 4. PERMISSION (common can(); not a finance-specific authorizer) ---
  const rbac = can(input.principal, input.permission);
  if (!rbac.allowed) {
    return stop("PERMISSION", rbac.reason);
  }
  stages.push({ stage: "PERMISSION", passed: true, detail: `Permission ${input.permission}.` });

  // --- 5–7. AUTHORITY EXISTS / EFFECTIVE / PERMITS (existing evaluateAuthority) ---
  const evaluation = evaluateAuthority(input.authority, {
    authorityId: input.authority?.authorityId ?? "(none)",
    asOf: input.asOf,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
    principalPermissions: input.principal.permissions,
    requiredPermission: input.requiredPermission ?? input.permission,
  });
  stages.push({
    stage: "AUTHORITY_EXISTS",
    passed: evaluation.exists,
    detail: evaluation.exists ? `Record ${evaluation.authorityId} present.` : evaluation.reason,
  });
  if (!evaluation.exists) return stop("AUTHORITY_EXISTS", evaluation.reason, evaluation);

  stages.push({
    stage: "AUTHORITY_EFFECTIVE",
    passed: evaluation.effective,
    detail: evaluation.effective ? "In force at asOf." : evaluation.reason,
  });
  if (!evaluation.effective) return stop("AUTHORITY_EFFECTIVE", evaluation.reason, evaluation);

  stages.push({
    stage: "AUTHORITY_PERMITS",
    passed: evaluation.permits,
    detail: evaluation.permits ? "Covers this tenant, entity and principal." : evaluation.reason,
  });
  if (!evaluation.permits) return stop("AUTHORITY_PERMITS", evaluation.reason, evaluation);

  // --- 8. CAPABILITY (declared for this isolated run; production registry is not consulted) ---
  if (!input.capabilityDeclared || !input.capabilityCode) {
    return stop("CAPABILITY", "Capability is undeclared; AUTHORITY_CHAIN_INCOMPLETE.", evaluation);
  }
  stages.push({ stage: "CAPABILITY", passed: true, detail: `Capability ${input.capabilityCode} declared for this simulation.` });

  // --- 9. EPISTEMIC ---
  if (input.sourceClass && input.targetClass) {
    try {
      assertNotSynthetic(input.sourceClass, "simulateGovernedExecution");
    } catch {
      return stop("EPISTEMIC", "Synthetic data must never become production financial truth.", evaluation);
    }
    if (!canPromote(input.sourceClass, input.targetClass)) {
      return stop(
        "EPISTEMIC",
        `A ${input.sourceClass} value must never be recorded as ${input.targetClass}.`,
        evaluation,
      );
    }
  }
  stages.push({ stage: "EPISTEMIC", passed: true, detail: "Epistemic promotion is admissible or not required." });

  // --- 10. CANONICAL WRITER ---
  const writer = checkCanonicalWriter({
    writerModule: input.writerModule ?? null,
    writesTable: input.writesTable ?? null,
  });
  if (!writer.permitted) return stop("CANONICAL_WRITER", writer.reason, evaluation);
  stages.push({ stage: "CANONICAL_WRITER", passed: true, detail: writer.reason });

  // --- 11. SoD ---
  if (input.requiresChecker) {
    const sod = checkSegregationOfDuties({
      makerUserId: input.makerUserId ?? input.principal.userId,
      checkerUserId: input.checkerUserId ?? null,
      requiresChecker: true,
    });
    if (!sod.permitted) return stop("SEGREGATION", sod.reason, evaluation);
    stages.push({ stage: "SEGREGATION", passed: true, detail: sod.reason });
  } else {
    stages.push({ stage: "SEGREGATION", passed: true, detail: "No separate checker required for this simulation." });
  }

  // --- 12. WORKFLOW ---
  if (input.workflow) {
    const wf = evaluateWorkflowTransition({
      from: input.workflow.from,
      to: input.workflow.to,
      actorUserId: input.principal.userId,
      role: input.workflow.role,
      traceId: input.traceId,
      history: input.workflow.history,
      capabilityActivated: input.workflow.capabilityActivated,
    });
    if (!wf.permitted) return stop("WORKFLOW", wf.reason, evaluation);
    stages.push({ stage: "WORKFLOW", passed: true, detail: wf.reason });
  } else {
    stages.push({ stage: "WORKFLOW", passed: true, detail: "No workflow transition in this simulation." });
  }

  // --- 13. LINEAGE ---
  let lineage: Lineage | null = null;
  if (input.lineageNodes) {
    lineage = buildLineage(input.lineageNodes);
    assertNotCanonical(lineage, "simulateGovernedExecution");
    stages.push({
      stage: "LINEAGE",
      passed: true,
      detail: `Lineage ${lineage.lineageId.slice(0, 12)}… result ${lineage.resultClass}; canonical=${lineage.canonical}.`,
    });
  } else {
    stages.push({ stage: "LINEAGE", passed: true, detail: "No derivation was supplied." });
  }

  stages.push({ stage: "CORRELATION", passed: true, detail: `Trace ${input.traceId} bound to the simulated act.` });

  const result: GovernedSimulation = {
    classification: "SIMULATION",
    verdict: "SIMULATION_ELIGIBLE",
    wouldExecute: true,
    mutatedProductionState: false,
    stages,
    authority: {
      exists: true,
      effective: true,
      permits: true,
      decision: evaluation.decision,
    },
    correlation: correlationOf(input, evaluation),
    lineage,
    explanation: [
      `${input.capabilityCode} is SIMULATION_ELIGIBLE under isolated fixtures at ${input.asOf}.`,
      "SIMULATION_ELIGIBLE is not ACTIVATED, not RATIFIED, and not an instruction.",
      "mutatedProductionState is false; no registry, ledger, treasury or capital row was touched.",
    ],
  };
  assertSimulationVocabulary(result.verdict);
  return result;
}

/** Isolated fixture factory. Never persisted. */
export function syntheticAuthority(over: Partial<AuthorityRecord> = {}): AuthorityRecord {
  return {
    authorityId: "SYNTHETIC-AUTH-001",
    authorityType: "DECISION",
    source: "SIMULATION",
    issuer: "SYNTHETIC_BODY",
    approver: "SYNTHETIC_MAKER",
    approvalDate: "2026-01-01",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    status: "RATIFIED",
    authorityClass: "SYNTHETIC_FIXTURE",
    jurisdiction: null,
    tenantId: "TEN_SYNTH",
    entityScope: null,
    scope: null,
    policyVersion: "sim-1",
    evidence: "SYNTHETIC-EVIDENCE",
    provenance: "SIMULATION",
    checksum: "synthetic",
    supersedes: null,
    revokes: null,
    rationale: "Isolated fixture for execution simulation. Not production authority.",
    ...over,
  };
}
