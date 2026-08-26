/**
 * Phase 3A authority-slot (SoD) structure — behavior tests.
 * Proves the structural SoD invariants and the AI non-authority rule.
 * Pure; no database.
 */
import { describe, expect, it } from "vitest";
import {
  AUTHORITY_SLOTS,
  SEPARATION_OF_DUTIES_RULES,
  assertSeparationOfDuties,
  evaluateAuthoritySlots,
  isAuthoritySlot,
  type SlotAssignment,
} from "../../../src/lib/family/phase3/authorization-slots";
import { FamilyError } from "../../../src/lib/family/phase3/errors";

const human = (slot: SlotAssignment["slot"], userId: string): SlotAssignment => ({
  slot,
  userId,
  actorType: "HUMAN",
});

describe("authority slots", () => {
  it("defines the seven structural slots", () => {
    expect(AUTHORITY_SLOTS).toHaveLength(7);
    for (const slot of AUTHORITY_SLOTS) expect(isAuthoritySlot(slot)).toBe(true);
    expect(isAuthoritySlot("NOT_A_SLOT")).toBe(false);
  });

  it("defines the five structural SoD rules (values unratified: which roles fill slots)", () => {
    expect(SEPARATION_OF_DUTIES_RULES.map((r) => r.id)).toEqual([
      "PROPOSER_NEQ_VERIFIER",
      "VERIFIER_NEQ_DECIDER",
      "REQUESTER_NEQ_APPROVER",
      "DELEGATOR_NEQ_DELEGATE",
      "AI_NEQ_ANY_SLOT",
    ]);
  });

  it("passes a clean separation of duties", () => {
    const evaluation = evaluateAuthoritySlots([
      human("PROPOSER", "U1"),
      human("VERIFIER", "U2"),
      human("DECIDER", "U3"),
    ]);
    expect(evaluation.ok).toBe(true);
    expect(evaluation.violations).toEqual([]);
  });

  it("violates proposer ≠ verifier", () => {
    const evaluation = evaluateAuthoritySlots([human("PROPOSER", "U1"), human("VERIFIER", "U1")]);
    expect(evaluation.ok).toBe(false);
    expect(evaluation.violations.map((v) => v.ruleId)).toContain("PROPOSER_NEQ_VERIFIER");
  });

  it("violates verifier ≠ decider", () => {
    const evaluation = evaluateAuthoritySlots([human("VERIFIER", "U1"), human("DECIDER", "U1")]);
    expect(evaluation.violations.map((v) => v.ruleId)).toContain("VERIFIER_NEQ_DECIDER");
  });

  it("violates requester ≠ approver", () => {
    const evaluation = evaluateAuthoritySlots([human("REQUESTER", "U1"), human("APPROVER", "U1")]);
    expect(evaluation.violations.map((v) => v.ruleId)).toContain("REQUESTER_NEQ_APPROVER");
  });

  it("violates delegator ≠ delegate (FIR-011 structural rule)", () => {
    const evaluation = evaluateAuthoritySlots([human("DELEGATOR", "U1"), human("DELEGATE", "U1")]);
    expect(evaluation.violations.map((v) => v.ruleId)).toContain("DELEGATOR_NEQ_DELEGATE");
  });

  it("refuses an AI actor in ANY slot (FIR-017)", () => {
    for (const slot of AUTHORITY_SLOTS) {
      const evaluation = evaluateAuthoritySlots([{ slot, userId: "NOELIA", actorType: "AI" }]);
      expect(evaluation.ok, slot).toBe(false);
      expect(evaluation.violations.map((v) => v.ruleId)).toContain("AI_NEQ_ANY_SLOT");
    }
  });

  it("accumulates multiple violations precisely", () => {
    const evaluation = evaluateAuthoritySlots([
      human("PROPOSER", "U1"),
      human("VERIFIER", "U1"),
      human("REQUESTER", "U2"),
      human("APPROVER", "U2"),
    ]);
    const ids = evaluation.violations.map((v) => v.ruleId);
    expect(ids).toContain("PROPOSER_NEQ_VERIFIER");
    expect(ids).toContain("REQUESTER_NEQ_APPROVER");
    expect(ids).not.toContain("VERIFIER_NEQ_DECIDER");
  });

  it("assertSeparationOfDuties throws naming the violated rule", () => {
    expect(() => assertSeparationOfDuties([human("PROPOSER", "U1"), human("VERIFIER", "U1")])).toThrow(FamilyError);
    expect(() =>
      assertSeparationOfDuties([
        human("PROPOSER", "U1"),
        human("VERIFIER", "U2"),
        human("DECIDER", "U3"),
      ]),
    ).not.toThrow();
  });
});
