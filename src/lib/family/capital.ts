/**
 * BEYU OS — FAMILY CAPITAL SYSTEM ENGINE (pure).
 *
 * The strategic capital backbone: six pools, a 13-step allocation chain, and the
 * asset-segregation invariant.
 *
 * ============================== WHAT IT IS NOT ==============================
 *
 * THIS IS NOT A SECOND FINANCE SYSTEM. Finance OS owns canonical financial
 * truth: the ledger, accounting, reconciliation, financial reporting and
 * financial controls (`src/lib/finance/**`, `journal_entries`, `capital_requests`).
 *
 * A capital POOL here is a MANDATE — a governed statement of owner, source,
 * purpose, permitted use, restrictions, risk, liquidity and allocation authority.
 * It is not an account and holds no balance of record. Where this engine needs a
 * balance it takes it as an input marked as observed from Finance OS, and says
 * so. Family Office may INITIATE capital requests; Finance OS remains
 * authoritative for the financial consequence.
 *
 * ============================ THREE INVARIANTS ============================
 *
 * 1. CAPITAL NEVER MOVES WITHOUT GOVERNANCE. Every step of the 13-step chain
 *    must pass before execution is even representable, and the engine never
 *    returns "executed" — it returns whether authorization is sufficient for a
 *    human to execute.
 * 2. ASSET SEGREGATION IS ABSOLUTE. Moving capital between segregation classes
 *    requires legal authority, policy, approval, accounting treatment, tax
 *    treatment and audit. All six. Missing any one is a hard refusal.
 * 3. LIQUIDITY IS OBSERVED, NEVER ASSUMED. An unavailable Finance OS balance
 *    yields UNAVAILABLE, never zero and never "enough".
 */
import {
  ASSET_SEGREGATION_CLASSES,
  CAPITAL_ALLOCATION_STEPS,
  CAPITAL_POOLS,
  SEGREGATION_PRECONDITIONS,
  absentFields,
  assertHumanAuthority,
  assertIsoDate,
  FamilyInstitutionError,
  isPresent,
  type AssetSegregationClass,
  type CapitalAllocationStep,
  type CapitalPool,
  type FamilyActorType,
  type PolicyDecisionRequirement,
  type SegregationPrecondition,
} from "./model";

export const FAMILY_CAPITAL_ENGINE_VERSION = "family-capital-1.0.0";

/* ------------------------------------------------------------------ */
/* Pools                                                               */
/* ------------------------------------------------------------------ */

/** The definition every pool must carry. Missing any one makes it incomplete. */
export const CAPITAL_POOL_DEFINITION_FIELDS = [
  "owner",
  "source",
  "purpose",
  "permittedUse",
  "restrictions",
  "risk",
  "liquidity",
  "allocationAuthority",
  "performance",
  "accountingIntegration",
  "taxLegalClassification",
  "audit",
] as const;
export type CapitalPoolDefinitionField = (typeof CAPITAL_POOL_DEFINITION_FIELDS)[number];

export type FamilyCapitalPool = {
  poolId: string;
  pool: CapitalPool;
  /** The legal entity that owns the pool. Capital is always legally attributed. */
  legalEntityId: string;
  jurisdictionCode: string;
  currency: string;
  segregationClass: AssetSegregationClass;
  definition: Partial<Record<CapitalPoolDefinitionField, string | null>>;
  /**
   * Balance observed from Finance OS. Null means Finance OS did not supply one —
   * which is UNAVAILABLE, never zero.
   */
  observedBalanceMinor: number | null;
  observedAsOf: string | null;
  /** Governance reference establishing the pool. */
  establishedByReference: string | null;
};

export type PoolAssessment = {
  engineVersion: string;
  poolId: string;
  pool: CapitalPool;
  complete: boolean;
  missing: CapitalPoolDefinitionField[];
  /** True when the pool definition is inconsistent with its segregation class. */
  segregationConflict: boolean;
  blockers: string[];
  policyDecisionRequired: PolicyDecisionRequirement | null;
};

/**
 * Segregation classes each pool is compatible with.
 *
 * A pool classified as PHILANTHROPIC_CAPITAL that is segregated as
 * FAMILY_CAPITAL is a defect: the pool mandate and the asset class disagree, and
 * the disagreement is exactly where capital leaks between protected and
 * unprotected use.
 */
