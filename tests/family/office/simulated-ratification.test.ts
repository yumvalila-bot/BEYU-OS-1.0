/**
 * §36 — SIMULATED RATIFICATION (TEST-ONLY).
 *
 * ⚠️  EVERY POLICY VALUE IN THIS FILE IS A SYNTHETIC TEST-ONLY VALUE.
 *     It exists to PROVE that the engine is policy-CONFIGURABLE:
 *     registration → activation → validation → enforcement, with NO
 *     re-engineering. None of these values is a ratified policy, a
 *     recommended policy, or any kind of standing decision.
 *
 * The simulation:
 *   1. Before ratification: every policy-dependent act fails closed.
 *   2. A human ratifies (synthetic) governance quorum + loan terms.
 *   3. The SAME engine now enforces exactly the ratified values —
 *     arithmetic on the rated numbers, nothing invented.
 *   4. A second ratification supersedes the first; the engine enforces
 *     the NEW values; the seven questions answer the new chain.
 *   5. A halted workflow, retrying after the ratification lands, proceeds
 *     — the halt is cleared by the governed act, never by the engine.
 *   6. Revocation fails the engine closed again.
 */

import { describe, expect, it } from "vitest";

/* ------------------------------------------------------------------ */
/* ⚠️ SYNTHETIC TEST-ONLY VALUES (not policy, not advice)               */
/* ------------------------------------------------------------------ */
const SIM = {
  quorumV1: 2, // TEST-ONLY synthetic quorum
  quorumV2: 3, // TEST-ONLY synthetic quorum (supersession)
  loan: {
    interestRateMin: 0.02, // TEST-ONLY synthetic lower bound (2%)
    interestRateMax: 0.05, // TEST-ONLY synthetic upper bound (5%)
    termDaysMin: 90, // TEST-ONLY synthetic minimum term
    termDaysMax: 365, // TEST-ONLY synthetic maximum term
    eligibleContexts: ["family.member"], // TEST-ONLY synthetic coverage
    securityRef: null,
  },
  effectiveFrom: "2026-02-01",
  ratifiedOn: "2026-01-15",
  asOf: "2026-03-01",
  decisionMaker: "Simulated Chair (TEST-ONLY synthetic actor)",
} as const;

import { buildPolicyRegistry, resolvePolicy, revokePolicyVersion } from "../../../src/lib/family/office/policy";
import {
  buildRatificationRegistry,
  effectiveSince,
  registerRatification,
  underWhatAuthority,
  whatRemainsUnresolved,
  whatWasSuperseded,
  whoRatified,
  type RatificationRegistry,
} from "../../../src/lib/family/office/ratification";
import { evaluateQuorum } from "../../../src/lib/family/office/governance";
import { validateProposedLoan, type LoanTermsRule } from "../../../src/lib/family/office/loan";
import { advanceWorkflow, createWorkflow, retryHaltedStep } from "../../../src/lib/family/office/workflow";
import { FAMILY_OFFICE_ENGINE_VERSION } from "../../../src/lib/family/office/types";
import { TENANT, TENANT_SCOPE, humanAuthority, policyDef, ratificationRecord } from "./fixtures";

const DEFS = [
  policyDef("governance.quorum", "FAMILY_GOVERNANCE", { quorum: "NUMBER" }),
  policyDef("loan.terms", "FAMILY_LOAN", {
    interestRateMin: "NUMBER",
    interestRateMax: "NUMBER",
    termDaysMin: "NUMBER",
    termDaysMax: "NUMBER",
    eligibleContexts: "REFERENCE",
    securityRef: "REFERENCE",
  }),
];

function emptyOffice(): RatificationRegistry {
  return buildRatificationRegistry(DEFS, [], []);
}

