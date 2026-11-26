import { describe, expect, it } from "vitest";
import {
  assertSimulationNeverPresentedAsRecord,
  renderSimulation,
  runSimulation,
  type SimulationRequest,
  type SimulationVariable,
} from "../../src/lib/noelia/cognitive/scenario-engine";
import {
  classifyFinding,
  planCouncil,
  synthesiseCouncil,
  type CouncilFindingInput,
} from "../../src/lib/noelia/cognitive/council";
import {
  compareToBaseline,
  evaluateAnswer,
  prepareCorrectionProposal,
  summariseSuite,
  type GoldenCase,
} from "../../src/lib/noelia/cognitive/learning";
import type { NoeliaBrainId } from "../../src/lib/noelia/cognitive/brain-contracts";

const variable = (over: Partial<SimulationVariable> = {}): SimulationVariable => ({
  key: "CAPEX",
  label: "Capital expenditure",
  optimistic: 100,
  baseline: 150,
  adverse: 220,
  unit: "USD_M",
  provenance: "ESTIMATE",
  ...over,
});

const request = (over: Partial<SimulationRequest> = {}): SimulationRequest => ({
  objective: "Model hospital expansion capital requirement",
  scenarioKind: "CAPITAL_PLANNING",
  method: "LINEAR_COMBINATION",
  variables: [variable()],
  baseline: { CAPEX: { value: 150, provenance: "ESTIMATE", source: null } },
  assumptions: ["Construction cost per bed is stable"],
  ...over,
});

describe("strategic simulation engine", () => {
  it("returns all three mandatory scenarios deterministically", () => {
    const outcome = runSimulation(request());
    expect(outcome.scenarios.map((s) => s.label)).toEqual(["OPTIMISTIC", "BASELINE", "ADVERSE"]);
    expect(outcome.spread.optimistic).toBe(100);
    expect(outcome.spread.baseline).toBe(150);
    expect(outcome.spread.adverse).toBe(220);
    expect(outcome.deterministic).toBe(true);
    expect(outcome.resultClass).toBe("SIMULATION");
  });

  it("is reproducible: identical input yields identical output", () => {
    expect(JSON.stringify(runSimulation(request()))).toBe(JSON.stringify(runSimulation(request())));
  });

  it("refuses to zero-fill a missing input and reports it as unavailable", () => {
    const outcome = runSimulation(
      request({ variables: [variable({ adverse: null })] }),
    );
    const adverse = outcome.scenarios.find((s) => s.label === "ADVERSE")!;
    expect(adverse.outputs.objectiveValue).toBeNull();
    expect(adverse.complete).toBe(false);
    expect(adverse.unavailableInputs).toContain("CAPEX");
  });

  it("never claims high confidence from estimated inputs", () => {
    const estimated = runSimulation(request());
    expect(estimated.confidence).toBeLessThanOrEqual(0.4);
    const observed = runSimulation(
      request({
        variables: [variable({ provenance: "OBSERVED" })],
        baseline: { CAPEX: { value: 150, provenance: "OBSERVED", source: "finance" } },
      }),
    );
    expect(observed.confidence).toBeLessThanOrEqual(0.7);
    // Still never certainty.
    expect(observed.confidence).toBeLessThan(1);
  });

  it("flags an incomplete run with lowest confidence rather than a guess", () => {
    const outcome = runSimulation(request({ variables: [variable({ baseline: null })] }));
    expect(outcome.confidence).toBe(0.15);
    expect(outcome.limitations.join(" ")).toMatch(/unavailable/i);
  });

  it("treats a violated constraint as an incomplete scenario", () => {
    const outcome = runSimulation(
      request({
        constraints: [{ key: "cap", description: "Capital must stay under 120", max: 120 }],
      }),
    );
    const adverse = outcome.scenarios.find((s) => s.label === "ADVERSE")!;
    expect(adverse.unavailableInputs).toContain("constraint");
    expect(adverse.complete).toBe(false);
    const optimistic = outcome.scenarios.find((s) => s.label === "OPTIMISTIC")!;
    expect(optimistic.complete).toBe(true);
  });

  it("supports proportional scaling and refuses to divide by a zero baseline", () => {
    const scaled = runSimulation(
      request({
        method: "PROPORTIONAL_SCALING",
        variables: [variable({ baseline: 50, optimistic: 25, adverse: 100 })],
        baseline: { CAPEX: { value: 200, provenance: "RECORDED", source: "finance" } },
      }),
    );
    expect(scaled.scenarios.find((s) => s.label === "BASELINE")!.outputs.objectiveValue).toBe(200);
    expect(scaled.scenarios.find((s) => s.label === "OPTIMISTIC")!.outputs.objectiveValue).toBe(100);

    const zero = runSimulation(
      request({
        method: "PROPORTIONAL_SCALING",
        variables: [variable({ baseline: 0, optimistic: 0, adverse: 0 })],
      }),
    );
    expect(zero.scenarios[0].outputs.objectiveValue).toBeNull();
    expect(zero.confidence).toBe(0.15);
  });

  it("states that a simulation is not a forecast, valuation or record", () => {
    const outcome = runSimulation(request());
    expect(outcome.limitations.join(" ")).toMatch(/not a financial forecast/i);
    expect(outcome.limitations.join(" ")).toMatch(/never institutional records/i);
  });

  it("renders every line as explicitly simulated", () => {
    const lines = renderSimulation(runSimulation(request()));
    expect(lines[0]).toMatch(/^Simulated \(not a record\):/);
    expect(lines.join(" ")).toMatch(/UNAVAILABLE|OPTIMISTIC/);
  });

  it("rejects an empty objective or no variables", () => {
    expect(() => runSimulation(request({ objective: "  " }))).toThrow(/objective/);
    expect(() => runSimulation(request({ variables: [] }))).toThrow(/at least one variable/);
  });

  it("passes the structural simulation-integrity guard", () => {
    expect(() => assertSimulationNeverPresentedAsRecord(runSimulation(request()))).not.toThrow();
  });
});