const POOL_SEGREGATION_COMPATIBILITY: Record<CapitalPool, AssetSegregationClass[]> = {
  PERMANENT_CAPITAL: ["FAMILY_CAPITAL", "COMPANY_ASSETS", "INVESTMENT_VEHICLES"],
  OPPORTUNITY_CAPITAL: ["FAMILY_CAPITAL", "INVESTMENT_VEHICLES", "BUSINESS_ASSETS"],
  FAMILY_LENDING_CAPITAL: ["FAMILY_CAPITAL", "COMPANY_ASSETS"],
  LIQUIDITY_RESERVE: ["FAMILY_CAPITAL", "COMPANY_ASSETS"],
  PHILANTHROPIC_CAPITAL: ["PHILANTHROPIC_ASSETS"],
  NEXT_GENERATION_CAPITAL: ["FAMILY_CAPITAL", "TRUST_ASSETS"],
};

export function assessCapitalPool(pool: FamilyCapitalPool): PoolAssessment {
  const blockers: string[] = [];
  let policyDecisionRequired: PolicyDecisionRequirement | null = null;

  if (!CAPITAL_POOLS.includes(pool.pool)) {
    blockers.push(`${String(pool.pool)} is not one of the six canonical capital pools.`);
  }
  if (!ASSET_SEGREGATION_CLASSES.includes(pool.segregationClass)) {
    blockers.push(`${String(pool.segregationClass)} is not a recognised segregation class.`);
  }
  if (!isPresent(pool.legalEntityId)) {
    blockers.push("A capital pool must be legally attributed to an entity. Unattributed capital is not governable.");
  }
  if (!isPresent(pool.jurisdictionCode)) {
    blockers.push(
      "Jurisdiction is required. National rules are never generalised across jurisdictions; tax and legal classification are jurisdiction-specific.",
    );
  }
  if (!isPresent(pool.establishedByReference)) {
    blockers.push("No governance reference establishes this pool.");
  }
  if (pool.observedAsOf !== null) assertIsoDate(pool.observedAsOf, "pool observedAsOf");

  const missing = CAPITAL_POOL_DEFINITION_FIELDS.filter(
    (f) => !isPresent(pool.definition[f] ?? null),
  );

  const compatible = POOL_SEGREGATION_COMPATIBILITY[pool.pool] ?? [];
  const segregationConflict = compatible.length > 0 && !compatible.includes(pool.segregationClass);
  if (segregationConflict) {
    blockers.push(
      `${pool.pool} is segregated as ${pool.segregationClass}, which is incompatible with its mandate (permitted classes: ${compatible.join(", ")}).`,
    );
  }

  if (pool.observedBalanceMinor === null) {
    policyDecisionRequired = null;
    blockers.push(
      "Finance OS supplied no observed balance. This is UNAVAILABLE, not zero; deployment authority cannot be computed.",
    );
  }

  return {
    engineVersion: FAMILY_CAPITAL_ENGINE_VERSION,
    poolId: pool.poolId,
    pool: pool.pool,
    complete: missing.length === 0,
    missing,
    segregationConflict,
    blockers,
    policyDecisionRequired,
  };
}

/* ------------------------------------------------------------------ */
/* Asset segregation                                                   */
/* ------------------------------------------------------------------ */

export type SegregationTransfer = {
  transferId: string;
  from: AssetSegregationClass;
  to: AssetSegregationClass;
  amountMinor: number;
  currency: string;
  preconditions: Partial<Record<SegregationPrecondition, string | null>>;
  actorType: FamilyActorType;
};

export type SegregationAssessment = {
  engineVersion: string;
  transferId: string;
  permitted: boolean;
  /** True when the transfer stays inside one segregation class. */
  withinClass: boolean;
  missingPreconditions: SegregationPrecondition[];
  reason: string;
};

/**
 * The asset-segregation invariant.
 *
 * Trust assets, family capital, personal assets, Family Office operating assets,
 * company assets, business assets, philanthropic assets, investment vehicles and
 * lifestyle assets are separate. One pool is never used as another without legal
 * authority, policy, approval, accounting treatment, tax treatment and audit.
 */
