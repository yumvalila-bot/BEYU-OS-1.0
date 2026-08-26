/**
 * BEYU OS — Family Institution Phase 3A authority-slot (separation of duties)
 * structure.
 *
 * Phase 3A technical architecture specification §26.3. The SoD RULE PAIRS are
 * structural invariants of the architecture (proposer ≠ verifier, verifier ≠
 * decider, requester ≠ approver, delegator ≠ delegate, AI in no slot). WHICH
 * ROLES fill which slots is POLICY DECISION REQUIRED (FIR-023) and is NOT
 * decided here: this module validates an assignment, it never produces one.
 */

import { FamilyError } from "./errors";

export type AuthoritySlot =
  | "PROPOSER"
  | "VERIFIER"
  | "DECIDER"
  | "REQUESTER"
  | "APPROVER"
  | "DELEGATOR"
  | "DELEGATE";

export const AUTHORITY_SLOTS: readonly AuthoritySlot[] = [
  "PROPOSER",
  "VERIFIER",
  "DECIDER",
  "REQUESTER",
  "APPROVER",
  "DELEGATOR",
  "DELEGATE",
] as const;

export interface SlotAssignment {
  slot: AuthoritySlot;
  userId: string;
  actorType: "HUMAN" | "SERVICE" | "AI";
}

export type SoDRuleId =
  | "PROPOSER_NEQ_VERIFIER"
  | "VERIFIER_NEQ_DECIDER"
  | "REQUESTER_NEQ_APPROVER"
  | "DELEGATOR_NEQ_DELEGATE"
  | "AI_NEQ_ANY_SLOT";

export interface SoDRule {
  id: SoDRuleId;
  /** For the AI rule, `a` is unused; the rule applies to every slot. */
  a: AuthoritySlot;
  b: AuthoritySlot | null;
  description: string;
}

export const SEPARATION_OF_DUTIES_RULES: readonly SoDRule[] = [
  {
    id: "PROPOSER_NEQ_VERIFIER",
    a: "PROPOSER",
    b: "VERIFIER",
    description: "The proposer of a record or relationship is not its verifier.",
  },
  {
    id: "VERIFIER_NEQ_DECIDER",
    a: "VERIFIER",
    b: "DECIDER",
    description: "The verifier is not the deciding/approving authority.",
  },
  {
    id: "REQUESTER_NEQ_APPROVER",
    a: "REQUESTER",
    b: "APPROVER",
    description: "The instruction requester is not its approver.",
  },
  {
    id: "DELEGATOR_NEQ_DELEGATE",
    a: "DELEGATOR",
    b: "DELEGATE",
    description: "The delegator is not the delegate (canonical delegation also rejects self-delegation).",
  },
  {
    id: "AI_NEQ_ANY_SLOT",
    a: "PROPOSER",
    b: null,
    description: "No AI actor may fill any authority slot; Noelia is advisory only (FIR-017).",
  },
] as const;

export interface SlotViolation {
  ruleId: SoDRuleId;
  description: string;
  actorA?: SlotAssignment;
  actorB?: SlotAssignment;
}

export interface SlotEvaluation {
  ok: boolean;
  violations: readonly SlotViolation[];
}

/**
 * Pure SoD evaluation over a proposed slot assignment for ONE act. A
 * violation means the act cannot proceed (fail closed); nothing is rewritten
 * or defaulted.
 */
export function evaluateAuthoritySlots(assignments: readonly SlotAssignment[]): SlotEvaluation {
  const violations: SlotViolation[] = [];
  const bySlot = new Map<AuthoritySlot, SlotAssignment>();
  for (const assignment of assignments) {
    if (assignment.actorType === "AI") {
      violations.push({
        ruleId: "AI_NEQ_ANY_SLOT",
        description: "AI actors may not fill authority slots; Noelia is advisory only (FIR-017).",
        actorA: assignment,
      });
    }
    bySlot.set(assignment.slot, assignment);
  }
  for (const rule of SEPARATION_OF_DUTIES_RULES) {
    if (rule.b === null) continue;
    const a = bySlot.get(rule.a);
    const b = bySlot.get(rule.b);
    if (a && b && a.userId === b.userId) {
      violations.push({ ruleId: rule.id, description: rule.description, actorA: a, actorB: b });
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Asserting form: throws AUTHORITY_UNPROVEN naming the violated rule(s). */
export function assertSeparationOfDuties(assignments: readonly SlotAssignment[]): void {
  const evaluation = evaluateAuthoritySlots(assignments);
  if (!evaluation.ok) {
    const rules = [...new Set(evaluation.violations.map((v) => v.ruleId))].join(", ");
    throw new FamilyError(
      "AUTHORITY_UNPROVEN",
      `Separation-of-duties violation: ${rules}. The act cannot proceed.`,
      [],
      { violations: evaluation.violations },
    );
  }
}

export function isAuthoritySlot(value: string): value is AuthoritySlot {
  return (AUTHORITY_SLOTS as readonly string[]).includes(value);
}