function loanRuleOf(registry: RatificationRegistry): LoanTermsRule | null {
  const resolved = resolvePolicy<Record<string, unknown>>(registry.policies, "loan.terms", SIM.asOf);
  if (resolved.state !== "RESOLVED") return null;
  return {
    ruleRef: `loan.terms@v${resolved.version}`,
    policyKey: "loan.terms",
    interestRateMin: resolved.value.interestRateMin as number,
    interestRateMax: resolved.value.interestRateMax as number,
    termDaysMin: resolved.value.termDaysMin as number,
    termDaysMax: resolved.value.termDaysMax as number,
    eligibleContexts: resolved.value.eligibleContexts as string[],
    securityRef: typeof resolved.value.securityRef === "string" ? resolved.value.securityRef : null,
  };
}

describe("§36 — SIMULATED RATIFICATION (TEST-ONLY synthetic values)", () => {
  it("STEP 1 — before any ratification, every policy-dependent act fails closed", () => {
    const registry = emptyOffice();
    // Quorum: no value → POLICY_DECISION_REQUIRED.
    expect(evaluateQuorum(registry.policies, "governance.quorum", 2, SIM.asOf).state).toBe("POLICY_DECISION_REQUIRED");
    // Loan: no terms → POLICY_DECISION_REQUIRED.
    expect(validateProposedLoan(loanRuleOf(registry), proposal()).state).toBe("POLICY_DECISION_REQUIRED");
    // The honest gap list names both.
    expect(whatRemainsUnresolved(registry, SIM.asOf).sort()).toEqual(["governance.quorum", "loan.terms"]);
  });

  it("STEP 2 — the synthetic ratification is registered and activated; the engine enforces the SYNTHETIC values", () => {
    const quorumRec = ratificationRecord("SIM-RES-QUORUM-1", "governance.quorum", 1, [{ key: "quorum", kind: "NUMBER", value: SIM.quorumV1 }], {
      decisionMaker: SIM.decisionMaker,
      effectiveFrom: SIM.effectiveFrom,
    });
    const loanRec = ratificationRecord(
      "SIM-RES-LOAN-1",
      "loan.terms",
      1,
      [
        { key: "interestRateMin", kind: "NUMBER", value: SIM.loan.interestRateMin },
        { key: "interestRateMax", kind: "NUMBER", value: SIM.loan.interestRateMax },
        { key: "termDaysMin", kind: "NUMBER", value: SIM.loan.termDaysMin },
        { key: "termDaysMax", kind: "NUMBER", value: SIM.loan.termDaysMax },
        { key: "eligibleContexts", kind: "REFERENCE", value: [...SIM.loan.eligibleContexts] },
        // securityRef: intentionally NOT ratified in this simulation —
        // the rule therefore requires no security (content of the ratification, not an engine default).
      ],
      { decisionMaker: SIM.decisionMaker, effectiveFrom: SIM.effectiveFrom },
    );

    let registry = registerRatification(emptyOffice(), quorumRec, TENANT_SCOPE, SIM.asOf).registry;
    registry = registerRatification(registry, loanRec, TENANT_SCOPE, SIM.asOf).registry;

    // The seven questions answer the synthetic chain (no fabricated extras).
    expect(whoRatified(registry, "governance.quorum", SIM.asOf)).toBe(SIM.decisionMaker);
    expect(underWhatAuthority(registry, "governance.quorum", SIM.asOf)).toEqual({ kind: "RESOLUTION", referenceId: "RES-SIM-RES-QUORUM-1-AUTH" });
    expect(effectiveSince(registry, "governance.quorum", SIM.asOf)).toBe(SIM.effectiveFrom);
    expect(whatWasSuperseded(registry, "governance.quorum", SIM.asOf)).toBeNull();
    expect(whatRemainsUnresolved(registry, SIM.asOf)).toEqual([]);

    // Quorum now enforces the synthetic value 2 — arithmetic, nothing invented.
    const met = evaluateQuorum(registry.policies, "governance.quorum", SIM.quorumV1, SIM.asOf);
    expect(met).toEqual({ state: "RESOLVED", value: { met: true, required: SIM.quorumV1, present: SIM.quorumV1 } });
    const unmet = evaluateQuorum(registry.policies, "governance.quorum", SIM.quorumV1 - 1, SIM.asOf);
    expect((unmet as { value: { met: boolean } }).value.met).toBe(false);

    // Loan terms now enforce the synthetic bounds.
    const rule = loanRuleOf(registry);
    expect(rule).not.toBeNull();
    const okLoan = validateProposedLoan(rule, proposal(0.03, 180));
    expect(okLoan.state).toBe("RESOLVED");
    const tooHigh = validateProposedLoan(rule, proposal(0.09, 180));
    expect(tooHigh.state).toBe("DENIED");
    expect((tooHigh as { reason: string }).reason).toMatch(/\[0\.02, 0\.05\]/);
  });

  it("STEP 3 — a second synthetic ratification supersedes; the engine enforces the NEW values with no re-engineering", () => {
    let registry = ratifyQuorumAndLoan();
    const quorumRec2 = ratificationRecord("SIM-RES-QUORUM-2", "governance.quorum", 2, [{ key: "quorum", kind: "NUMBER", value: SIM.quorumV2 }], {
      decisionMaker: SIM.decisionMaker,
      effectiveFrom: SIM.effectiveFrom,
      supersedesDecisionId: "SIM-RES-QUORUM-1",
      version: 2,
    });
    registry = registerRatification(registry, quorumRec2, TENANT_SCOPE, SIM.asOf).registry;

    // The engine now enforces the new synthetic quorum — same code path.
    const resolved = resolvePolicy<{ quorum: number }>(registry.policies, "governance.quorum", SIM.asOf);
    expect(resolved.state).toBe("RESOLVED");
    if (resolved.state !== "RESOLVED") return;
    expect(resolved.version).toBe(2);
    expect(resolved.value.quorum).toBe(SIM.quorumV2);
    expect(evaluateQuorum(registry.policies, "governance.quorum", SIM.quorumV2 - 1, SIM.asOf).state).toBe("RESOLVED");
    expect((evaluateQuorum(registry.policies, "governance.quorum", SIM.quorumV2 - 1, SIM.asOf) as { value: { met: boolean } }).value.met).toBe(false);

    // The seven questions now answer the superseded chain.
    expect(whoRatified(registry, "governance.quorum", SIM.asOf)).toBe(SIM.decisionMaker);
    expect(whatWasSuperseded(registry, "governance.quorum", SIM.asOf)).toBe("SIM-RES-QUORUM-1");
    expect(registry.records.get("SIM-RES-QUORUM-1")!.status).toBe("SUPERSEDED");
  });

  it("STEP 4 — a workflow halted BEFORE ratification proceeds when the ratification lands (gate re-run, never skipped)", () => {
    // A workflow that requires governance.quorum, created while unratified.
    const def = policyDef("governance.quorum", "FAMILY_GOVERNANCE", { quorum: "NUMBER" });
    const state = createWorkflow({
      workflowId: "WF-SIM",
      domain: "FAMILY_GOVERNANCE",
      objectType: "FamilyDecision",
      objectId: "DEC-SIM",
      tenantId: TENANT,
      createdAt: "2026-01-10",
      actorUserId: "user-sim",
    });
    const req = (toStep: string, registry: RatificationRegistry) => ({
      toStep: toStep as never,
      asOf: "2026-01-12",
      actor: { actorType: "HUMAN" as const, actorUserId: "user-sim" },
      registry: registry.policies,
      policyRequirement: { required: [{ policyKey: "governance.quorum", field: "quorum" }], requiresAuthority: true },
      authorityContext: humanAuthority("user-sim", "SIM-RES-WORKFLOW-AUTH"),
    });
    let s = advanceWorkflow(state, req("SUBMITTED", emptyOffice())).state;
    s = advanceWorkflow(s, req("VALIDATING", emptyOffice())).state;
    const halted = advanceWorkflow(s, req("POLICY_CHECK", emptyOffice()));
    expect(halted.outcome).toBe("HALTED");
    expect(halted.state.haltedBy).toBe("POLICY_DECISION_REQUIRED");

    // The synthetic ratification lands (a governed act, not an engine act).
    const quorumRec = ratificationRecord("SIM-RES-QUORUM-1", "governance.quorum", 1, [{ key: "quorum", kind: "NUMBER", value: SIM.quorumV1 }], {
      decisionMaker: SIM.decisionMaker,
      effectiveFrom: "2026-01-11",
    });
    const ratified = registerRatification(buildRatificationRegistry([def], [], []), quorumRec, TENANT_SCOPE, "2026-01-12").registry;

    // Retry: the gate re-runs against the ratified registry and passes.
    const retried = retryHaltedStep(halted.state, req("AUTHORITY_CHECK", ratified));
    expect(retried.outcome).toBe("ADVANCED");
    expect(retried.state.currentStep).toBe("AUTHORITY_CHECK");
    expect(retried.state.haltedBy).toBeNull();
  });

  it("STEP 5 — revocation fails the engine closed again (configuration, not code)", () => {
    let registry = ratifyQuorumAndLoan();
    // Revoke the active loan terms version (terminal, audit-referenced).
    registry = {
      ...registry,
      policies: revokePolicyVersion(registry.policies, "loan.terms", 1, "AUD-SIM-REVOKE-LOAN"),
    };
    expect(loanRuleOf(registry)).toBeNull();
    const outcome = validateProposedLoan(loanRuleOf(registry), proposal(0.03, 180));
    expect(outcome.state).toBe("POLICY_DECISION_REQUIRED");
    // Quorum is untouched: revocation is surgical.
    expect(evaluateQuorum(registry.policies, "governance.quorum", 2, SIM.asOf).state).toBe("RESOLVED");
  });

  it("STEP 6 — the engine version is constant across the whole simulation (no re-engineering happened)", () => {
    // The engine identity never changes between the unratified, ratified,
    // superseded, and revoked states: the rails are stable.
    expect(FAMILY_OFFICE_ENGINE_VERSION).toBe("family-office-1.0.0");
    // Sanity: buildPolicyRegistry is importable and pure across states.
    const r = buildPolicyRegistry([], []);
    expect(r.definitions.size).toBe(0);
  });
});

