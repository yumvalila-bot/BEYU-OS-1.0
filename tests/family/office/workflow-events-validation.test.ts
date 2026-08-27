/**
 * Family Office — workflow, events, and validation engine tests.
 *
 * Requirements covered: R28 (10-step lifecycle, one step forward,
 * fail-closed halts, halt cleared only by a governed act with the gate
 * RE-RUN), R29 (execution idempotency + reference), R30 (events are
 * evidence, never authority), R31 (deterministic validation report).
 */

import { describe, expect, it } from "vitest";
import { advanceWorkflow, createWorkflow, retryHaltedStep, WORKFLOW_STEPS, type AdvanceRequest, type OfficeWorkflowState } from "../../../src/lib/family/office/workflow";
import { buildOfficeEvent, assertEventCannotGrantAuthority, OFFICE_EVENT_TYPES } from "../../../src/lib/family/office/events";
import { validateOfficeSubmission, validateOfficeRecord, type OfficeRecordInput } from "../../../src/lib/family/office/validation";
import { buildPolicyRegistry } from "../../../src/lib/family/office/policy";
import { buildRatificationRegistry, registerRatification } from "../../../src/lib/family/office/ratification";
import { D, TENANT, TENANT_SCOPE, aiAuthority, humanAuthority, policyDef, policyVersion, ratificationRecord } from "./fixtures";

const DEF = policyDef("capital.approval", "FAMILY_CAPITAL", { delegable: "BOOLEAN" });

function resolvedRegistry() {
  const rec = ratificationRecord("RES-CAP", "capital.approval", 1, [{ key: "delegable", kind: "BOOLEAN", value: true }]);
  return registerRatification(buildRatificationRegistry([DEF], [], []), rec, TENANT_SCOPE, D.asOf).registry;
}

function emptyRegistry() {
  return buildRatificationRegistry([DEF], [], []);
}

function newWorkflow(): OfficeWorkflowState {
  return createWorkflow({
    workflowId: "WF-1",
    domain: "FAMILY_CAPITAL",
    objectType: "CapitalInstruction",
    objectId: "CI-1",
    tenantId: TENANT,
    createdAt: "2026-03-01",
    actorUserId: "user-1",
  });
}

function baseReq(overrides: Partial<AdvanceRequest> = {}): AdvanceRequest {
  return {
    toStep: "SUBMITTED",
    asOf: D.asOf,
    actor: { actorType: "HUMAN", actorUserId: "user-1" },
    registry: resolvedRegistry().policies,
    policyRequirement: { required: [{ policyKey: "capital.approval", field: "delegable" }], requiresAuthority: true },
    authorityContext: humanAuthority("user-1", "RES-APPROVE"),
    ...overrides,
  };
}

/** Drive a workflow through steps; returns the final state + last outcome. */
function drive(state: OfficeWorkflowState, steps: { toStep: AdvanceRequest["toStep"]; req?: Partial<AdvanceRequest> }[]) {
  let s = state;
  let last: string = "created";
  for (const step of steps) {
    const result = advanceWorkflow(s, baseReq({ toStep: step.toStep, ...step.req }));
    s = result.state;
    last = result.outcome;
    if (result.outcome === "REFUSED" || result.outcome === "HALTED") break;
  }
  return { state: s, last };
}

