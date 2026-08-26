/**
 * BEYU OS — Family Institution Phase 3A typed contracts.
 *
 * Phase 3A technical architecture specification §20, §21, §26, §30, §31.
 * These are NON-FINANCIAL, reference-carrying structures with pure
 * validators. They select NO policy: every authority, effect, and threshold
 * remains a POLICY DECISION REQUIRED configuration point.
 *
 * Boundaries enforced structurally (ratified):
 *  - FIR-018: no financial state may ever appear in a family instruction
 *    (forbidden-key enforcement + write-once Finance reference).
 *  - FIR-017: advisory outputs are advisory only (human approval required,
 *    authority claims refused).
 *  - I-11: mutations are human-actor only (HumanActorRef).
 *
 * These types are inert until Phase 3C/3D authorizes wiring. Nothing outside
 * the Phase 3A test suites imports them.
 */

import { FamilyError, familyError, type FamilyErrorCode } from "./errors";

/* ------------------------------------------------------------------ */
/* Reference structures                                                */
/* ------------------------------------------------------------------ */

/** Reference to a canonical policy record (governance.policies). KDD-2. */
export interface FamilyPolicyRef {
  policyId: string;
  policyVersion: string;
}

/**
 * Reference to a canonical document as evidence (platform.documents).
 * KDD-3: evidence is document-bound; the checksum is the document's canonical
 * checksum, captured at binding time. No evidence authority is decided here.
 */
export interface FamilyEvidenceRef {
  documentId: string;
  documentChecksum: string;
}

/**
 * Reference to a canonical authority record. The reference CARRIES no
 * authority — authority is proven by the referenced record itself at the
 * decision gate (spec §26.4).
 */
export interface FamilyAuthorityRef {
  kind: "RESOLUTION" | "DELEGATION" | "INSTRUMENT_DOCUMENT";
  referenceId: string;
}

/**
 * The only actor shape a family mutation may name. AI and service actors are
 * structurally excluded from family writes (I-11, FIR-017).
 */
export interface HumanActorRef {
  actorType: "HUMAN";
  actorUserId: string;
}

/* ------------------------------------------------------------------ */
/* Contract check result                                               */
/* ------------------------------------------------------------------ */

export interface ContractViolation {
  code: FamilyErrorCode;
  field: string;
  reason: string;
}

export type ContractCheck<T> = { ok: true; value: T } | { ok: false; violations: ContractViolation[] };