describe("intelligence council", () => {
  const authorizedAll = () => true;

  const plan = () =>
    planCouncil({
      question: "Should BEYU establish another hospital?",
      objective: "Assess hospital expansion",
      candidateBrains: ["EXECUTIVE", "INSTITUTIONAL", "ANALYTICAL", "KNOWLEDGE", "OPERATIONAL"],
      capabilityAuthorized: authorizedAll,
    });

  const finding = (over: Partial<CouncilFindingInput> = {}): CouncilFindingInput => ({
    brain: "ANALYTICAL",
    capability: "finance.cash.position",
    task: "Assess capital capacity",
    claimKind: "FACT",
    statement: "Authorized cash covers 40% of the modelled capital requirement.",
    evidenceRefs: ["finance.cash.position"],
    assumptions: ["Cash position is current"],
    confidence: 0.7,
    ...over,
  });

  it("plans a bounded council with canonical ordering", () => {
    const p = plan();
    expect(p.specialists.length).toBeGreaterThanOrEqual(2);
    const ids = p.specialists.map((s) => s.brain);
    // Canonical order, not call order.
    expect(ids).toEqual([...ids].sort((a, b) => order(a) - order(b)));
    for (const specialist of p.specialists) {
      expect(specialist.brief.length).toBeGreaterThan(10);
      expect(specialist.capabilities.length).toBeGreaterThan(0);
    }
  });

  const order = (brain: NoeliaBrainId) =>
    ({ EXECUTIVE: 1, INSTITUTIONAL: 2, KNOWLEDGE: 3, ANALYTICAL: 4, OPERATIONAL: 5, LEARNING: 6, COLLECTIVE: 7, PERSONAL_CONTEXT: 8 })[brain];

  it("excludes a brain with no authorized capability and says why", () => {
    const p = planCouncil({
      question: "Assess hospital expansion",
      objective: "Assess hospital expansion",
      candidateBrains: ["EXECUTIVE", "ANALYTICAL"],
      capabilityAuthorized: (capability) => capability.startsWith("knowledge."),
    });
    expect(p.specialists.every((s) => s.capabilities.every((c) => c.startsWith("knowledge.")))).toBe(true);
    expect(p.excluded.length).toBeGreaterThan(0);
    for (const excluded of p.excluded) expect(excluded.reason.length).toBeGreaterThan(10);
  });

  it("refuses to convene when nobody is authorized", () => {
    expect(() =>
      planCouncil({
        question: "Assess hospital expansion",
        objective: "x",
        candidateBrains: ["EXECUTIVE", "ANALYTICAL"],
        capabilityAuthorized: () => false,
      }),
    ).toThrow(/cannot convene/);
  });

  it("marks an unsupported assertion as INSUFFICIENT_EVIDENCE, not support", () => {
    const classified = classifyFinding(finding({ evidenceRefs: [] }));
    expect(classified.position).toBe("INSUFFICIENT_EVIDENCE");
    expect(classified.positionReason).toMatch(/No evidence reference/);
  });

  it("synthesises with consensus, dissent and preserved disagreement", () => {
    const synthesis = synthesiseCouncil({
      plan: plan(),
      findings: [
        finding(),
        finding({
          brain: "EXECUTIVE",
          capability: "governance.strategic.objectives",
          task: "Assess capital capacity",
          claimKind: "FACT",
          statement: "Authorized cash covers 80% of the modelled capital requirement.",
          evidenceRefs: ["governance.strategic.objectives"],
        }),
        finding({ brain: "KNOWLEDGE", claimKind: "RECOMMENDATION", statement: "Stage the build in two phases.", evidenceRefs: ["knowledge.rag.search"], task: "Recommend phasing" }),
        finding({ brain: "OPERATIONAL", task: "Operational readiness", evidenceRefs: [], statement: "No workflow evidence was authorised." }),
      ],
    });
    expect(synthesis.humanDecisionRequired).toBe(true);
    expect(synthesis.consensus.length).toBeGreaterThan(0);
    expect(synthesis.dissent.length).toBeGreaterThan(0);
    expect(synthesis.disagreements.length).toBe(1);
    expect(synthesis.disagreements[0].supporting).toHaveLength(2);
    expect(synthesis.claims.some((c) => c.kind === "RECOMMENDATION")).toBe(true);
    expect(synthesis.confidence).toBeLessThan(1);
  });

  it("collapses duplicate opinions instead of counting them as agreement", () => {
    const statement = "Capital is constrained in the current year.";
    const synthesis = synthesiseCouncil({
      plan: plan(),
      findings: [
        finding({ brain: "ANALYTICAL", statement, task: "Capital" }),
        finding({ brain: "EXECUTIVE", statement: `${statement}`, task: "Capital" }),
      ],
    });
    expect(synthesis.duplicatedOpinions).toHaveLength(1);
    expect(synthesis.duplicatedOpinions[0].brains).toHaveLength(2);
    expect(synthesis.claims).toHaveLength(1);
    expect(synthesis.consensus).toHaveLength(1);
  });

  it("records missing specialist findings", () => {
    const synthesis = synthesiseCouncil({ plan: plan(), findings: [] });
    expect(synthesis.missing.length).toBeGreaterThan(0);
    expect(synthesis.confidence).toBe(0);
    expect(synthesis.humanDecisionRequired).toBe(true);
  });

  it("never returns a decision, only a recommendation and approvals", () => {
    const synthesis = synthesiseCouncil({
      plan: plan(),
      findings: [finding({ claimKind: "RECOMMENDATION", statement: "Proceed with phase one." })],
    });
    expect(synthesis.humanDecisionRequired).toBe(true);
    expect(synthesis.approvalsRequired.join(" ")).toMatch(/authorized human decision/i);
    expect(synthesis.executiveSummary).toMatch(/not a decision/i);
  });
});