describe("R28 — the 10-step lifecycle, one step forward, fail-closed", () => {
  it("exposes exactly the ten canonical steps in order", () => {
    expect(WORKFLOW_STEPS).toEqual([
      "DRAFT",
      "SUBMITTED",
      "VALIDATING",
      "POLICY_CHECK",
      "AUTHORITY_CHECK",
      "APPROVAL_REQUIRED",
      "APPROVED",
      "EXECUTION_READY",
      "EXECUTED",
      "CLOSED",
    ]);
  });

  it("happy path: DRAFT → CLOSED with every gate satisfied", () => {
    let state = newWorkflow();
    expect(state.currentStep).toBe("DRAFT");
    const steps = ["SUBMITTED", "VALIDATING", "POLICY_CHECK", "AUTHORITY_CHECK", "APPROVAL_REQUIRED", "APPROVED", "EXECUTION_READY"] as const;
    for (const toStep of steps) {
      const req = baseReq({ toStep });
      const result = toStep === "APPROVED" ? advanceWorkflow(state, { ...req, approvalRef: "APR-1" }) : advanceWorkflow(state, req);
      expect(result.outcome).toBe("ADVANCED");
      state = result.state;
    }
    expect(state.currentStep).toBe("EXECUTION_READY");
    const executed = advanceWorkflow(state, baseReq({ toStep: "EXECUTED", idempotencyKey: "IDEM-1", executionReference: "FIN-EXEC-1" }));
    expect(executed.outcome).toBe("ADVANCED");
    expect(executed.state.currentStep).toBe("EXECUTED");
    const closed = advanceWorkflow(executed.state, baseReq({ toStep: "CLOSED" }));
    expect(closed.outcome).toBe("ADVANCED");
    expect(closed.state.currentStep).toBe("CLOSED");
  });

  it("refuses backward movement and step skipping", () => {
    let state = newWorkflow();
    state = advanceWorkflow(state, baseReq({ toStep: "SUBMITTED" })).state;
    const backward = advanceWorkflow(state, baseReq({ toStep: "DRAFT" }));
    expect(backward.outcome).toBe("REFUSED");
    const skip = advanceWorkflow(state, baseReq({ toStep: "POLICY_CHECK" }));
    expect(skip.outcome).toBe("REFUSED");
    expect(skip.reason).toMatch(/not the next step/i);
  });

  it("halts at POLICY_CHECK when a cited policy is unratified (fail closed)", () => {
    let state = newWorkflow();
    state = advanceWorkflow(state, baseReq({ toStep: "SUBMITTED", registry: emptyRegistry().policies })).state;
    state = advanceWorkflow(state, baseReq({ toStep: "VALIDATING", registry: emptyRegistry().policies })).state;
    const result = advanceWorkflow(state, baseReq({ toStep: "POLICY_CHECK", registry: emptyRegistry().policies }));
    expect(result.outcome).toBe("HALTED");
    expect(result.state.haltedBy).toBe("POLICY_DECISION_REQUIRED");
    expect(result.state.haltedReason).toMatch(/capital\.approval\.delegable/);
    // A halted workflow cannot be advanced by the engine.
    const blocked = advanceWorkflow(result.state, baseReq({ toStep: "AUTHORITY_CHECK" }));
    expect(blocked.outcome).toBe("REFUSED");
    expect(blocked.reason).toMatch(/halted/);
  });

  it("halts at AUTHORITY_CHECK when authority is missing — missing authority is never approval", () => {
    let state = newWorkflow();
    state = advanceWorkflow(state, baseReq({ toStep: "SUBMITTED" })).state;
    state = advanceWorkflow(state, baseReq({ toStep: "VALIDATING" })).state;
    state = advanceWorkflow(state, baseReq({ toStep: "POLICY_CHECK" })).state;
    const result = advanceWorkflow(state, baseReq({ toStep: "AUTHORITY_CHECK", authorityContext: null }));
    expect(result.outcome).toBe("HALTED");
    expect(result.state.haltedBy).toBe("AUTHORITY_REQUIRED");
  });

  it("an AI authority context halts with HUMAN_ACTOR_REQUIRED (FIR-017)", () => {
    let state = newWorkflow();
    state = advanceWorkflow(state, baseReq({ toStep: "SUBMITTED" })).state;
    state = advanceWorkflow(state, baseReq({ toStep: "VALIDATING" })).state;
    state = advanceWorkflow(state, baseReq({ toStep: "POLICY_CHECK" })).state;
    const result = advanceWorkflow(state, baseReq({ toStep: "AUTHORITY_CHECK", authorityContext: aiAuthority() }));
    expect(result.outcome).toBe("HALTED");
    expect(result.state.haltedBy).toBe("AUTHORITY_REQUIRED");
    expect(result.state.haltedReason).toMatch(/AI/i);
  });

  it("retryHaltedStep RE-RUNS the gate — it never skips it", () => {
    let state = newWorkflow();
    state = advanceWorkflow(state, baseReq({ toStep: "SUBMITTED", registry: emptyRegistry().policies })).state;
    state = advanceWorkflow(state, baseReq({ toStep: "VALIDATING", registry: emptyRegistry().policies })).state;
    const halted = advanceWorkflow(state, baseReq({ toStep: "POLICY_CHECK", registry: emptyRegistry().policies }));
    expect(halted.outcome).toBe("HALTED");

    // Retry with the policy still unratified: the gate re-runs and fails again.
    const stillHalted = retryHaltedStep(halted.state, baseReq({ toStep: "AUTHORITY_CHECK", registry: emptyRegistry().policies }));
    expect(stillHalted.outcome).toBe("HALTED");
    expect(stillHalted.state.haltedBy).toBe("POLICY_DECISION_REQUIRED");

    // Now the policy is ratified: the retry passes the policy gate and the
    // authority gate runs; the workflow proceeds.
    const retry = retryHaltedStep(stillHalted.state, baseReq({ toStep: "AUTHORITY_CHECK" }));
    expect(retry.outcome).toBe("ADVANCED");
    expect(retry.state.currentStep).toBe("AUTHORITY_CHECK");
    expect(retry.state.haltedBy).toBeNull();
  });

  it("retry of an authority halt re-runs the authority gate", () => {
    let state = newWorkflow();
    state = advanceWorkflow(state, baseReq({ toStep: "SUBMITTED" })).state;
    state = advanceWorkflow(state, baseReq({ toStep: "VALIDATING" })).state;
    state = advanceWorkflow(state, baseReq({ toStep: "POLICY_CHECK" })).state;
    const halted = advanceWorkflow(state, baseReq({ toStep: "AUTHORITY_CHECK", authorityContext: null }));
    expect(halted.outcome).toBe("HALTED");
    // Retry still without authority → halted again (gate re-ran).
    const still = retryHaltedStep(halted.state, baseReq({ toStep: "APPROVAL_REQUIRED", authorityContext: null }));
    expect(still.outcome).toBe("HALTED");
    // Retry with authority → proceeds.
    const ok = retryHaltedStep(still.state, baseReq({ toStep: "APPROVAL_REQUIRED", authorityContext: humanAuthority("user-1", "RES-APPROVE") }));
    expect(ok.outcome).toBe("ADVANCED");
    expect(ok.state.currentStep).toBe("APPROVAL_REQUIRED");
  });

  it("APPROVED requires a human approval reference (never inferred)", () => {
    let state = newWorkflow();
    state = advanceWorkflow(state, baseReq({ toStep: "SUBMITTED" })).state;
    state = advanceWorkflow(state, baseReq({ toStep: "VALIDATING" })).state;
    state = advanceWorkflow(state, baseReq({ toStep: "POLICY_CHECK" })).state;
    state = advanceWorkflow(state, baseReq({ toStep: "AUTHORITY_CHECK" })).state;
    state = advanceWorkflow(state, baseReq({ toStep: "APPROVAL_REQUIRED" })).state;
    const missing = advanceWorkflow(state, baseReq({ toStep: "APPROVED" }));
    expect(missing.outcome).toBe("REFUSED");
    expect(missing.reason).toMatch(/approval/i);
    const byAi = advanceWorkflow(state, baseReq({ toStep: "APPROVED", approvalRef: "APR-1", actor: { actorType: "AI", actorUserId: "noelia" } }));
    expect(byAi.outcome).toBe("REFUSED");
    const ok = advanceWorkflow(state, baseReq({ toStep: "APPROVED", approvalRef: "APR-1" }));
    expect(ok.outcome).toBe("ADVANCED");
  });
});