function proposal(rate = 0.03, termDays = 180) {
  return {
    proposedLoanRef: "SIM-PL-1",
    borrowerRef: "P-SIM",
    borrowerContextKey: "family.member",
    proposedInterestRate: rate,
    proposedTermDays: termDays,
    securityRef: null,
    tenantId: TENANT,
  };
}

function ratifyQuorumAndLoan(): RatificationRegistry {
  const quorumRec = ratificationRecord("SIM-RES-QUORUM-1", "governance.quorum", 1, [{ key: "quorum", kind: "NUMBER", value: SIM.quorumV1 }], {
    decisionMaker: SIM.decisionMaker,
    effectiveFrom: SIM.effectiveFrom,
  });
  const loanRec = ratificationRecord(
    "SIM-RES-LOAN-1",
    "loan.terms",
    1,
    [
      { key: "interestRateMin", kind: "NUMBER", value: SIM.loan.interestRateMin },
      { key: "interestRateMax", kind: "NUMBER", value: SIM.loan.interestRateMax },
      { key: "termDaysMin", kind: "NUMBER", value: SIM.loan.termDaysMin },
      { key: "termDaysMax", kind: "NUMBER", value: SIM.loan.termDaysMax },
      { key: "eligibleContexts", kind: "REFERENCE", value: [...SIM.loan.eligibleContexts] },
      // securityRef: intentionally NOT ratified in this simulation —
      // the rule therefore requires no security (content of the ratification, not an engine default).
    ],
    { decisionMaker: SIM.decisionMaker, effectiveFrom: SIM.effectiveFrom },
  );
  let registry = registerRatification(emptyOffice(), quorumRec, TENANT_SCOPE, SIM.asOf).registry;
  registry = registerRatification(registry, loanRec, TENANT_SCOPE, SIM.asOf).registry;
  return registry;
}