export function assessSegregationTransfer(transfer: SegregationTransfer): SegregationAssessment {
  if (transfer.actorType === "AI") {
    throw new FamilyInstitutionError(
      "AI_AUTHORITY_REFUSED",
      "Noelia may not move capital between segregation classes. Noelia may analyse and recommend; a human with authority executes.",
      { transferId: transfer.transferId },
    );
  }
  if (transfer.amountMinor <= 0) {
    throw new FamilyInstitutionError(
      "RULE_VIOLATION",
      "A segregation transfer must have a positive amount in minor units.",
      { transferId: transfer.transferId },
    );
  }

  const withinClass = transfer.from === transfer.to;
  if (withinClass) {
    return {
      engineVersion: FAMILY_CAPITAL_ENGINE_VERSION,
      transferId: transfer.transferId,
      permitted: true,
      withinClass: true,
      missingPreconditions: [],
      reason: `Movement within ${transfer.from}; no segregation precondition applies.`,
    };
  }

  const missingPreconditions = SEGREGATION_PRECONDITIONS.filter(
    (p) => !isPresent(transfer.preconditions[p] ?? null),
  );

  const involvesTrust =
    transfer.from === "TRUST_ASSETS" || transfer.to === "TRUST_ASSETS";

  return {
    engineVersion: FAMILY_CAPITAL_ENGINE_VERSION,
    transferId: transfer.transferId,
    permitted: missingPreconditions.length === 0,
    withinClass: false,
    missingPreconditions,
    reason:
      missingPreconditions.length === 0
        ? `Movement from ${transfer.from} to ${transfer.to} carries all six segregation preconditions${
            involvesTrust ? "; Trust movement additionally requires Trustee action under the instrument" : ""
          }.`
        : `Movement from ${transfer.from} to ${transfer.to} is refused: missing ${missingPreconditions.join(", ")}.${
            involvesTrust
              ? " Trust assets additionally require Trustee authority under the Trust instrument and applicable law; the Family Office cannot direct a Trustee."
              : ""
          }`,
  };
}

