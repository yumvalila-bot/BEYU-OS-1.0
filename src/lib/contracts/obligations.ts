/**
 * BEYU OS — §18 CONTRACT OBLIGATION ENGINE (pure).
 *
 * Every material contract decomposes into obligations, and every obligation is
 * an accountable unit of work: an owner, a responsible party, a trigger, a
 * deadline, a deliverable, evidence, a dependency, a risk, a status, an
 * escalation clock and a verification step. This module computes that math
 * deterministically; the governed service binds it to identity, authority and
 * the audit ledger.
 *
 * Money-adjacent obligations (PAYMENT) are recorded as governed REFERENCES with
 * `authoritative_owner = FINANCE_OS`; nothing here posts, approves or moves money
 * (§44, §45). CAP_POSTING is never referenced by this module.
 */

import {
  ContractModelError,
  addDaysIso,
  assertAmount,
  assertIsoDate,
  assertRef,
  daysBetweenIso,
} from "./pure";
import {
  FINANCE_OS_AUTHORITATIVE_OWNER,
  OBLIGATION_KINDS,
  OBLIGATION_RESPONSIBLE_PARTY_ROLES,
  type ObligationKind,
  type ObligationResponsiblePartyRole,
  type ObligationSeverity,
  type ObligationState,
} from "./vocabulary";

export const OBLIGATION_ESCALATION_LEAD_DAYS: Record<ObligationSeverity, number> = {
  LOW: 14,
  MEDIUM: 10,
  HIGH: 5,
  CRITICAL: 2,
};

/** Post-delivery verification window before an obligation can be closed. */
export const OBLIGATION_VERIFICATION_WINDOW_DAYS = 30;

export type ObligationTiming = {
  dueDate: string;
  escalationDate: string;
  verificationDeadline: string;
  leadDays: number;
  basis: "EXPLICIT_DUE_DATE" | "TRIGGER_PLUS_OFFSET" | "CONTRACT_DATE_PLUS_OFFSET";
};

/** Deterministic deadline derivation from trigger/offset or an explicit date. */
export function computeObligationTiming(input: {
  triggerDate?: string | null;
  startFromContractDate?: string | null;
  deadlineOffsetDays?: number | null;
  explicitDueDate?: string | null;
  severity: ObligationSeverity;
}): ObligationTiming {
  const leadDays = OBLIGATION_ESCALATION_LEAD_DAYS[input.severity];
  let due: string;
  let basis: ObligationTiming["basis"];
  if (input.explicitDueDate) {
    due = assertIsoDate(input.explicitDueDate, "dueDate");
    basis = "EXPLICIT_DUE_DATE";
  } else {
    const base = input.triggerDate ?? input.startFromContractDate;
    if (!base) {
      throw new ContractModelError(
        "INVALID_DATE",
        "An obligation needs a trigger date, a contract date or an explicit due date.",
      );
    }
    basis = input.triggerDate ? "TRIGGER_PLUS_OFFSET" : "CONTRACT_DATE_PLUS_OFFSET";
    const offset = input.deadlineOffsetDays ?? 0;
    if (!Number.isInteger(offset) || Math.abs(offset) > 36_600) {
      throw new ContractModelError("OUT_OF_RANGE", "deadlineOffsetDays must be an integer within ±36,600.");
    }
    due = addDaysIso(assertIsoDate(base, "triggerDate"), offset);
  }
  return {
    dueDate: due,
    escalationDate: addDaysIso(due, -leadDays),
    verificationDeadline: addDaysIso(due, OBLIGATION_VERIFICATION_WINDOW_DAYS),
    leadDays,
    basis,
  };
}

const OBLIGATION_EDGES: Record<ObligationState, readonly ObligationState[]> = {
  PENDING: ["IN_PROGRESS", "DISPUTED", "WAIVED", "OVERDUE", "TERMINATED_WITH_CONTRACT"],
  IN_PROGRESS: ["DELIVERED", "DISPUTED", "OVERDUE", "WAIVED", "TERMINATED_WITH_CONTRACT"],
  DELIVERED: ["VERIFIED", "DISPUTED", "IN_PROGRESS", "TERMINATED_WITH_CONTRACT"],
  VERIFIED: ["CLOSED", "DISPUTED"],
  CLOSED: [],
  WAIVED: [],
  DISPUTED: ["IN_PROGRESS", "DELIVERED", "VERIFIED", "OVERDUE", "TERMINATED_WITH_CONTRACT"],
  OVERDUE: ["IN_PROGRESS", "DELIVERED", "DISPUTED", "WAIVED", "TERMINATED_WITH_CONTRACT"],
  TERMINATED_WITH_CONTRACT: [],
};

