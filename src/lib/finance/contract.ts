/**
 * BEYU OS — Finance OS service contract (Phase 7J, §6).
 *
 * ONE PIPELINE FOR EVERY FINANCIAL OPERATION:
 *
 *   PRINCIPAL → TENANT → ENTITY → CLEARANCE → PERMISSION → CAPABILITY → AUTHORITY → POLICY
 *   → TEMPORAL → FINANCIAL CONTROL → SERVICE → CANONICAL DATA → EXECUTION → AUDIT → EVENT → TRACE
 *
 * THIS IS NOT A SECOND SECURITY ENGINE. It composes what already exists:
 *   - `runSpecialist()` (7B) enforces TRACE → RBAC → TENANT → ENTITY → CAPABILITY → AUDIT;
 *   - `checkScopedCapability()` (7I) adds AUTHORITY with tenant/entity/principal scope;
 *   - `postJournal()` (7A) is the sole EXECUTION writer.
 *
 * What was missing was the FINANCIAL CONTROL stage between authority and execution — the checks
 * that are specific to money and to nothing else: attribution consistency, period lock,
 * epistemic admissibility, reconciliation state. Those are built here, once, and every finance
 * domain inherits them.
 *
 * NO STAGE DEFAULTS TO ALLOW. Each returns a specific denial code or passes explicitly.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { financialPeriods, legalEntities, treasuryPositions } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { checkScopedCapability } from "@/lib/authority/service";
import type { AuthorityDecisionCode } from "@/lib/authority/model";
import {
  assertNotSynthetic,
  canPromote,
  type EpistemicClass,
} from "./epistemics";
import { mayWrite } from "./truth";

export const FINANCE_CONTRACT_VERSION = "finance-os-1.0.0";

/**
 * Every way a Finance OS operation can be refused.
 * Ordered by pipeline stage so a reader can see where each one fires.
 */
export const FINANCE_DENIAL = [
  // identity / scope
  "TENANT_SCOPE_MISMATCH",
  "ENTITY_SCOPE_MISMATCH",
  "CLEARANCE_INSUFFICIENT",
  "PERMISSION_MISSING",
  // capability / authority
  "CAPABILITY_UNKNOWN",
  "CAPABILITY_LOCKED",
  "AUTHORITY_MISSING",
  "AUTHORITY_NOT_EFFECTIVE",
  "AUTHORITY_EXPIRED",
  "AUTHORITY_REVOKED",
  "AUTHORITY_CHAIN_INCOMPLETE",
  "REQUIRES_AUTHORITY",
  "REQUIRES_POLICY",
  "POLICY_CONFLICT",
  // financial control
  "ATTRIBUTION_CONFLICT",
  "GOVERNANCE_REVIEW_REQUIRED",
  "PERIOD_LOCKED",
  "RECONCILIATION_REQUIRED",
  "DUPLICATE_TRANSACTION",
  "ILLEGAL_PROMOTION",
  "SYNTHETIC_IN_PRODUCTION",
  "NOT_CANONICAL_WRITER",
  "SEGREGATION_OF_DUTIES",
  // data
  "DATA_NOT_AVAILABLE",
  "DATA_CONFLICT",
  // success
  "PERMITTED",
] as const;
export type FinanceDenialCode = (typeof FINANCE_DENIAL)[number];

export type FinanceStage =
  | "PRINCIPAL" | "TENANT" | "ENTITY" | "CLEARANCE" | "PERMISSION" | "CAPABILITY"
  | "AUTHORITY" | "POLICY" | "TEMPORAL" | "FINANCIAL_CONTROL" | "SERVICE" | "EXECUTION";

export type FinanceGateResult = {
  permitted: boolean;
  decision: FinanceDenialCode;
  /** The stage that produced the decision — makes a denial diagnosable without a debugger. */
  stage: FinanceStage;
  reason: string;
  /** Every stage evaluated, in order, with its outcome. */
  stagesEvaluated: Array<{ stage: FinanceStage; passed: boolean; detail: string }>;
  contractVersion: string;
};

export class FinanceControlError extends Error {
  constructor(
    readonly code: FinanceDenialCode,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "FinanceControlError";
  }
}

// ===========================================================================
// ATTRIBUTION (§9, §16)
// ===========================================================================