describe("controlled learning", () => {
  const golden: GoldenCase = {
    code: "GC-001",
    brain: "ANALYTICAL",
    capability: "finance.cash.position",
    question: "What is the authorized cash position?",
    expectedOutputClass: "FACT",
    requiredEvidence: ["finance.cash.position"],
    forbiddenClaims: ["RESTRICTED_FIGURE_999"],
    tolerance: 0.9,
  };

  it("passes a well-evidenced answer", () => {
    const outcome = evaluateAnswer(golden, {
      outputClass: "FACT",
      citedEvidence: ["finance.cash.position"],
      text: "Authorized cash is recorded by Finance OS.",
      humanReviewRequired: false,
    });
    expect(outcome.passed).toBe(true);
    expect(outcome.score).toBe(1);
    expect(outcome.hardFailures).toHaveLength(0);
  });

  it("hard-fails on forbidden content regardless of score", () => {
    const outcome = evaluateAnswer(golden, {
      outputClass: "FACT",
      citedEvidence: ["finance.cash.position"],
      text: "The figure is RESTRICTED_FIGURE_999.",
      humanReviewRequired: false,
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.score).toBe(0);
    expect(outcome.hardFailures.join(" ")).toMatch(/Forbidden content/);
  });

  it("fails an answer that omits required evidence", () => {
    const outcome = evaluateAnswer(golden, {
      outputClass: "FACT",
      citedEvidence: [],
      text: "Cash is fine.",
      humanReviewRequired: false,
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.checks.find((c) => c.check === "EVIDENCE_CITATIONS")!.passed).toBe(false);
  });

  it("hard-fails a REQUIRES_HUMAN_REVIEW case that does not flag review", () => {
    const reviewCase: GoldenCase = { ...golden, expectedOutputClass: "REQUIRES_HUMAN_REVIEW" };
    const outcome = evaluateAnswer(reviewCase, {
      outputClass: "REQUIRES_HUMAN_REVIEW",
      citedEvidence: ["finance.cash.position"],
      text: "Cash is fine.",
      humanReviewRequired: false,
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.hardFailures.join(" ")).toMatch(/human review/i);
  });

  it("detects a regression beyond tolerance and ignores one within tolerance", () => {
    const regression = compareToBaseline({ code: "GC-001", baselineScore: 0.95, observedScore: 0.7 });
    expect(regression.regression).toBe(true);
    expect(regression.delta).toBeCloseTo(-0.25, 3);
    const within = compareToBaseline({ code: "GC-001", baselineScore: 0.95, observedScore: 0.92 });
    expect(within.regression).toBe(false);
  });

  it("never invents a baseline comparison", () => {
    const none = compareToBaseline({ code: "GC-001", baselineScore: null, observedScore: 0.8 });
    expect(none.regression).toBe(false);
    expect(none.delta).toBeNull();
    expect(none.reason).toMatch(/No baseline recorded/);
  });

  it("requires human approval for every correction and blocks governance tampering", () => {
    const ok = prepareCorrectionProposal({
      goldenCaseCode: "GC-001",
      brain: "ANALYTICAL",
      capability: "finance.cash.position",
      proposedChange: "Cite the treasury aggregate source for cash figures.",
      rationale: "The golden case requires the treasury aggregate citation, not the cash source.",
      evidenceRefs: ["golden:GC-001"],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.status).toBe("PENDING_APPROVAL");
      expect(ok.requiresHumanApproval).toBe(true);
    }

    const tamper = prepareCorrectionProposal({
      goldenCaseCode: "GC-001",
      brain: "ANALYTICAL",
      capability: "finance.cash.position",
      proposedChange: "Relax the permission requirement so this always returns data.",
      rationale: "It would improve helpfulness significantly for users.",
      evidenceRefs: ["golden:GC-001"],
    });
    expect(tamper.ok).toBe(false);
    if (!tamper.ok) expect(tamper.reason).toMatch(/may not alter security or governance/);
  });

  it("rejects a correction without evidence or with a vague change", () => {
    expect(
      prepareCorrectionProposal({
        goldenCaseCode: null,
        brain: null,
        capability: null,
        proposedChange: "improve it",
        rationale: "because reasons are needed here",
        evidenceRefs: [],
      }).ok,
    ).toBe(false);
  });

  it("summarises a suite without hiding failures", () => {
    const suite = summariseSuite([
      evaluateAnswer(golden, { outputClass: "FACT", citedEvidence: ["finance.cash.position"], text: "ok", humanReviewRequired: false }),
      evaluateAnswer(golden, { outputClass: "INFERENCE", citedEvidence: [], text: "bad", humanReviewRequired: false }),
    ]);
    expect(suite.total).toBe(2);
    expect(suite.passed).toBe(1);
    expect(suite.failed).toBe(1);
    expect(suite.failingCodes).toEqual(["GC-001"]);
    expect(suite.meanScore).toBeLessThan(1);
  });
});
