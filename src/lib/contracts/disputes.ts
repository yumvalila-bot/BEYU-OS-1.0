/**
 * BEYU OS — §39 CONTRACT DISPUTES (pure engine).
 *
 * A dispute is a governed record that can PAUSE downstream execution: contract
 * lifecycle, obligation progression and on-chain deterministic execution all
 * consult this module's outcome before proceeding. The engine is deterministic
 * and conservative — a dispute never weakens a control, and settlement does not
 * retroactively erase evidence.
 */

import { ContractModelError, assertRef } from "./pure";
import { DISPUTE_STATES, DISPUTE_TYPES, type DisputeState, type DisputeType } from "./vocabulary";

export type DisputeSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const DISPUTE_EDGES: Record<DisputeState, readonly DisputeState[]> = {
  OPEN: ["ESCALATED", "IN_MEDIATION", "SETTLED", "WITHDRAWN", "CLOSED"],
  ESCALATED: ["IN_MEDIATION", "IN_ARBITRATION", "IN_LITIGATION", "SETTLED", "WITHDRAWN", "CLOSED"],
  IN_MEDIATION: ["SETTLED", "IN_ARBITRATION", "ESCALATED", "WITHDRAWN", "CLOSED"],
  IN_ARBITRATION: ["SETTLED", "IN_LITIGATION", "CLOSED", "WITHDRAWN"],
  IN_LITIGATION: ["SETTLED", "CLOSED"],
  SETTLED: ["CLOSED"],
  WITHDRAWN: ["CLOSED"],
  CLOSED: [],
};

export function evaluateDisputeTransition(from: DisputeState, to: DisputeState): true {
  if (!DISPUTE_STATES.includes(from) || !DISPUTE_STATES.includes(to)) {
    throw new ContractModelError("UNKNOWN_STATE", `Unknown dispute state ${from} → ${to}.`, { from, to });
  }
  if (!DISPUTE_EDGES[from].includes(to)) {
    throw new ContractModelError("INVALID_TRANSITION", `Dispute cannot move ${from} → ${to}.`, { from, to });
  }
  return true;
}

const PAUSE_STATES = new Set<DisputeState>(["OPEN", "ESCALATED", "IN_MEDIATION", "IN_ARBITRATION", "IN_LITIGATION"]);

/**
 * Whether the dispute pauses downstream execution.
 *
 * Pause-by-default: HIGH/CRITICAL disputes always pause; a MEDIUM dispute pauses
 * when it concerns performance or delivery; LOW disputes are recorded and
 * monitored without pausing. A dispute flagged `pausesExecution` always pauses
 * regardless of severity — an explicit human decision outranks an inference,
 * and inference can only ever be more conservative than the recorded flag.
 */
export function disputePausesExecution(input: {
  type: DisputeType;
  severity: DisputeSeverity;
  state: DisputeState;
  pausesExecutionFlag?: boolean | null;
}): { pausesExecution: boolean; reason: string } {
  if (!PAUSE_STATES.has(input.state)) {
    return { pausesExecution: false, reason: `Dispute is ${input.state}; no pause required.` };
  }
  if (input.pausesExecutionFlag === true) {
    return { pausesExecution: true, reason: "Recorded pause decision by the authorized reviewer." };
  }
  if (input.severity === "CRITICAL" || input.severity === "HIGH") {
    return { pausesExecution: true, reason: `HIGH/CRITICAL disputes pause downstream execution (§39).` };
  }
  if (input.severity === "MEDIUM" && (input.type === "PERFORMANCE_DISPUTE" || input.type === "DELIVERY_DISPUTE" || input.type === "BREACH")) {
    return { pausesExecution: true, reason: "Performance-affecting dispute pauses downstream execution (§39)." };
  }
  return { pausesExecution: false, reason: "Dispute recorded; execution continues with monitoring." };
}

/** Dispute intake must be specific: an unlabelled grievance is not a governed dispute. */
export function assertDisputeIntake(input: {
  type: DisputeType;
  severity: DisputeSeverity;
  summary: string;
  evidenceRefs: readonly string[];
  contractId?: string | null;
  obligationId?: string | null;
}): { type: DisputeType; severity: DisputeSeverity; summary: string; evidenceRefs: string[] } {
  if (!(DISPUTE_TYPES as readonly string[]).includes(input.type)) {
    throw new ContractModelError("UNKNOWN_STATE", `Unknown dispute type ${input.type}.`);
  }
  const summary = assertRef(input.summary, "summary");
  if (input.evidenceRefs.length === 0) {
    throw new ContractModelError("EVIDENCE_REQUIRED", "A dispute requires at least one evidence reference (§51).", {
      type: input.type,
    });
  }
  const refs = input.evidenceRefs.map((r) => assertRef(r, "evidenceRef"));
  if (!input.contractId && !input.obligationId) {
    throw new ContractModelError(
      "RULE_VIOLATION",
      "A dispute must attach to a contract, an obligation, or both.",
    );
  }
  return { type: input.type, severity: input.severity, summary, evidenceRefs: refs };
}

/** Escalation deadlines: a dispute that sleeps is a control failure. */
export function disputeEscalation(input: {
  severity: DisputeSeverity;
  openedOn: string;
  asOfDate: string;
}): { reviewBy: string; escalateBy: string; overdue: boolean } {
  const lead = { LOW: 30, MEDIUM: 14, HIGH: 5, CRITICAL: 2 }[input.severity];
  const escalate = { LOW: 60, MEDIUM: 30, HIGH: 10, CRITICAL: 4 }[input.severity];
  const day = (base: string, n: number) => new Date(Date.parse(`${base}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const reviewBy = day(input.openedOn, lead);
  const escalateBy = day(input.openedOn, escalate);
  return {
    reviewBy,
    escalateBy,
    overdue: Date.parse(`${input.asOfDate}T00:00:00.000Z`) > Date.parse(`${escalateBy}T00:00:00.000Z`),
  };
}