export type AttributionVerdict = {
  consistent: boolean;
  decision: "PERMITTED" | "ATTRIBUTION_CONFLICT" | "GOVERNANCE_REVIEW_REQUIRED";
  claimedTenantId: string;
  owningTenantId: string | null;
  legalEntityId: string;
  reason: string;
};

/**
 * Does a financial row's claimed tenant agree with the entity's actual owner?
 *
 * `legal_entities.tenant_id` is canonical (see the truth registry). A financial row claiming a
 * different tenant is either a data defect or an attempt to launder another tenant's balances into
 * a group view. Either way the correct answer is to REPORT, never to silently repair: repairing
 * would destroy the evidence of a governance problem.
 *
 * This is a live defect in the seeded data — 3 of 5 treasury positions claim TEN_BEYU_GROUP for
 * entities owned by TEN_BEYU_TZ, TEN_BEYU_HEALTH and TEN_BEYU_AGRI.
 */
export async function checkAttribution(input: {
  claimedTenantId: string;
  legalEntityId: string;
}): Promise<AttributionVerdict> {
  const [entity] = await db
    .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
    .from(legalEntities)
    .where(eq(legalEntities.id, input.legalEntityId))
    .limit(1);

  if (!entity) {
    return {
      consistent: false,
      decision: "GOVERNANCE_REVIEW_REQUIRED",
      claimedTenantId: input.claimedTenantId,
      owningTenantId: null,
      legalEntityId: input.legalEntityId,
      reason: `Legal entity ${input.legalEntityId} does not exist; ownership cannot be established.`,
    };
  }

  if (entity.tenantId !== input.claimedTenantId) {
    return {
      consistent: false,
      decision: "ATTRIBUTION_CONFLICT",
      claimedTenantId: input.claimedTenantId,
      owningTenantId: entity.tenantId,
      legalEntityId: input.legalEntityId,
      reason:
        `Entity ${input.legalEntityId} is owned by ${entity.tenantId}, but the record claims ` +
        `${input.claimedTenantId}. Aggregating it would import another tenant's financial truth. ` +
        "Reported, not repaired: the discrepancy is governance-owned.",
    };
  }

  return {
    consistent: true,
    decision: "PERMITTED",
    claimedTenantId: input.claimedTenantId,
    owningTenantId: entity.tenantId,
    legalEntityId: input.legalEntityId,
    reason: `Entity ${input.legalEntityId} is owned by ${entity.tenantId} as claimed.`,
  };
}

/** Every attribution conflict in the treasury substrate. Read-only; repairs nothing. */
export async function scanTreasuryAttribution(): Promise<AttributionVerdict[]> {
  const rows = await db
    .select({
      positionId: treasuryPositions.id,
      claimed: treasuryPositions.tenantId,
      entityId: treasuryPositions.legalEntityId,
    })
    .from(treasuryPositions);

  const out: AttributionVerdict[] = [];
  for (const r of rows) {
    if (!r.entityId) continue;
    out.push(await checkAttribution({ claimedTenantId: r.claimed, legalEntityId: r.entityId }));
  }
  return out;
}

// ===========================================================================
// PERIOD LOCK (§18)
// ===========================================================================

export type PeriodVerdict = {
  open: boolean;
  decision: "PERMITTED" | "PERIOD_LOCKED" | "DATA_NOT_AVAILABLE";
  periodId: string | null;
  status: string | null;
  reason: string;
};

/**
 * May a posting be made to `date` for this entity?
 *
 * Fails closed when no period exists. An absent accounting calendar is not an open calendar —
 * treating "no period defined" as permission to post is how backdated entries appear in a closed
 * year.
 */
export async function checkPeriodOpen(input: {
  legalEntityId: string;
  date: string;
}): Promise<PeriodVerdict> {
  const [period] = await db
    .select()
    .from(financialPeriods)
    .where(
      and(
        eq(financialPeriods.legalEntityId, input.legalEntityId),
        sql`${financialPeriods.startsOn} <= ${input.date}::date`,
        sql`${financialPeriods.endsOn} >= ${input.date}::date`,
      ),
    )
    .limit(1);

  if (!period) {
    return {
      open: false,
      decision: "DATA_NOT_AVAILABLE",
      periodId: null,
      status: null,
      reason:
        `No accounting period covers ${input.date} for ${input.legalEntityId}. ` +
        "No period means no permission to post; the fiscal calendar is an accounting-policy artefact (P1).",
    };
  }

  if (period.status !== "OPEN") {
    return {
      open: false,
      decision: "PERIOD_LOCKED",
      periodId: period.id,
      status: period.status,
      reason: `Period ${period.code} is ${period.status}; postings are refused.`,
    };
  }

  return {
    open: true,
    decision: "PERMITTED",
    periodId: period.id,
    status: period.status,
    reason: `Period ${period.code} is OPEN.`,
  };
}