/** Refuse an undocumented cross-class movement outright. */
export function assertSegregationTransferDocumented(transfer: SegregationTransfer): void {
  const assessment = assessSegregationTransfer(transfer);
  if (!assessment.permitted) {
    throw new FamilyInstitutionError(
      "SEGREGATION_VIOLATION",
      assessment.reason,
      { transferId: transfer.transferId, missing: assessment.missingPreconditions },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Allocation chain                                                    */
/* ------------------------------------------------------------------ */

export type StepState = "PASSED" | "FAILED" | "NOT_REACHED" | "REQUIRES_HUMAN" | "UNAVAILABLE";

export type AllocationStepResult = {
  step: CapitalAllocationStep;
  state: StepState;
  reason: string;
  /** Governance or evidence reference supporting the step, when one exists. */
  reference: string | null;
};

export type AllocationRequest = {
  requestId: string;
  poolId: string;
  pool: CapitalPool;
  /** The Finance OS capital_requests row this allocation will initiate. */
  financeCapitalRequestId: string | null;
  legalEntityId: string;
  jurisdictionCode: string;
  amountMinor: number;
  currency: string;
  purpose: string | null;
  requestedBy: string;
  actorType: FamilyActorType;
  asOf: string;

  /** Inputs, each null when the relevant authority has not supplied it. */
  eligibilityDetermination: { result: "ELIGIBLE" | "NOT_ELIGIBLE" | "INDETERMINATE"; reference: string | null } | null;
  policyReference: string | null;
  riskAssessment: { score: number; appetiteBreach: boolean; reference: string | null } | null;
  /** Liquidity observed from Finance OS. Null means UNAVAILABLE. */
  availableLiquidityMinor: number | null;
  legalTaxReview: { legalReference: string | null; taxReference: string | null } | null;
  conflictAssessment: { cleared: boolean; reference: string | null } | null;
  authorityReference: string | null;
  approval: { approvedBy: string | null; approvalReference: string | null; validUntil: string | null } | null;
};

export type AllocationAssessment = {
  engineVersion: string;
  requestId: string;
  steps: AllocationStepResult[];
  /** The first step that is not PASSED. Null when every step passed. */
  blockingStep: CapitalAllocationStep | null;
  /** True when every step through APPROVAL passed and execution is a human act. */
  authorizationSufficient: boolean;
  /** Never true. This engine does not execute. */
  executed: false;
  policyDecisionRequired: PolicyDecisionRequirement | null;
  reason: string;
};

/**
 * Run the 13-step capital allocation chain.
 *
 * The chain halts at the first failure: a later step is never evaluated as
 * PASSED when an earlier one failed, because that would let an unauthorised
 * deployment be represented as merely "pending paperwork".
 *
 * Steps EXECUTION, FINANCIAL_RECORD and MONITORING are REQUIRES_HUMAN or
 * NOT_REACHED by construction — this engine initiates, Finance OS records, and a
 * human executes.
 */
export function assessAllocation(request: AllocationRequest): AllocationAssessment {
  assertIsoDate(request.asOf, "allocation asOf");
  if (request.actorType === "AI") {
    throw new FamilyInstitutionError(
      "AI_AUTHORITY_REFUSED",
      "Noelia may not approve or deploy capital. Noelia may analyse, model and recommend; a human with authority approves.",
      { requestId: request.requestId },
    );
  }
  if (request.amountMinor <= 0) {
    throw new FamilyInstitutionError(
      "RULE_VIOLATION",
      "A capital allocation must have a positive amount in minor units.",
      { requestId: request.requestId },
    );
  }

  const steps: AllocationStepResult[] = [];
  let policyDecisionRequired: PolicyDecisionRequirement | null = null;
  let halted = false;

  const push = (
    step: CapitalAllocationStep,
    state: StepState,
    reason: string,
    reference: string | null = null,
  ): void => {
    steps.push({ step, state, reason, reference });
    if (state === "FAILED" || state === "UNAVAILABLE") halted = true;
  };

  // 1. CAPITAL_REQUEST
  if (halted) {
    push("CAPITAL_REQUEST", "NOT_REACHED", "An earlier step failed.", null);
  } else if (!isPresent(request.requestId) || !isPresent(request.requestedBy)) {
    push("CAPITAL_REQUEST", "FAILED", "A request must have an identifier and an accountable requester.", null);
  } else if (!isPresent(request.legalEntityId) || !isPresent(request.jurisdictionCode)) {
    push(
      "CAPITAL_REQUEST",
      "FAILED",
      "A capital request must be legally attributed to an entity in a named jurisdiction.",
      null,
    );
  } else {
    push(
      "CAPITAL_REQUEST",
      "PASSED",
      `Request ${request.requestId} by ${request.requestedBy} for ${request.amountMinor} minor units ${request.currency}, attributed to ${request.legalEntityId} (${request.jurisdictionCode}).`,
      request.financeCapitalRequestId,
    );
  }

  // 2. PURPOSE
  if (halted) push("PURPOSE", "NOT_REACHED", "An earlier step failed.", null);
  else if (!isPresent(request.purpose)) push("PURPOSE", "FAILED", "No purpose recorded.", null);
  else push("PURPOSE", "PASSED", `Purpose: ${request.purpose}.`, null);

  // 3. ELIGIBILITY
  if (halted) push("ELIGIBILITY", "NOT_REACHED", "An earlier step failed.", null);
  else if (!request.eligibilityDetermination) {
    push("ELIGIBILITY", "FAILED", "No eligibility determination was supplied. Eligibility is never presumed.", null);
  } else if (request.eligibilityDetermination.result === "NOT_ELIGIBLE") {
    push("ELIGIBILITY", "FAILED", "The requester is not eligible for this domain.", request.eligibilityDetermination.reference);
  } else if (request.eligibilityDetermination.result === "INDETERMINATE") {
    push(
      "ELIGIBILITY",
      "FAILED",
      "Eligibility is indeterminate. A determination that cannot be made is not a determination in favour.",
      request.eligibilityDetermination.reference,
    );
  } else {
    push("ELIGIBILITY", "PASSED", "Eligibility determined ELIGIBLE.", request.eligibilityDetermination.reference);
  }

  // 4. POLICY
  if (halted) push("POLICY", "NOT_REACHED", "An earlier step failed.", null);
  else if (!isPresent(request.policyReference)) {
    push("POLICY", "FAILED", "No governing policy reference. Capital is deployed under policy, never by discretion alone.", null);
  } else push("POLICY", "PASSED", `Governed by ${request.policyReference}.`, request.policyReference);

  // 5. RISK
  if (halted) push("RISK", "NOT_REACHED", "An earlier step failed.", null);
  else if (!request.riskAssessment) push("RISK", "FAILED", "No risk assessment supplied.", null);
  else if (request.riskAssessment.appetiteBreach) {
    push("RISK", "FAILED", `Risk score ${request.riskAssessment.score} breaches the recorded appetite.`, request.riskAssessment.reference);
  } else push("RISK", "PASSED", `Risk score ${request.riskAssessment.score} within appetite.`, request.riskAssessment.reference);

  // 6. LIQUIDITY
  if (halted) push("LIQUIDITY", "NOT_REACHED", "An earlier step failed.", null);
  else if (request.availableLiquidityMinor === null) {
    push(
      "LIQUIDITY",
      "UNAVAILABLE",
      "Finance OS supplied no available liquidity. This is UNAVAILABLE, never zero and never sufficient.",
      null,
    );
  } else if (request.availableLiquidityMinor < request.amountMinor) {
    push(
      "LIQUIDITY",
      "FAILED",
      `Available liquidity ${request.availableLiquidityMinor} minor units is less than the requested ${request.amountMinor}.`,
      null,
    );
  } else {
    push("LIQUIDITY", "PASSED", `Available liquidity ${request.availableLiquidityMinor} covers ${request.amountMinor}.`, null);
  }

  // 7. LEGAL / TAX
  if (halted) push("LEGAL_TAX", "NOT_REACHED", "An earlier step failed.", null);
  else if (!request.legalTaxReview || !isPresent(request.legalTaxReview.legalReference) || !isPresent(request.legalTaxReview.taxReference)) {
    push(
      "LEGAL_TAX",
      "FAILED",
      "Legal and tax review must both be recorded, and both are jurisdiction-specific. Tanzanian law is never assumed to apply globally, and foreign law is never assumed to apply to Tanzania.",
      null,
    );
  } else {
    push(
      "LEGAL_TAX",
      "PASSED",
      `Legal review ${request.legalTaxReview.legalReference}; tax review ${request.legalTaxReview.taxReference}.`,
      request.legalTaxReview.taxReference,
    );
  }

  // 8. CONFLICT
  if (halted) push("CONFLICT", "NOT_REACHED", "An earlier step failed.", null);
  else if (!request.conflictAssessment) push("CONFLICT", "FAILED", "No conflict assessment supplied.", null);
  else if (!request.conflictAssessment.cleared) {
    push("CONFLICT", "FAILED", "A declared conflict has not cleared the DISCLOSE → FLAG → RECUSE → REVIEW → APPROVE → RECORD → AUDIT workflow.", request.conflictAssessment.reference);
  } else push("CONFLICT", "PASSED", "No uncleared conflict.", request.conflictAssessment.reference);

  // 9. AUTHORITY
  if (halted) push("AUTHORITY", "NOT_REACHED", "An earlier step failed.", null);
  else if (!isPresent(request.authorityReference)) {
    push("AUTHORITY", "FAILED", "No authority reference. Capital cannot move without governance.", null);
  } else push("AUTHORITY", "PASSED", `Authority: ${request.authorityReference}.`, request.authorityReference);

  // 10. APPROVAL
  if (halted) push("APPROVAL", "NOT_REACHED", "An earlier step failed.", null);
  else if (!request.approval || !isPresent(request.approval.approvedBy) || !isPresent(request.approval.approvalReference)) {
    push("APPROVAL", "REQUIRES_HUMAN", "No human approval recorded. Approval is a human act.", null);
  } else if (request.approval.validUntil !== null && request.approval.validUntil < request.asOf) {
    push(
      "APPROVAL",
      "FAILED",
      `The approval expired on ${request.approval.validUntil}; it is no longer sufficient authority on ${request.asOf}.`,
      request.approval.approvalReference,
    );
  } else {
    push("APPROVAL", "PASSED", `Approved by ${request.approval.approvedBy}.`, request.approval.approvalReference);
  }

  // 11-13. EXECUTION / FINANCIAL_RECORD / MONITORING
  const blockedBeforeExecution = steps.some((s) => s.state === "FAILED" || s.state === "UNAVAILABLE");
  const approvalPassed = steps.find((s) => s.step === "APPROVAL")?.state === "PASSED";

  push(
    "EXECUTION",
    blockedBeforeExecution ? "NOT_REACHED" : approvalPassed ? "REQUIRES_HUMAN" : "NOT_REACHED",
    blockedBeforeExecution
      ? "An earlier step failed; execution is not representable."
      : approvalPassed
        ? "Execution is a human act under the recorded authority. This engine never executes."
        : "Approval has not passed; execution is not representable.",
    null,
  );
  push(
    "FINANCIAL_RECORD",
    "REQUIRES_HUMAN",
    "The financial consequence is recorded by Finance OS (canonical financial truth), never by the Family Office.",
    request.financeCapitalRequestId,
  );
  push(
    "MONITORING",
    blockedBeforeExecution ? "NOT_REACHED" : "REQUIRES_HUMAN",
    blockedBeforeExecution
      ? "Nothing was authorised, so there is nothing to monitor."
      : "Post-deployment monitoring is required once execution occurs.",
    null,
  );

  const blockingStep = steps.find((s) => s.state !== "PASSED" && s.state !== "REQUIRES_HUMAN")?.step ?? null;
  const authorizationSufficient =
    !blockedBeforeExecution && approvalPassed && !halted;

  if (!request.policyReference) {
    policyDecisionRequired = {
      code: `FAM-PD-CAPITAL-POLICY-${request.requestId}`,
      issue: "Which Family Capital policy governs this deployment?",
      domain: request.pool,
      options: [
        "Ratify a pool-specific deployment policy for the Family Council.",
        "Apply the Investment Policy Statement if the deployment is an investment.",
        "Defer the deployment until policy is ratified.",
      ],
      assumptions: ["No policy reference was supplied with the request."],
      legalImplications: "Deployment without policy may exceed the mandate of the entity holding the capital.",
      taxImplications: "Character of the deployment determines its tax treatment.",
      financialImplications: "Ungoverned deployment is the primary capital-loss risk in a family institution.",
      risk: "Capital deployed outside mandate may be irrecoverable.",
      decisionAuthority: "Family Council on the recommendation of the Family Investment or Capital Committee.",
      status: "OPEN",
      decision: null,
      decisionReference: null,
      effectiveDate: null,
    };
  }

  return {
    engineVersion: FAMILY_CAPITAL_ENGINE_VERSION,
    requestId: request.requestId,
    steps,
    blockingStep,
    authorizationSufficient,
    executed: false,
    policyDecisionRequired,
    reason: authorizationSufficient
      ? "All governance steps through APPROVAL passed. Execution, financial recording and monitoring remain human and Finance OS acts."
      : `Halted at ${blockingStep ?? "an unknown step"}.`,
  };
}

/* ------------------------------------------------------------------ */
/* Portfolio construction inputs (governance-side only)                */
/* ------------------------------------------------------------------ */

/**
 * Investment Policy Statement elements the Family Investment Committee must have
 * ratified before a strategic allocation can be assessed.
 *
 * Recording the requirement is not the same as having an IPS: an absent element
 * is reported, never defaulted.
 */
export const IPS_ELEMENTS = [
  "OBJECTIVES",
  "STRATEGIC_ALLOCATION",
  "TACTICAL_ALLOCATION_BANDS",
  "LIQUIDITY_REQUIREMENTS",
  "RISK_TOLERANCE",
  "PERMITTED_INSTRUMENTS",
  "PROHIBITED_INSTRUMENTS",
  "MANAGER_SELECTION_CRITERIA",
  "DUE_DILIGENCE_STANDARD",
  "REBALANCING_RULES",
  "BENCHMARKS",
  "REVIEW_CADENCE",
] as const;
export type IpsElement = (typeof IPS_ELEMENTS)[number];

export function assessInvestmentPolicyStatement(
  ips: Partial<Record<IpsElement, string | null>>,
): { complete: boolean; missing: IpsElement[]; reason: string } {
  const missing = IPS_ELEMENTS.filter((e) => !isPresent(ips[e] ?? null));
  return {
    complete: missing.length === 0,
    missing,
    reason:
      missing.length === 0
        ? `Investment Policy Statement complete: all ${IPS_ELEMENTS.length} elements ratified.`
        : `Investment Policy Statement incomplete: ${missing.join(", ")}. Strategic allocation cannot be assessed against an incomplete IPS.`,
  };
}

/* ------------------------------------------------------------------ */
/* Refusals                                                            */
/* ------------------------------------------------------------------ */

/** Capital records may never be written by an AI actor. */
export function assertCapitalWriteIsHuman(actorType: FamilyActorType, operation: string): void {
  assertHumanAuthority(actorType, operation);
}

/** Deterministic pool listing for reporting. */
export function poolDefinitionCompleteness(
  pools: readonly FamilyCapitalPool[],
): Array<{ pool: CapitalPool; complete: boolean; missing: CapitalPoolDefinitionField[] }> {
  return pools
    .map((p) => {
      const a = assessCapitalPool(p);
      return { pool: p.pool, complete: a.complete, missing: a.missing };
    })
    .sort((a, b) => a.pool.localeCompare(b.pool));
}

export { absentFields };
