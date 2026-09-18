/**
 * BEYU OS — P4 Release Approvals Tests (DB-free, canonical)
 *
 * Proves the four-eyes approval matrix:
 *  - PROMOTED/SWITCHED/CONTRACTED require approval; pipeline states do not
 *  - self-approval is structurally rejected
 *  - expired approvals stop satisfying transitions
 *  - a later REVOKED from the same approver supersedes an earlier APPROVED
 *  - fail-closed defaults: missing approvals deny with actionable reasons
 */

import { describe, expect, it } from "vitest";
import {
  APPROVAL_REQUIRED_STATES,
  evaluateApproval,
  requiresApproval,
  requiredApprovalScope,
  validateApprovalInput,
  type ReleaseApprovalRecord,
} from "@/lib/release/approvals";
import type { ReleaseState } from "@/lib/release/types";

function approval(overrides: Partial<ReleaseApprovalRecord> = {}): ReleaseApprovalRecord {
  return {
    id: "APR_test_1",
    releaseId: "REL_test",
    environment: "production",
    scope: "PROMOTE",
    decision: "APPROVED",
    approverId: "USR_approver",
    approverType: "HUMAN",
    justification: "Release evidence reviewed; promotion approved",
    evidence: null,
    expiresAt: null,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  };
}

const BASE = {
  nextState: "PROMOTED" as ReleaseState,
  releaseId: "REL_test",
  environment: "production",
  actorId: "USR_actor",
};

describe("P4 approval requirement matrix", () => {
  it("PROMOTED, SWITCHED require PROMOTE; CONTRACTED requires CONTRACT", () => {
    expect(requiredApprovalScope("PROMOTED")).toBe("PROMOTE");
    expect(requiredApprovalScope("SWITCHED")).toBe("PROMOTE");
    expect(requiredApprovalScope("CONTRACTED")).toBe("CONTRACT");
    expect(APPROVAL_REQUIRED_STATES).toEqual({
      PROMOTED: "PROMOTE",
      SWITCHED: "PROMOTE",
      CONTRACTED: "CONTRACT",
    });
  });

  it("pipeline states (DEPLOYED, PVG_VERIFIED, CANARY…) require no approval", () => {
    for (const s of ["DESIGNED", "BUILT", "DEPLOYED", "PVG_VERIFIED", "CANARY", "RETIRED", "VERIFIED"] as ReleaseState[]) {
      expect(requiresApproval(s)).toBe(false);
      expect(requiredApprovalScope(s)).toBeNull();
    }
  });

  it("evaluation with no required scope is satisfied", () => {
    const r = evaluateApproval({ ...BASE, nextState: "DEPLOYED", approvals: [] });
    expect(r.satisfied).toBe(true);
  });
});

describe("P4 four-eyes evaluation", () => {
  it("denies when no approval exists (fail-closed, actionable)", () => {
    const r = evaluateApproval({ ...BASE, approvals: [] });
    expect(r.satisfied).toBe(false);
    if (!r.satisfied) {
      expect(r.reason).toBe("NO_ACTIVE_APPROVAL");
      expect(r.requiredScope).toBe("PROMOTE");
    }
  });

  it("satisfies when a different principal approved", () => {
    const r = evaluateApproval({ ...BASE, approvals: [approval()] });
    expect(r.satisfied).toBe(true);
    if (r.satisfied) expect(r.approvalId).toBe("APR_test_1");
  });

  it("rejects self-approval even when an APPROVED record exists", () => {
    const r = evaluateApproval({
      ...BASE,
      approvals: [approval({ approverId: "USR_actor" })],
    });
    expect(r.satisfied).toBe(false);
    if (!r.satisfied) expect(r.reason).toBe("SELF_APPROVAL_NOT_PERMITTED");
  });

  it("expired approvals no longer satisfy (unparseable bound fails closed too)", () => {
    const expired = evaluateApproval({
      ...BASE,
      approvals: [approval({ expiresAt: new Date(Date.now() - 1000).toISOString() })],
    });
    expect(expired.satisfied).toBe(false);

    const garbage = evaluateApproval({
      ...BASE,
      approvals: [approval({ expiresAt: "not-a-date" })],
    });
    expect(garbage.satisfied).toBe(false);
  });

  it("a later REVOKED by the same approver supersedes an earlier APPROVED", () => {
    const r = evaluateApproval({
      ...BASE,
      approvals: [
        approval(),
        approval({
          id: "APR_test_2",
          decision: "REVOKED",
          justification: "Withdrawn: PVG regression discovered",
          createdAt: new Date().toISOString(),
        }),
      ],
    });
    expect(r.satisfied).toBe(false);
  });

  it("REJECTED records never satisfy", () => {
    const r = evaluateApproval({ ...BASE, approvals: [approval({ decision: "REJECTED" })] });
    expect(r.satisfied).toBe(false);
  });

  it("approvals are scope-matched: a DEPLOY approval does not satisfy PROMOTE", () => {
    const r = evaluateApproval({
      ...BASE,
      approvals: [approval({ scope: "DEPLOY" })],
    });
    expect(r.satisfied).toBe(false);
    if (!r.satisfied) expect(r.reason).toBe("NO_ACTIVE_APPROVAL");
  });

  it("approvals are release-matched: another release's approval does not carry over", () => {
    const r = evaluateApproval({
      ...BASE,
      approvals: [approval({ releaseId: "REL_other" })],
    });
    expect(r.satisfied).toBe(false);
  });
});

describe("P4 approval record validation", () => {
  it("requires a justification for every decision", () => {
    const v = validateApprovalInput({
      releaseId: "REL_test",
      environment: "production",
      scope: "PROMOTE",
      decision: "APPROVED",
      approverId: "USR_approver",
      justification: "   ",
    });
    expect(v.valid).toBe(false);
    expect(v.reason).toContain("justification");
  });

  it("refuses approvals born already expired", () => {
    const v = validateApprovalInput({
      releaseId: "REL_test",
      environment: "production",
      scope: "PROMOTE",
      decision: "APPROVED",
      approverId: "USR_approver",
      justification: "ok",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(v.valid).toBe(false);
    expect(v.reason).toContain("future");
  });

  it("refuses unknown scopes and decisions", () => {
    const bad = validateApprovalInput({
      releaseId: "REL_test",
      environment: "production",
      scope: "EVERYTHING" as never,
      decision: "APPROVED",
      approverId: "USR_approver",
      justification: "ok",
    });
    expect(bad.valid).toBe(false);
  });
});