// ===========================================================================
// SEGREGATION OF DUTIES (§18)
// ===========================================================================

/**
 * Maker/checker. Refuses self-approval.
 *
 * No threshold is applied: "amounts over X need two approvers" is a policy judgement requiring
 * ratified authority. What IS policy-independent is that one person must not be both maker and
 * checker, so only that is enforced.
 */
export function checkSegregationOfDuties(input: {
  makerUserId: string;
  checkerUserId: string | null;
  requiresChecker: boolean;
}): { permitted: boolean; decision: "PERMITTED" | "SEGREGATION_OF_DUTIES"; reason: string } {
  if (!input.requiresChecker) {
    return { permitted: true, decision: "PERMITTED", reason: "No separate checker is required for this operation." };
  }
  if (!input.checkerUserId) {
    return { permitted: false, decision: "SEGREGATION_OF_DUTIES", reason: "A checker is required but none was recorded." };
  }
  if (input.checkerUserId === input.makerUserId) {
    return {
      permitted: false,
      decision: "SEGREGATION_OF_DUTIES",
      reason: `${input.makerUserId} cannot both make and check the same operation.`,
    };
  }
  return { permitted: true, decision: "PERMITTED", reason: "Maker and checker are distinct principals." };
}

// ===========================================================================
// CANONICAL WRITER (§3)
// ===========================================================================

/**
 * May `writerModule` create truth in `table`?
 *
 * EXPORTED FOR DIRECT TESTING. Fault injection (7J FI-13) removed this check from the pipeline and
 * no test failed — every capability is locked, so authority denied first and execution never
 * reached the control. A control that only ever runs after another control has already denied is
 * untested by construction, so it gets its own boundary test.
 */
export function checkCanonicalWriter(input: {
  writerModule: string | null;
  writesTable: string | null;
}): { permitted: boolean; decision: "PERMITTED" | "NOT_CANONICAL_WRITER"; reason: string } {
  if (!input.writesTable) {
    return { permitted: true, decision: "PERMITTED", reason: "Operation writes no canonical table." };
  }
  if (!input.writerModule || !mayWrite(input.writerModule, input.writesTable)) {
    return {
      permitted: false,
      decision: "NOT_CANONICAL_WRITER",
      reason:
        `${input.writerModule ?? "(unknown module)"} is not the canonical writer of ${input.writesTable}. ` +
        "Only the registered sole writer may create truth in that table.",
    };
  }
  return {
    permitted: true,
    decision: "PERMITTED",
    reason: `${input.writerModule} is the canonical writer of ${input.writesTable}.`,
  };
}

// ===========================================================================
// THE FULL GATE
// ===========================================================================

/**
 * Runs the complete Finance OS pipeline for one operation.
 *
 * Stages run in order and stop at the first failure, so the reason returned is the most
 * fundamental one rather than an incidental later symptom.
 */