describe("R29 — execution is referenced, idempotent, and never anonymous", () => {
  function atExecutionReady(): OfficeWorkflowState {
    let state = newWorkflow();
    for (const toStep of ["SUBMITTED", "VALIDATING", "POLICY_CHECK", "AUTHORITY_CHECK", "APPROVAL_REQUIRED", "APPROVED", "EXECUTION_READY"] as const) {
      state = advanceWorkflow(state, baseReq({ toStep, ...(toStep === "APPROVED" ? { approvalRef: "APR-1" } : {}) })).state;
    }
    return state;
  }

  it("EXECUTED requires an idempotency key and an execution reference", () => {
    const state = atExecutionReady();
    const noKey = advanceWorkflow(state, baseReq({ toStep: "EXECUTED", executionReference: "FIN-EXEC-1" }));
    expect(noKey.outcome).toBe("REFUSED");
    expect(noKey.reason).toMatch(/idempotency/i);
    const noRef = advanceWorkflow(state, baseReq({ toStep: "EXECUTED", idempotencyKey: "IDEM-1" }));
    expect(noRef.outcome).toBe("REFUSED");
    expect(noRef.reason).toMatch(/execution reference/i);
  });

  it("AI may not record an execution reference", () => {
    const state = atExecutionReady();
    const byAi = advanceWorkflow(state, baseReq({ toStep: "EXECUTED", idempotencyKey: "IDEM-1", executionReference: "FIN-EXEC-1", actor: { actorType: "AI", actorUserId: "noelia" } }));
    expect(byAi.outcome).toBe("REFUSED");
  });

  it("the identical execution replays (REPLAY); a different reference under the same key is a conflict", () => {
    const state = atExecutionReady();
    const first = advanceWorkflow(state, baseReq({ toStep: "EXECUTED", idempotencyKey: "IDEM-1", executionReference: "FIN-EXEC-1" }));
    expect(first.outcome).toBe("ADVANCED");
    const replay = advanceWorkflow(first.state, baseReq({ toStep: "EXECUTED", idempotencyKey: "IDEM-1", executionReference: "FIN-EXEC-1" }));
    expect(replay.outcome).toBe("REPLAY");
    const conflict = advanceWorkflow(first.state, baseReq({ toStep: "EXECUTED", idempotencyKey: "IDEM-1", executionReference: "FIN-EXEC-OTHER" }));
    expect(conflict.outcome).toBe("REFUSED");
    expect(conflict.reason).toMatch(/CONFLICT/i);
    const differentAct = advanceWorkflow(first.state, baseReq({ toStep: "EXECUTED", idempotencyKey: "IDEM-2", executionReference: "FIN-EXEC-OTHER" }));
    expect(differentAct.outcome).toBe("REFUSED");
  });

  it("only an EXECUTED workflow can be CLOSED", () => {
    let state = newWorkflow();
    state = advanceWorkflow(state, baseReq({ toStep: "SUBMITTED" })).state;
    const tooEarly = advanceWorkflow(state, baseReq({ toStep: "CLOSED" }));
    expect(tooEarly.outcome).toBe("REFUSED");
  });
});