export function evaluateObligationTransition(from: ObligationState, to: ObligationState): true {
  if (!OBLIGATION_EDGES[from] || !OBLIGATION_EDGES[to]) {
    throw new ContractModelError("UNKNOWN_STATE", "Unknown obligation state.", { from, to });
  }
  if (!OBLIGATION_EDGES[from].includes(to)) {
    throw new ContractModelError("INVALID_TRANSITION", `Obligation cannot move ${from} → ${to}.`, { from, to });
  }
  return true;
}

/** Terminal obligation states accept no transition, including OVERDUE (§18). */
export function isTerminalObligation(state: ObligationState): boolean {
  return state === "CLOSED" || state === "WAIVED" || state === "TERMINATED_WITH_CONTRACT";
}

/** Overdue is DERIVED from dates and state, never asserted by a caller. */
export function isObligationOverdue(o: { state: ObligationState; dueDate: string; asOfDate: string }): boolean {
  if (isTerminalObligation(o.state) || o.state === "VERIFIED") return false;
  return daysBetweenIso(assertIsoDate(o.asOfDate, "asOfDate"), assertIsoDate(o.dueDate, "dueDate")) < 0;
}

/** Escalation due when the lead window has been reached and the item is open. */
export function isObligationEscalationDue(o: {
  state: ObligationState;
  escalationDate: string;
  asOfDate: string;
}): boolean {
  if (isTerminalObligation(o.state) || o.state === "VERIFIED" || o.state === "DISPUTED") return false;
  return daysBetweenIso(assertIsoDate(o.asOfDate, "asOfDate"), assertIsoDate(o.escalationDate, "escalationDate")) <= 0;
}

export type ObligationIntake = {
  kind: ObligationKind;
  responsiblePartyRole: ObligationResponsiblePartyRole;
  ownerRole: string;
  deliverable: string;
  severity: ObligationSeverity;
  dependencyObligationId?: string | null;
  amountMajor?: number | null;
  currency?: string | null;
  verificationRequired: boolean;
  evidenceRequired: boolean;
};

/** Write-time validation; a PAYMENT obligation is always a governed Finance reference. */
export function assertObligationIntake(input: ObligationIntake): {
  kind: ObligationKind;
  ownerRole: string;
  deliverable: string;
  amountMajor: number | null;
  authoritativeOwner: string | null;
} {
  if (!(OBLIGATION_KINDS as readonly string[]).includes(input.kind)) {
    throw new ContractModelError("UNKNOWN_TYPE", `Unknown obligation kind ${input.kind}.`);
  }
  if (!(OBLIGATION_RESPONSIBLE_PARTY_ROLES as readonly string[]).includes(input.responsiblePartyRole)) {
    throw new ContractModelError("UNKNOWN_TYPE", `Unknown responsible-party role ${input.responsiblePartyRole}.`);
  }
  const ownerRole = assertRef(input.ownerRole, "ownerRole");
  const deliverable = assertRef(input.deliverable, "deliverable");
  const amountMajor = input.amountMajor === null || input.amountMajor === undefined ? null : assertAmount(input.amountMajor, "amountMajor");
  if (input.kind === "PAYMENT" && amountMajor === null) {
    throw new ContractModelError(
      "RULE_VIOLATION",
      "A PAYMENT obligation must carry an amount so Finance OS can reconcile the reference.",
    );
  }
  return {
    kind: input.kind,
    ownerRole,
    deliverable,
    amountMajor,
    authoritativeOwner: amountMajor === null ? null : FINANCE_OS_AUTHORITATIVE_OWNER,
  };
}

/**
 * Dependency gate: an obligation blocked by an unmet dependency cannot be
 * delivered or verified, so downstream execution cannot race ahead of upstream
 * performance. Disputed dependencies block too — a dispute pauses (§39).
 */
export function obligationDependencyOpen(
  dependency: { state: ObligationState } | null | undefined,
): { satisfied: boolean; reason: string } {
  if (!dependency) return { satisfied: true, reason: "NO_DEPENDENCY" };
  if (dependency.state === "CLOSED" || dependency.state === "VERIFIED" || dependency.state === "WAIVED") {
    return { satisfied: true, reason: `DEPENDENCY_${dependency.state}` };
  }
  if (dependency.state === "TERMINATED_WITH_CONTRACT") {
    return { satisfied: false, reason: "DEPENDENCY_TERMINATED" };
  }
  return { satisfied: false, reason: `DEPENDENCY_${dependency.state}` };
}

/** Completion evidence rule: verification cannot be recorded without evidence. */
export function assertObligationVerificationEvidence(input: {
  verificationRequired: boolean;
  evidenceRefs: readonly string[];
}): { evidenceRefs: string[] } {
  if (!input.verificationRequired) return { evidenceRefs: [] };
  if (input.evidenceRefs.length === 0) {
    throw new ContractModelError(
      "EVIDENCE_REQUIRED",
      "This obligation requires completion evidence before verification (§18/§51).",
    );
  }
  return { evidenceRefs: input.evidenceRefs.map((r) => assertRef(r, "evidenceRef")) };
}
