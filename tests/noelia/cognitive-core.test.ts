import { describe, expect, it } from "vitest";
import {
  NOELIA_BRAINS,
  NOELIA_BRAIN_IDS,
  NOELIA_CANONICAL_IDENTITY,
  assertSingleIdentity,
  brainsForCapability,
  effectiveBrainReach,
  getBrain,
} from "../../src/lib/noelia/cognitive/brain-contracts";
import { attributeBrains, planQueenBeeWork, brainPresentation } from "../../src/lib/noelia/cognitive/queen-bee";
import {
  DEFAULT_TASK_BUDGET,
  assertNotPresentedAsFact,
  buildReasoningSummary,
  detectContradictionPairs,
  groupClaims,
  makeClaim,
  planWaves,
  renderClaim,
  validatePlan,
  type NoeliaPlan,
} from "../../src/lib/noelia/cognitive/reasoning";

describe("NOELIA single canonical identity", () => {
  it("declares exactly one Queen Bee identity", () => {
    expect(NOELIA_CANONICAL_IDENTITY.systemId).toBe("NOELIA_AI");
    expect(NOELIA_CANONICAL_IDENTITY.displayName).toBe("NOELIA");
    expect(NOELIA_CANONICAL_IDENTITY.identity).toBe("QUEEN_BEE");
    expect(NOELIA_CANONICAL_IDENTITY.runtime).toBe("HIVE");
  });

  it("accepts the canonical identity and rejects a competing one", () => {
    expect(() => assertSingleIdentity("NOELIA")).not.toThrow();
    expect(() => assertSingleIdentity("noelia_ai")).not.toThrow();
    expect(() => assertSingleIdentity("HEALTH-ASSISTANT")).toThrow(/single-identity invariant/);
    expect(() => assertSingleIdentity("QUEEN BEE 2")).toThrow(/single-identity invariant/);
  });

  it("declares exactly eight canonical brains with stable ordinals", () => {
    expect(NOELIA_BRAINS).toHaveLength(8);
    expect(NOELIA_BRAINS.map((b) => b.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(NOELIA_BRAINS.map((b) => b.id)).toEqual([...NOELIA_BRAIN_IDS]);
  });

  it("gives every brain a full contract", () => {
    for (const brain of NOELIA_BRAINS) {
      expect(brain.mandate.length).toBeGreaterThan(20);
      expect(brain.inputs.length).toBeGreaterThan(0);
      expect(brain.outputs.length).toBeGreaterThan(0);
      expect(brain.capabilityReach.length).toBeGreaterThan(0);
      expect(brain.requiredPermissions.length).toBeGreaterThan(0);
      expect(brain.memoryAccess.length).toBeGreaterThan(0);
      expect(brain.evaluationCriteria.length).toBeGreaterThan(0);
      // No brain may alter authoritative records today.
      expect(brain.cannotAlterAuthoritativeRecords).toBe(true);
      // No brain may declare a governed write in this release.
      expect(brain.mode).not.toBe("GOVERNED_WRITE");
    }
  });

  it("never allows a brain to reach beyond authorization", () => {
    const authorized = ["knowledge.rag.search", "noelia.world_model.query"];
    const reach = effectiveBrainReach("INSTITUTIONAL", authorized);
    // Reach is sorted and fully contained in the caller's authorization.
    expect([...reach].sort()).toEqual(["knowledge.rag.search", "noelia.world_model.query"]);
    // Every returned capability is authorized.
    for (const capability of reach) expect(authorized).toContain(capability);
  });

  it("returns no reach when the caller is authorized for nothing", () => {
    for (const brain of NOELIA_BRAINS) {
      expect(effectiveBrainReach(brain.id, [])).toEqual([]);
    }
  });

  it("attributes a capability to one or more brains", () => {
    expect(brainsForCapability("knowledge.rag.search")).toContain("KNOWLEDGE");
    expect(brainsForCapability("noelia.council.deliberate")).toContain("COLLECTIVE");
    expect(brainsForCapability("not.a.capability")).toEqual([]);
  });

  it("rejects an unknown brain id", () => {
    // @ts-expect-error deliberately invalid
    expect(() => getBrain("NONEXISTENT")).toThrow(/Unknown NOELIA brain/);
  });
});

describe("epistemic claims", () => {
  it("requires evidence for a FACT", () => {
    expect(() =>
      makeClaim({ id: "c1", kind: "FACT", statement: "Revenue is 5", brain: "ANALYTICAL" }),
    ).toThrow(/requires at least one evidence reference/);
    const claim = makeClaim({
      id: "c1",
      kind: "FACT",
      statement: "BEYU Holdings Ltd is an active holding entity.",
      brain: "INSTITUTIONAL",
      evidence: ["legal_entities:LEN_BEYU_HOLDINGS"],
    });
    expect(claim.confidence).toBeNull();
  });

  it("requires a recommendation to state what would change it", () => {
    expect(() =>
      makeClaim({ id: "r1", kind: "RECOMMENDATION", statement: "Expand", brain: "EXECUTIVE", evidence: ["x"] }),
    ).toThrow(/must state what would change it/);
  });

  it("prefix-tags every non-fact claim when rendered", () => {
    const inference = makeClaim({
      id: "i1",
      kind: "INFERENCE",
      statement: "Demand may rise.",
      brain: "ANALYTICAL",
      evidence: ["x"],
    });
    expect(renderClaim(inference)).toMatch(/^Inference: /);
    const simulation = makeClaim({
      id: "s1",
      kind: "SIMULATION",
      statement: "Revenue reaches 10 in the optimistic case.",
      brain: "ANALYTICAL",
      evidence: ["scenario"],
    });
    expect(renderClaim(simulation)).toMatch(/^Simulated \(not a record\): /);
    const fact = makeClaim({
      id: "f1",
      kind: "FACT",
      statement: "There are 9 legal entities.",
      brain: "INSTITUTIONAL",
      evidence: ["legal_entities"],
    });
    expect(renderClaim(fact)).toBe("There are 9 legal entities.");
  });

  it("refuses to present a non-fact as a fact", () => {
    const mixed = [
      makeClaim({ id: "f", kind: "FACT", statement: "Observed", brain: "KNOWLEDGE", evidence: ["a"] }),
      makeClaim({ id: "i", kind: "INFERENCE", statement: "Reasoned", brain: "KNOWLEDGE", evidence: ["a"] }),
    ];
    expect(() => assertNotPresentedAsFact(mixed)).toThrow(/Epistemic violation/);
    expect(() => assertNotPresentedAsFact([mixed[0]])).not.toThrow();
  });

  it("clamps confidence into [0,1] and never defaults it to zero", () => {
    const high = makeClaim({ id: "a", kind: "INFERENCE", statement: "s", brain: "ANALYTICAL", evidence: [], confidence: 4 });
    expect(high.confidence).toBe(1);
    const low = makeClaim({ id: "b", kind: "INFERENCE", statement: "s", brain: "ANALYTICAL", evidence: [], confidence: -2 });
    expect(low.confidence).toBe(0);
    const none = makeClaim({ id: "c", kind: "INFERENCE", statement: "s", brain: "ANALYTICAL", evidence: [] });
    expect(none.confidence).toBeNull();
  });

  it("groups claims by kind without losing any", () => {
    const claims = [
      makeClaim({ id: "1", kind: "FACT", statement: "a", brain: "KNOWLEDGE", evidence: ["e"] }),
      makeClaim({ id: "2", kind: "UNKNOWN", statement: "b", brain: "KNOWLEDGE", evidence: [] }),
      makeClaim({ id: "3", kind: "PREDICTION", statement: "c", brain: "ANALYTICAL", evidence: [] }),
    ];
    const grouped = groupClaims(claims);
    expect(grouped.FACT).toHaveLength(1);
    expect(grouped.UNKNOWN).toHaveLength(1);
    expect(grouped.PREDICTION).toHaveLength(1);
    expect(grouped.ASSUMPTION).toHaveLength(0);
  });

  it("computes an explainable confidence that a fact-only answer cannot exceed", () => {
    const summary = buildReasoningSummary({
      objective: "test",
      steps: [],
      claims: [
        makeClaim({ id: "1", kind: "FACT", statement: "a", brain: "KNOWLEDGE", evidence: ["e"], confidence: 1 }),
      ],
    });
    expect(summary.confidence).toBeLessThanOrEqual(0.95);
    expect(summary.confidence).toBeGreaterThan(0);
  });

  it("detects contradictions between fact claims on the same subject", () => {
    const claims = [
      makeClaim({ id: "1", kind: "FACT", statement: "Cash position is 100", brain: "ANALYTICAL", evidence: ["a"] }),
      makeClaim({ id: "2", kind: "FACT", statement: "Cash position is 200", brain: "ANALYTICAL", evidence: ["b"] }),
    ];
    const pairs = detectContradictionPairs(claims, () => "cash");
    expect(pairs).toHaveLength(1);
    expect(pairs[0].claims).toHaveLength(2);
  });

  it("does not report agreement as contradiction", () => {
    const claims = [
      makeClaim({ id: "1", kind: "FACT", statement: "Cash position is 100", brain: "ANALYTICAL", evidence: ["a"] }),
      makeClaim({ id: "2", kind: "FACT", statement: "cash position is 100.", brain: "ANALYTICAL", evidence: ["b"] }),
    ];
    expect(detectContradictionPairs(claims, () => "cash")).toHaveLength(0);
  });
});

describe("task DAG planning", () => {
  const basePlan = (): NoeliaPlan => ({
    planId: "PLAN_1",
    objective: "Assess expansion",
    budget: { ...DEFAULT_TASK_BUDGET },
    createdAt: new Date().toISOString(),
    nodes: [
      {
        id: "N1",
        parentId: null,
        objective: "Evidence",
        brain: "KNOWLEDGE",
        capabilities: [],
        dependsOn: [],
        status: "PENDING",
        maxRetries: 1,
        requiresApproval: false,
        completionCriterion: "sources",
      },
      {
        id: "N2",
        parentId: "N1",
        objective: "Analyse",
        brain: "ANALYTICAL",
        capabilities: [],
        dependsOn: ["N1"],
        status: "PENDING",
        maxRetries: 1,
        requiresApproval: false,
        completionCriterion: "analysis",
      },
      {
        id: "N3",
        parentId: "N1",
        objective: "Synthesise",
        brain: "EXECUTIVE",
        capabilities: [],
        dependsOn: ["N1", "N2"],
        status: "PENDING",
        maxRetries: 1,
        requiresApproval: false,
        completionCriterion: "synthesis",
      },
    ],
  });

  it("accepts a well-formed plan and produces waves", () => {
    const plan = basePlan();
    expect(() => validatePlan(plan)).not.toThrow();
    const waves = planWaves(plan);
    expect(waves).toHaveLength(3);
    expect(waves[0].map((n) => n.id)).toEqual(["N1"]);
    expect(waves[2].map((n) => n.id)).toEqual(["N3"]);
  });

  it("rejects a dependency cycle", () => {
    const plan = basePlan();
    plan.nodes[0].dependsOn = ["N3"];
    expect(() => validatePlan(plan)).toThrow(/cycle/i);
  });

  it("rejects a self-dependency", () => {
    const plan = basePlan();
    plan.nodes[1].dependsOn = ["N2"];
    expect(() => validatePlan(plan)).toThrow(/depends on itself/);
  });

  it("rejects an unknown dependency and unknown parent", () => {
    const a = basePlan();
    a.nodes[1].dependsOn = ["N99"];
    expect(() => validatePlan(a)).toThrow(/unknown node/);
    const b = basePlan();
    b.nodes[1].parentId = "N99";
    expect(() => validatePlan(b)).toThrow(/unknown parent/);
  });

  it("enforces the node budget", () => {
    const plan = basePlan();
    plan.budget.maxNodes = 2;
    expect(() => validatePlan(plan)).toThrow(/node budget/);
  });

  it("enforces the parent-chain depth budget", () => {
    const plan = basePlan();
    plan.budget.maxDepth = 2;
    // N3 -> parent N1 -> no parent = depth 2; N2 -> parent N1 = depth 2.
    expect(() => validatePlan(plan)).not.toThrow();
    plan.budget.maxDepth = 1;
    expect(() => validatePlan(plan)).toThrow(/depth budget/);
  });

  it("enforces the delegation fan-out budget", () => {
    const plan = basePlan();
    plan.budget.maxDelegationsPerNode = 1;
    expect(() => validatePlan(plan)).toThrow(/delegates 2 children/);
  });

  it("rejects duplicate ids and non-canonical brains", () => {
    const dup = basePlan();
    dup.nodes[1].id = "N1";
    expect(() => validatePlan(dup)).toThrow(/Duplicate plan node id/);
    const badBrain = basePlan();
    // @ts-expect-error deliberately invalid brain
    badBrain.nodes[0].brain = "MARKETING";
    expect(() => validatePlan(badBrain)).toThrow(/non-canonical brain/);
  });
});

describe("Queen Bee orchestration", () => {
  it("attributes an executive question to multiple brains", () => {
    const brains = attributeBrains("What is the strategic case for expanding the hospital, and what does the governance policy require?");
    expect(brains).toContain("EXECUTIVE");
    expect(brains).toContain("INSTITUTIONAL");
    expect(brains).toContain("KNOWLEDGE");
  });

  it("always includes the Knowledge brain as the evidence floor", () => {
    expect(attributeBrains("hello")).toContain("KNOWLEDGE");
  });

  it("builds a plan whose nodes only name authorized capabilities", () => {
    const authorized = ["knowledge.rag.search", "finance.cash.position", "noelia.world_model.query"];
    const result = planQueenBeeWork({
      question: "Assess the strategic case for hospital expansion",
      authorizedCapabilities: authorized,
      planId: "PLAN_TEST_1",
    });
    expect(result.identity.displayName).toBe("NOELIA");
    for (const node of result.plan.nodes) {
      for (const capability of node.capabilities) expect(authorized).toContain(capability);
    }
    expect(result.plan.nodes.length).toBeGreaterThan(1);
  });

  it("reports denials instead of silently dropping a brain", () => {
    const result = planQueenBeeWork({
      question: "Assess the strategic case for hospital expansion",
      authorizedCapabilities: ["knowledge.rag.search"],
      planId: "PLAN_TEST_2",
    });
    const executive = result.brains.find((b) => b.brain === "EXECUTIVE");
    expect(executive).toBeDefined();
    expect(executive!.denied.length).toBeGreaterThan(0);
    // Every denied entry names the capability and a reason.
    for (const denial of executive!.denied) {
      expect(denial.capability.length).toBeGreaterThan(0);
      expect(denial.reason.length).toBeGreaterThan(0);
    }
  });

  it("marks a brain with no authorized capability as BLOCKED and degrades the plan", () => {
    const result = planQueenBeeWork({
      question: "Assess the strategic case for hospital expansion",
      authorizedCapabilities: [],
      planId: "PLAN_TEST_3",
    });
    expect(result.degraded).toBe(true);
    const presentation = brainPresentation(result.brains[0]);
    expect(presentation.status).toBe("BLOCKED");
    expect(presentation.heading).toContain("NOELIA");
    // Every node is blocked because nothing is authorized.
    for (const node of result.plan.nodes) expect(node.status).toBe("BLOCKED");
  });

  it("produces an auditable reasoning summary that flags missing authorization", () => {
    const result = planQueenBeeWork({
      question: "Evaluate workforce capacity",
      authorizedCapabilities: [],
      planId: "PLAN_TEST_4",
    });
    expect(result.reasoning.steps.some((s) => s.kind === "INTENT")).toBe(true);
    expect(result.reasoning.unknowns.length).toBeGreaterThan(0);
    expect(result.reasoning.limitations.join(" ")).toMatch(/not an answer/i);
  });

  it("rejects an empty question", () => {
    expect(() =>
      planQueenBeeWork({ question: "   ", authorizedCapabilities: [], planId: "P" }),
    ).toThrow(/non-empty question/);
  });

  it("rejects an invalid budget", () => {
    expect(() =>
      planQueenBeeWork({
        question: "Assess risk",
        authorizedCapabilities: [],
        planId: "P",
        budget: { maxNodes: 0 },
      }),
    ).toThrow(/positive integer/);
    expect(() =>
      planQueenBeeWork({
        question: "Assess risk",
        authorizedCapabilities: [],
        planId: "P",
        budget: { maxNodes: 65 },
      }),
    ).toThrow(/may not exceed 64/);
  });

  it("is deterministic for identical inputs", () => {
    const run = () =>
      planQueenBeeWork({
        question: "Assess the strategic case for hospital expansion",
        authorizedCapabilities: ["knowledge.rag.search"],
        planId: "PLAN_DET",
        now: new Date("2026-01-01T00:00:00Z"),
      });
    expect(JSON.stringify(run().plan)).toBe(JSON.stringify(run().plan));
  });
});