describe("R30 — events are evidence, never authority", () => {
  const baseInput = {
    type: "FAMILY_OFFICE_APPROVED" as const,
    domain: "FAMILY_CAPITAL",
    objectType: "CapitalInstruction",
    objectId: "CI-1",
    actorType: "HUMAN" as const,
    actorUserId: "user-1",
    tenantId: TENANT,
    legalEntityId: null,
    occurredAt: "2026-03-01T00:00:00.000Z",
    traceId: "trace-1",
    correlationId: "corr-1",
    causationId: null,
    citedAuthorityRef: "RES-APPROVE",
  };

  it("builds the canonical EventInput envelope", () => {
    const event = buildOfficeEvent(baseInput, "CONFIDENTIAL");
    expect(event.source).toBe("family-office");
    expect(event.domain).toBe("FAMILY_CAPITAL");
    expect(event.subjectType).toBe("CapitalInstruction");
    expect(event.subjectId).toBe("CI-1");
    expect(event.classification).toBe("CONFIDENTIAL");
    expect(event.authorityContext).toEqual({
      authorityId: "RES-APPROVE",
      decisionId: null,
      capabilityCode: null,
      permissionCode: null,
      policyVersion: null,
    });
  });

  it("gap events carry authorityContext = null by construction", () => {
    for (const type of ["FAMILY_OFFICE_POLICY_REQUIRED", "FAMILY_OFFICE_AUTHORITY_REQUIRED", "FAMILY_OFFICE_DENIED"] as const) {
      const event = buildOfficeEvent({ ...baseInput, type, citedAuthorityRef: "SHOULD-NOT-APPEAR" }, "INTERNAL");
      expect(event.authorityContext, type).toBeNull();
    }
  });

  it("events without a cited authority carry no authority context", () => {
    const event = buildOfficeEvent({ ...baseInput, type: "FAMILY_OFFICE_CREATED", citedAuthorityRef: null }, "INTERNAL");
    expect(event.authorityContext).toBeNull();
  });

  it("no event type in the catalogue may grant authority", () => {
    for (const type of OFFICE_EVENT_TYPES) {
      expect(() => assertEventCannotGrantAuthority(type)).not.toThrow();
    }
    expect(() => assertEventCannotGrantAuthority("FAMILY_OFFICE_AUTHORITY_GRANTED" as never)).toThrowError(/evidence, not authority/i);
    expect(() => assertEventCannotGrantAuthority("FAMILY_OFFICE_GRANT_CREATION" as never)).toThrowError();
  });
});