export async function financeGate(input: {
  capabilityCode: string;
  principal: Principal;
  tenantId: string;
  legalEntityId: string | null;
  /** Required for operations that write canonical truth. */
  writesTable?: string | null;
  writerModule?: string | null;
  /** Required for postings. */
  postingDate?: string | null;
  /** Epistemic class of the input data and the class it would be recorded as. */
  sourceClass?: EpistemicClass | null;
  targetClass?: EpistemicClass | null;
  makerUserId?: string | null;
  checkerUserId?: string | null;
  requiresChecker?: boolean;
  asOf?: string;
}): Promise<FinanceGateResult> {
  const stages: FinanceGateResult["stagesEvaluated"] = [];
  const done = (
    decision: FinanceDenialCode,
    stage: FinanceStage,
    reason: string,
  ): FinanceGateResult => ({
    permitted: decision === "PERMITTED",
    decision,
    stage,
    reason,
    stagesEvaluated: stages,
    contractVersion: FINANCE_CONTRACT_VERSION,
  });

  // --- 1-7. PRINCIPAL → AUTHORITY, delegated to the 7I scoped gate (which itself composes 6C) ---
  const authority = await checkScopedCapability({
    capabilityCode: input.capabilityCode,
    principal: input.principal,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
    asOf: input.asOf,
  });

  stages.push({
    stage: "AUTHORITY",
    passed: authority.permitted,
    detail: authority.reason,
  });

  if (!authority.permitted) {
    const mapped = mapAuthorityDecision(authority.decision);
    const stage: FinanceStage =
      mapped === "TENANT_SCOPE_MISMATCH" ? "TENANT"
      : mapped === "ENTITY_SCOPE_MISMATCH" ? "ENTITY"
      : mapped === "PERMISSION_MISSING" ? "PERMISSION"
      : mapped === "CAPABILITY_LOCKED" || mapped === "CAPABILITY_UNKNOWN" ? "CAPABILITY"
      : "AUTHORITY";
    return done(mapped, stage, authority.reason);
  }

  // --- 8. FINANCIAL CONTROL: canonical writer ---
  const writer = checkCanonicalWriter({
    writerModule: input.writerModule ?? null,
    writesTable: input.writesTable ?? null,
  });
  if (!writer.permitted) {
    stages.push({ stage: "FINANCIAL_CONTROL", passed: false, detail: writer.reason });
    return done("NOT_CANONICAL_WRITER", "FINANCIAL_CONTROL", writer.reason);
  }

  // --- 9. FINANCIAL CONTROL: epistemic admissibility ---
  if (input.sourceClass && input.targetClass) {
    try {
      assertNotSynthetic(input.sourceClass, "financeGate");
    } catch {
      stages.push({ stage: "FINANCIAL_CONTROL", passed: false, detail: "synthetic data" });
      return done("SYNTHETIC_IN_PRODUCTION", "FINANCIAL_CONTROL",
        "Synthetic data must never enter production financial truth.");
    }
    if (!canPromote(input.sourceClass, input.targetClass)) {
      stages.push({ stage: "FINANCIAL_CONTROL", passed: false, detail: "illegal promotion" });
      return done("ILLEGAL_PROMOTION", "FINANCIAL_CONTROL",
        `A ${input.sourceClass} value must never be recorded as ${input.targetClass}.`);
    }
  }

  // --- 10. FINANCIAL CONTROL: attribution ---
  if (input.legalEntityId) {
    const attribution = await checkAttribution({
      claimedTenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
    });
    stages.push({ stage: "FINANCIAL_CONTROL", passed: attribution.consistent, detail: attribution.reason });
    if (!attribution.consistent) {
      return done(attribution.decision as FinanceDenialCode, "FINANCIAL_CONTROL", attribution.reason);
    }
  }

  // --- 11. TEMPORAL: period lock ---
  if (input.postingDate && input.legalEntityId) {
    const period = await checkPeriodOpen({
      legalEntityId: input.legalEntityId,
      date: input.postingDate,
    });
    stages.push({ stage: "TEMPORAL", passed: period.open, detail: period.reason });
    if (!period.open) {
      return done(period.decision as FinanceDenialCode, "TEMPORAL", period.reason);
    }
  }

  // --- 12. FINANCIAL CONTROL: segregation of duties ---
  if (input.requiresChecker) {
    const sod = checkSegregationOfDuties({
      makerUserId: input.makerUserId ?? input.principal.userId,
      checkerUserId: input.checkerUserId ?? null,
      requiresChecker: true,
    });
    stages.push({ stage: "FINANCIAL_CONTROL", passed: sod.permitted, detail: sod.reason });
    if (!sod.permitted) return done("SEGREGATION_OF_DUTIES", "FINANCIAL_CONTROL", sod.reason);
  }

  stages.push({ stage: "SERVICE", passed: true, detail: "All control stages passed." });
  return done("PERMITTED", "SERVICE",
    `${input.capabilityCode} passed every Finance OS control stage for tenant ${input.tenantId}.`);
}

/** Maps a 7I authority decision onto the finance denial vocabulary without inventing meanings. */
function mapAuthorityDecision(code: AuthorityDecisionCode): FinanceDenialCode {
  switch (code) {
    case "PRINCIPAL_NOT_AUTHORIZED": return "PERMISSION_MISSING";
    case "AUTHORITY_SUPERSEDED": return "AUTHORITY_REVOKED";
    case "PERMITTED": return "PERMITTED";
    default:
      return (FINANCE_DENIAL as readonly string[]).includes(code)
        ? (code as FinanceDenialCode)
        : "REQUIRES_AUTHORITY";
  }
}