function check<T>(value: T, violations: ContractViolation[]): ContractCheck<T> {
  if (violations.length === 0) return { ok: true, value };
  return { ok: false, violations };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/* ------------------------------------------------------------------ */
/* FIR-018: forbidden financial state (ratified boundary)              */
/* ------------------------------------------------------------------ */

/**
 * Keys that would make a family instruction a shadow financial record.
 * Ratified boundary FIR-018: Finance OS owns accounting, journal entries,
 * balances, treasury, allocations, waterfalls, payments, and financial
 * provenance. Presence of any key below is a boundary violation.
 */
export const FINANCIAL_STATE_FORBIDDEN_KEYS = [
  "balance",
  "balances",
  "accountNumber",
  "accountId",
  "posting",
  "postingRef",
  "journalRef",
  "journalId",
  "journalLineId",
  "treasuryRef",
  "treasuryPositionId",
  "waterfallRef",
  "waterfallRunId",
  "commitment",
  "receivable",
  "payable",
  "disbursement",
  "disbursementRef",
  "paymentRef",
  "portfolioRef",
  "position",
  "impairment",
  "accrual",
  "ledgerRef",
  "ledgerAccountId",
  "settlementRef",
] as const;

/** Additional keys forbidden specifically on loan instructions. */
export const LOAN_TERMS_FORBIDDEN_KEYS = [
  "interestRate",
  "interestOfRecord",
  "taxTreatment",
  "accountingTreatment",
  "collateral",
  "collateralRef",
  "creditLimit",
  "disbursementOfRecord",
  "repaymentScheduleOfRecord",
] as const;

function lowerKeys(input: object): Set<string> {
  return new Set(Object.keys(input).map((k) => k.toLowerCase()));
}

export function findForbiddenKeys(input: object, extra: readonly string[] = []): string[] {
  const keys = lowerKeys(input);
  const forbidden = [...FINANCIAL_STATE_FORBIDDEN_KEYS, ...extra].map((k) => k.toLowerCase());
  return Object.keys(input).filter((k) => forbidden.includes(k.toLowerCase()));
}

/** FIR-018 boundary enforcement: refuse any financial state in family records. */
export function assertNoFinancialState(input: object, label: string, extra: readonly string[] = []): void {
  const found = findForbiddenKeys(input, extra);
  if (found.length > 0) {
    throw new FamilyError(
      "FINANCE_BOUNDARY_VIOLATION",
      `${label} must not carry financial state (FIR-018). Forbidden keys: ${found.join(", ")}. ` +
        "Financial truth belongs to Finance OS.",
      ["FIR-018"],
      { forbiddenKeys: found },
    );
  }
}

/**
 * F-4: the Finance request reference is write-once. null → value is the single
 * submission transition; value → a different value is a boundary violation.
 */
export function assertFinanceReferenceImmutable(original: string | null, updated: string | null): void {
  if (original !== null && updated !== original) {
    throw new FamilyError(
      "FINANCE_BOUNDARY_VIOLATION",
      "The Finance reference is write-once (F-4). Corrections re-submit a new instruction; they never mutate the reference.",
      ["FIR-018"],
      { original, updated },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Capital instruction (non-financial)                                 */
/* ------------------------------------------------------------------ */

export const CAPITAL_INSTRUCTION_FAMILY_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "REJECTED_BY_FINANCE",
  "WITHDRAWN",
  "CLOSED_BY_REFERENCE",
] as const;
export type CapitalInstructionFamilyStatus = (typeof CAPITAL_INSTRUCTION_FAMILY_STATUSES)[number];

export interface FamilyCapitalInstruction {
  id: string;
  tenantId: string;
  /** KDD-1: null = tenant-scope default; set only when FIR-001 ratifies an institution record. */
  institutionScopeRef: string | null;
  /** Non-financial purpose statement. */
  purpose: string;
  requesterPartyId: string;
  targetLegalEntityId: string;
  policyRefs: readonly FamilyPolicyRef[];
  resolutionRefs: readonly FamilyAuthorityRef[];
  evidenceRefs: readonly FamilyEvidenceRef[];
  actor: HumanActorRef;
  /** Reference only; governing-law applicability remains POLICY DECISION REQUIRED (FIR-014). */
  jurisdictionRef: string | null;
  /** Deterministic assessment provenance (engine version + input checksum). */
  assessment: { engineVersion: string; inputChecksum: string; result: string } | null;
  /**
   * Submission payload echo only (F-6). The amount of record is Finance's;
   * this is the request payload for audit, classified HIGHLY_RESTRICTED.
   */
  submittedPayload: { amount: string; currency: string } | null;
  /** Write-once after submission (F-4). */
  financeRequestId: string | null;
  /** Non-financial lifecycle; states mirror Finance by reference (F-1). */
  familyStatus: CapitalInstructionFamilyStatus;
  createdAt: string;
}

export function validateCapitalInstruction(input: unknown): ContractCheck<FamilyCapitalInstruction> {
  const violations: ContractViolation[] = [];
  if (!isPlainObject(input)) return check(null as never, [{ code: "AUTHORITY_UNPROVEN", field: "instruction", reason: "Not an object." }]);

  const forbidden = findForbiddenKeys(input);
  if (forbidden.length > 0) {
    violations.push({
      code: "FINANCE_BOUNDARY_VIOLATION",
      field: forbidden.join(","),
      reason: "Financial state is forbidden in family capital instructions (FIR-018).",
    });
  }

  const d = input as Record<string, unknown>;
  for (const field of ["id", "tenantId", "purpose", "requesterPartyId", "targetLegalEntityId", "createdAt"] as const) {
    if (!nonEmptyString(d[field])) {
      violations.push({ code: "AUTHORITY_UNPROVEN", field, reason: "Required reference is missing." });
    }
  }
  if (d.institutionScopeRef !== null && !nonEmptyString(d.institutionScopeRef)) {
    violations.push({ code: "AUTHORITY_UNPROVEN", field: "institutionScopeRef", reason: "Must be null or a non-empty reference." });
  }
  if (d.jurisdictionRef !== null && !nonEmptyString(d.jurisdictionRef)) {
    violations.push({ code: "AUTHORITY_UNPROVEN", field: "jurisdictionRef", reason: "Must be null or a non-empty reference." });
  }

  if (!Array.isArray(d.policyRefs) || d.policyRefs.length === 0) {
    violations.push({ code: "AUTHORITY_UNPROVEN", field: "policyRefs", reason: "At least one ratified policy reference is required." });
  } else {
    d.policyRefs.forEach((p, i) => {
      if (!isPlainObject(p) || !nonEmptyString(p.policyId) || !nonEmptyString(p.policyVersion)) {
        violations.push({ code: "AUTHORITY_UNPROVEN", field: `policyRefs[${i}]`, reason: "policyId + policyVersion required." });
      }
    });
  }
  if (!Array.isArray(d.resolutionRefs) || d.resolutionRefs.length === 0) {
    violations.push({ code: "AUTHORITY_UNPROVEN", field: "resolutionRefs", reason: "At least one canonical resolution reference is required." });
  } else {
    const kinds = ["RESOLUTION", "DELEGATION", "INSTRUMENT_DOCUMENT"];
    d.resolutionRefs.forEach((r, i) => {
      if (!isPlainObject(r) || !kinds.includes(String(r.kind)) || !nonEmptyString(r.referenceId)) {
        violations.push({ code: "AUTHORITY_UNPROVEN", field: `resolutionRefs[${i}]`, reason: "kind + referenceId required." });
      }
    });
  }
  if (!Array.isArray(d.evidenceRefs)) {
    violations.push({ code: "EVIDENCE_INSUFFICIENT", field: "evidenceRefs", reason: "Must be an array (may be empty)." });
  } else {
    d.evidenceRefs.forEach((e, i) => {
      if (!isPlainObject(e) || !nonEmptyString(e.documentId) || !nonEmptyString(e.documentChecksum)) {
        violations.push({ code: "EVIDENCE_INSUFFICIENT", field: `evidenceRefs[${i}]`, reason: "documentId + documentChecksum required." });
      }
    });
  }

  const actor = d.actor;
  if (!isPlainObject(actor) || actor.actorType !== "HUMAN" || !nonEmptyString(actor.actorUserId)) {
    violations.push({ code: "HUMAN_ACTOR_REQUIRED", field: "actor", reason: "Capital instructions are human-actor only." });
  }

  if (d.assessment !== null) {
    const a = d.assessment as Record<string, unknown>;
    if (!isPlainObject(a) || !nonEmptyString(a.engineVersion) || !nonEmptyString(a.inputChecksum) || !nonEmptyString(a.result)) {
      violations.push({ code: "AUTHORITY_UNPROVEN", field: "assessment", reason: "engineVersion + inputChecksum + result required." });
    }
  }
  if (d.submittedPayload !== null) {
    const sp = d.submittedPayload as Record<string, unknown>;
    if (!isPlainObject(sp) || !nonEmptyString(sp.amount) || !nonEmptyString(sp.currency)) {
      violations.push({ code: "AUTHORITY_UNPROVEN", field: "submittedPayload", reason: "amount + currency required when present (payload echo only)." });
    }
  }
  if (d.financeRequestId !== null && !nonEmptyString(d.financeRequestId)) {
    violations.push({ code: "AUTHORITY_UNPROVEN", field: "financeRequestId", reason: "Must be null or a non-empty Finance reference." });
  }
  if (!nonEmptyString(d.familyStatus) || !(CAPITAL_INSTRUCTION_FAMILY_STATUSES as readonly string[]).includes(d.familyStatus)) {
    violations.push({ code: "AUTHORITY_UNPROVEN", field: "familyStatus", reason: `Must be one of: ${CAPITAL_INSTRUCTION_FAMILY_STATUSES.join(", ")}.` });
  }

  return check(input as unknown as FamilyCapitalInstruction, violations);
}

/* ------------------------------------------------------------------ */
/* Loan instruction (non-financial)                                    */
/* ------------------------------------------------------------------ */

export const LOAN_INSTRUCTION_FAMILY_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "REJECTED",
  "WITHDRAWN",
  "CLOSED_BY_REFERENCE",
] as const;
export type LoanInstructionFamilyStatus = (typeof LOAN_INSTRUCTION_FAMILY_STATUSES)[number];

export interface FamilyLoanInstruction {
  id: string;
  tenantId: string;
  /** KDD-1: null = tenant-scope default. */
  institutionScopeRef: string | null;
  purpose: string;
  borrowerPartyId: string;
  /** Legal attribution only; lender authority remains POLICY DECISION REQUIRED (FIR-013). */
  lenderLegalEntityId: string;
  /** Terms must cite governing documents; no terms are invented here. */
  termsSourceDocIds: readonly string[];
  approvalRefs: readonly FamilyAuthorityRef[];
  policyRefs: readonly FamilyPolicyRef[];
  evidenceRefs: readonly FamilyEvidenceRef[];
  actor: HumanActorRef;
  jurisdictionRef: string | null;
  /** Write-once references (F-4). */
  financeRef: string | null;
  legalRef: string | null;
  familyStatus: LoanInstructionFamilyStatus;
  createdAt: string;
}

export function validateLoanInstruction(input: unknown): ContractCheck<FamilyLoanInstruction> {
  const violations: ContractViolation[] = [];
  if (!isPlainObject(input)) {
    return check(null as never, [{ code: "AUTHORITY_UNPROVEN", field: "instruction", reason: "Not an object." }]);
  }

  const forbidden = findForbiddenKeys(input, LOAN_TERMS_FORBIDDEN_KEYS);
  if (forbidden.length > 0) {
    violations.push({
      code: "FINANCE_BOUNDARY_VIOLATION",
      field: forbidden.join(","),
      reason: "Financial/loan-terms state is forbidden in family loan instructions (FIR-013/FIR-018).",
    });
  }

  const d = input as Record<string, unknown>;
  for (const field of ["id", "tenantId", "purpose", "borrowerPartyId", "lenderLegalEntityId", "createdAt"] as const) {
    if (!nonEmptyString(d[field])) {
      violations.push({ code: "AUTHORITY_UNPROVEN", field, reason: "Required reference is missing." });
    }
  }
  if (d.institutionScopeRef !== null && !nonEmptyString(d.institutionScopeRef)) {
    violations.push({ code: "AUTHORITY_UNPROVEN", field: "institutionScopeRef", reason: "Must be null or a non-empty reference." });
  }
  if (d.jurisdictionRef !== null && !nonEmptyString(d.jurisdictionRef)) {
    violations.push({ code: "AUTHORITY_UNPROVEN", field: "jurisdictionRef", reason: "Must be null or a non-empty reference." });
  }
  if (!Array.isArray(d.termsSourceDocIds) || d.termsSourceDocIds.length === 0 || d.termsSourceDocIds.some((x) => !nonEmptyString(x))) {
    violations.push({ code: "EVIDENCE_INSUFFICIENT", field: "termsSourceDocIds", reason: "Terms must cite at least one governing document; none may be invented." });
  }
  for (const field of ["approvalRefs", "policyRefs"] as const) {
    if (!Array.isArray(d[field]) || d[field].length === 0) {
      violations.push({ code: "AUTHORITY_UNPROVEN", field, reason: "At least one reference is required." });
    }
  }
  if (!Array.isArray(d.evidenceRefs)) {
    violations.push({ code: "EVIDENCE_INSUFFICIENT", field: "evidenceRefs", reason: "Must be an array (may be empty)." });
  }
  const actor = d.actor;
  if (!isPlainObject(actor) || actor.actorType !== "HUMAN" || !nonEmptyString(actor.actorUserId)) {
    violations.push({ code: "HUMAN_ACTOR_REQUIRED", field: "actor", reason: "Loan instructions are human-actor only." });
  }
  for (const field of ["financeRef", "legalRef"] as const) {
    if (d[field] !== null && !nonEmptyString(d[field])) {
      violations.push({ code: "AUTHORITY_UNPROVEN", field, reason: "Must be null or a non-empty reference." });
    }
  }
  if (!nonEmptyString(d.familyStatus) || !(LOAN_INSTRUCTION_FAMILY_STATUSES as readonly string[]).includes(d.familyStatus)) {
    violations.push({ code: "AUTHORITY_UNPROVEN", field: "familyStatus", reason: `Must be one of: ${LOAN_INSTRUCTION_FAMILY_STATUSES.join(", ")}.` });
  }

  return check(input as unknown as FamilyLoanInstruction, violations);
}

/* ------------------------------------------------------------------ */
/* Finance hand-off submission (contract only — no execution)          */
/* ------------------------------------------------------------------ */

export interface FinanceHandoffSubmission {
  instructionId: string;
  idempotencyKey: string;
  destination: "FINANCE" | "FINANCE_LEGAL";
  submittedBy: HumanActorRef;
  submittedAt: string;
}

export function validateSubmission(input: unknown): ContractCheck<FinanceHandoffSubmission> {
  const violations: ContractViolation[] = [];
  if (!isPlainObject(input)) {
    return check(null as never, [{ code: "AUTHORITY_UNPROVEN", field: "submission", reason: "Not an object." }]);
  }
  const d = input as Record<string, unknown>;
  for (const field of ["instructionId", "idempotencyKey", "submittedAt"] as const) {
    if (!nonEmptyString(d[field])) {
      violations.push({ code: "AUTHORITY_UNPROVEN", field, reason: "Required." });
    }
  }
  if (d.destination !== "FINANCE" && d.destination !== "FINANCE_LEGAL") {
    violations.push({ code: "AUTHORITY_UNPROVEN", field: "destination", reason: "Must be FINANCE or FINANCE_LEGAL." });
  }
  const actor = d.submittedBy;
  if (!isPlainObject(actor) || actor.actorType !== "HUMAN" || !nonEmptyString(actor.actorUserId)) {
    violations.push({ code: "HUMAN_ACTOR_REQUIRED", field: "submittedBy", reason: "Hand-off submission is human-actor only." });
  }
  return check(input as unknown as FinanceHandoffSubmission, violations);
}

/* ------------------------------------------------------------------ */
/* Noelia/HIVE advisory contract (FIR-017 ratified boundary)           */
/* ------------------------------------------------------------------ */

export const ADVISORY_EPISTEMIC_LABELS = [
  "RECOMMENDATION",
  "EXPLANATION",
  "RISK_DETECTION",
  "ANOMALY_DETECTION",
  "SIMULATION_SUMMARY",
  "DRAFT",
] as const;
export type AdvisoryEpistemicLabel = (typeof ADVISORY_EPISTEMIC_LABELS)[number];

/**
 * The only shape an AI output may take in a family workflow: labeled,
 * attributable, and always requiring human approval. FIR-017.
 */
export interface AdvisoryOutput {
  epistemicLabel: AdvisoryEpistemicLabel;
  content: unknown;
  /** Literal true. A false value is a boundary violation by construction. */
  requiresHumanApproval: true;
  /** ai_decisions.id when recorded; null for in-memory advisory. */
  aiDecisionRef: string | null;
}

const AUTHORITY_CLAIM_FORBIDDEN_KEYS = [
  "authorityClaim",
  "isAuthoritative",
  "selfApproval",
  "autoApprove",
  "constitutionalAuthority",
  "trusteeAuthority",
  "finalAuthority",
] as const;

/** FIR-017 boundary enforcement: refuse any authority claim in AI output. */
export function assertNoAuthorityClaim(input: object): void {
  const keys = lowerKeys(input);
  const found = AUTHORITY_CLAIM_FORBIDDEN_KEYS.filter((k) => keys.has(k.toLowerCase()));
  if (found.length > 0) {
    throw new FamilyError(
      "AI_AUTHORITY_DENIED",
      `AI output must not carry an authority claim (FIR-017). Forbidden keys: ${found.join(", ")}.`,
      ["FIR-017"],
      { forbiddenKeys: found },
    );
  }
}

export function validateAdvisoryOutput(input: unknown): ContractCheck<AdvisoryOutput> {
  const violations: ContractViolation[] = [];
  if (!isPlainObject(input)) {
    return check(null as never, [{ code: "AI_AUTHORITY_DENIED", field: "advisory", reason: "Not an object." }]);
  }
  assertNoAuthorityClaim(input);
  const d = input as Record<string, unknown>;
  if (!nonEmptyString(d.epistemicLabel) || !(ADVISORY_EPISTEMIC_LABELS as readonly string[]).includes(d.epistemicLabel)) {
    violations.push({ code: "AI_AUTHORITY_DENIED", field: "epistemicLabel", reason: `Must be one of: ${ADVISORY_EPISTEMIC_LABELS.join(", ")}.` });
  }
  if (d.requiresHumanApproval !== true) {
    violations.push({ code: "AI_AUTHORITY_DENIED", field: "requiresHumanApproval", reason: "Advisory output ALWAYS requires human approval (FIR-017)." });
  }
  if (d.aiDecisionRef !== null && !nonEmptyString(d.aiDecisionRef)) {
    violations.push({ code: "AI_AUTHORITY_DENIED", field: "aiDecisionRef", reason: "Must be null or a non-empty ai_decisions reference." });
  }
  if (!("content" in d)) {
    violations.push({ code: "AI_AUTHORITY_DENIED", field: "content", reason: "Required." });
  }
  return check(input as unknown as AdvisoryOutput, violations);
}

/** Convenience: throw a generic family error (kept for adapter symmetry). */
export function instructionError(code: FamilyErrorCode, field: string, reason: string, firRefs: readonly string[] = []): FamilyError {
  return familyError(code, `${field}: ${reason}`, firRefs, { field });
}