describe("R31 — the validation engine: one deterministic pass", () => {
  const validRecord: OfficeRecordInput = {
    kind: "CapitalAllocation",
    domain: "FAMILY_CAPITAL",
    tenantId: TENANT,
    legalEntityId: null,
    jurisdictionRef: null,
    allocationRef: "CA-1",
    capitalRef: "C-1",
    financeAllocationRef: "FIN-ALLOC-1",
    approvedBy: "user-1",
    authorityRef: "RES-ALLOC",
    effectiveFrom: "2026-03-01",
  };

  const validAct = { ...TENANT_SCOPE, action: "approve.capital.instruction", objectId: "CA-1" };

  it("a fully valid submission → VALID with zero findings", () => {
    const report = validateOfficeSubmission(resolvedRegistry().policies, {
      record: validRecord,
      policyKeys: ["capital.approval"],
      authorityContext: humanAuthority("user-1", "RES-APPROVE"),
      act: validAct,
      asOf: D.asOf,
    });
    expect(report.status).toBe("VALID");
    expect(report.findings).toEqual([]);
    expect(report.policyGaps).toEqual([]);
  });

  it("an unresolved cited policy → POLICY_DECISION_REQUIRED with the gap named", () => {
    const report = validateOfficeSubmission(emptyRegistry().policies, {
      record: validRecord,
      policyKeys: ["capital.approval"],
      authorityContext: humanAuthority("user-1", "RES-APPROVE"),
      act: validAct,
      asOf: D.asOf,
    });
    expect(report.status).toBe("POLICY_DECISION_REQUIRED");
    expect(report.policyGaps.map((g) => g.policyKey)).toEqual(["capital.approval"]);
  });

  it("an AI actor context → DENIED with HUMAN_ACTOR_REQUIRED", () => {
    const report = validateOfficeSubmission(resolvedRegistry().policies, {
      record: validRecord,
      policyKeys: ["capital.approval"],
      authorityContext: aiAuthority(),
      act: validAct,
      asOf: D.asOf,
    });
    expect(report.status).toBe("DENIED");
    expect(report.findings.some((f) => f.code === "HUMAN_ACTOR_REQUIRED")).toBe(true);
  });

  it("a financial-state field on the record → FINANCE_BOUNDARY_VIOLATION (FIR-018)", () => {
    const badRecord = { ...validRecord, balance: 42 } as OfficeRecordInput;
    const report = validateOfficeSubmission(resolvedRegistry().policies, {
      record: badRecord,
      policyKeys: ["capital.approval"],
      authorityContext: humanAuthority("user-1", "RES-APPROVE"),
      act: validAct,
      asOf: D.asOf,
    });
    expect(report.status).toBe("DENIED");
    expect(report.findings.some((f) => f.code === "FINANCE_BOUNDARY_VIOLATION")).toBe(true);
  });

  it("an unknown record kind is a finding, not a guess", () => {
    const findings = validateOfficeRecord({ ...validRecord, kind: "MysteryRecord" });
    expect(findings.some((f) => f.code === "EVIDENCE_INSUFFICIENT")).toBe(true);
  });

  it("a record without tenant scope is refused (tenant isolation is canonical)", () => {
    const findings = validateOfficeRecord({ ...validRecord, tenantId: "" });
    expect(findings.some((f) => f.code === "TENANT_ISOLATION_DENIED")).toBe(true);
  });

  it("status precedence: policy gaps outrank denials; a clean report is VALID only", () => {
    const both = validateOfficeSubmission(emptyRegistry().policies, {
      record: { ...validRecord, balance: 1 } as OfficeRecordInput,
      policyKeys: ["capital.approval"],
      authorityContext: aiAuthority(),
      act: validAct,
      asOf: D.asOf,
    });
    expect(both.status).toBe("POLICY_DECISION_REQUIRED");
    expect(both.findings.length).toBeGreaterThan(1);
    // And the drive() helper sanity: a refused drive ends non-CLOSED.
    const driven = drive(newWorkflow(), [
      { toStep: "SUBMITTED", req: { registry: emptyRegistry().policies } },
      { toStep: "VALIDATING", req: { registry: emptyRegistry().policies } },
      { toStep: "POLICY_CHECK", req: { registry: emptyRegistry().policies } },
    ]);
    expect(driven.last).toBe("HALTED");
    expect(driven.state.currentStep).not.toBe("CLOSED");
  });
});

describe("workflow + policy registry interplay (no version = no go)", () => {
  it("a registry whose version is PROPOSED-without-values halts the workflow", () => {
    const registry = buildPolicyRegistry([DEF], [policyVersion("capital.approval", 1, "PROPOSED")]);
    let state = newWorkflow();
    state = advanceWorkflow(state, baseReq({ toStep: "SUBMITTED", registry })).state;
    state = advanceWorkflow(state, baseReq({ toStep: "VALIDATING", registry })).state;
    const result = advanceWorkflow(state, baseReq({ toStep: "POLICY_CHECK", registry }));
    expect(result.outcome).toBe("HALTED");
    expect(result.state.haltedReason).toMatch(/unratified|no ACTIVE version/i);
  });
});
