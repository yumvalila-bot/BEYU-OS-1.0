/**
 * NOELIA — QUEEN BEE ORCHESTRATION (cognitive core, layer 1).
 *
 * Queen Bee is the coordination layer. It does NOT execute capabilities and it
 * does NOT decide authorization. It:
 *
 *   1. takes a resolved, authorized scope and the caller's authorized
 *      capability list from BEYU OS services,
 *   2. attributes the question to the brains that can answer it,
 *   3. computes each brain's EFFECTIVE reach (declaration ∩ authorization),
 *   4. builds a validated task DAG whose nodes only ever name capabilities the
 *      caller is already allowed to run,
 *   5. returns the plan plus an auditable reasoning summary.
 *
 * A node for which the caller has no authorized capability becomes an explicit
 * `denied` entry, never a silently dropped step. That is the whole point of
 * permission-aware planning: the denial is visible.
 */

import {
  NOELIA_BRAINS,
  assertSingleIdentity,
  effectiveBrainReach,
  getBrain,
  type NoeliaBrainId,
} from "./brain-contracts";
import {
  DEFAULT_TASK_BUDGET,
  buildReasoningSummary,
  makeClaim,
  planWaves,
  validatePlan,
  type NoeliaClaim,
  type NoeliaPlan,
  type NoeliaPlanNode,
  type NoeliaTaskBudget,
} from "./reasoning";
import { NOELIA_CANONICAL_IDENTITY } from "./brain-contracts";

/**
 * Deterministic brain attribution.
 *
 * Every question is answered by at least the Knowledge Brain, and executive
 * questions additionally convene the Collective Brain. Attribution is keyword
 * based on institutional vocabulary and is inspectable — the same rule that
 * governs `routeEngine` governs this, for the same reason: a hidden router is
 * an unauditable router.
 */
const BRAIN_TRIGGERS: ReadonlyArray<{ brain: NoeliaBrainId; pattern: RegExp }> = [
  { brain: "COLLECTIVE", pattern: /\bcouncil\b|deliberat|should beyu|multi-specialist|independent analysis/i },
  { brain: "ANALYTICAL", pattern: /analys|forecast|scenario|variance|stress|projection|trend|kpi|quantif/i },
  { brain: "INSTITUTIONAL", pattern: /governance|constitution|board|resolution|hierarchy|entity|ownership|policy/i },
  { brain: "OPERATIONAL", pattern: /workflow|schedule|execution|pipeline status|operat|approval status/i },
  { brain: "LEARNING", pattern: /evaluat|benchmark|quality of (the )?answers|regression|learning/i },
  { brain: "EXECUTIVE", pattern: /strateg|priorit|brief|executive|should we|opportunit|expansion|invest/i },
];

export function attributeBrains(question: string): NoeliaBrainId[] {
  const selected = new Set<NoeliaBrainId>();
  for (const trigger of BRAIN_TRIGGERS) {
    if (trigger.pattern.test(question)) selected.add(trigger.brain);
  }
  // The Knowledge Brain is the floor: every answer rests on governed retrieval.
  selected.add("KNOWLEDGE");
  // Stable canonical ordering, never insertion ordering.
  return NOELIA_BRAINS.filter((brain) => selected.has(brain.id)).map((brain) => brain.id);
}

export type BrainPlanEntry = {
  brain: NoeliaBrainId;
  title: string;
  mode: string;
  /** Declared maximum reach. */
  declaredReach: string[];
  /** Reach actually authorized for this caller. */
  authorizedReach: string[];
  /** Declared capabilities the caller may NOT use, with the reason. */
  denied: Array<{ capability: string; reason: string }>;
};

export type QueenBeePlanRequest = {
  question: string;
  /** Capabilities the caller is already authorized to invoke (from the registry). */
  authorizedCapabilities: string[];
  budget?: Partial<NoeliaTaskBudget>;
  /** Stable id source injected by the caller (never generated here). */
  planId: string;
  now?: Date;
};

export type QueenBeePlanResult = {
  identity: typeof NOELIA_CANONICAL_IDENTITY;
  plan: NoeliaPlan;
  brains: BrainPlanEntry[];
  waves: NoeliaPlanNode[][];
  reasoning: ReturnType<typeof buildReasoningSummary>;
  /** True when at least one brain had no authorized capability. */
  degraded: boolean;
};

function buildBudget(partial?: Partial<NoeliaTaskBudget>, nodeCount = 0): NoeliaTaskBudget {
  const budget: NoeliaTaskBudget = {
    maxNodes: partial?.maxNodes ?? Math.max(DEFAULT_TASK_BUDGET.maxNodes, nodeCount),
    maxDepth: partial?.maxDepth ?? DEFAULT_TASK_BUDGET.maxDepth,
    maxDelegationsPerNode: partial?.maxDelegationsPerNode ?? DEFAULT_TASK_BUDGET.maxDelegationsPerNode,
  };
  for (const [key, value] of Object.entries(budget)) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`Task budget '${key}' must be a positive integer.`);
    }
  }
  if (budget.maxNodes > 64) throw new Error("Task budget maxNodes may not exceed 64.");
  if (budget.maxDepth > 8) throw new Error("Task budget maxDepth may not exceed 8.");
  return budget;
}

/**
 * Queue Bee's planning entry point.
 *
 * NOTE the comment above says "Queen Bee" — this comment intentionally keeps a
 * single canonical identity; `assertSingleIdentity` is invoked so a future edit
 * cannot rename NOELIA into a second assistant.
 */
export function planQueenBeeWork(request: QueenBeePlanRequest): QueenBeePlanResult {
  assertSingleIdentity(NOELIA_CANONICAL_IDENTITY.displayName);
  const question = request.question.trim();
  if (question.length === 0) throw new Error("Queen Bee requires a non-empty question.");

  const authorized = new Set(request.authorizedCapabilities);
  const brainIds = attributeBrains(question);

  const brains: BrainPlanEntry[] = brainIds.map((id) => {
    const brain = getBrain(id);
    const authorizedReach = effectiveBrainReach(id, request.authorizedCapabilities);
    const denied = brain.capabilityReach
      .filter((capability) => !authorized.has(capability))
      .map((capability) => ({
        capability,
        reason: `Caller is not authorized for '${capability}' (brain ${id}).`,
      }));
    return {
      brain: id,
      title: brain.title,
      mode: brain.mode,
      declaredReach: [...brain.capabilityReach],
      authorizedReach,
      denied,
    };
  });

  // Build a DAG. The Knowledge node is the root; every other brain depends on
  // it because no brain may reason without governed evidence.
  const rootId = "N1";
  const nodes: NoeliaPlanNode[] = [];
  const knowledge = brains.find((b) => b.brain === "KNOWLEDGE");
  const knowledgeCaps = knowledge?.authorizedReach.length
    ? knowledge.authorizedReach.slice(0, 2)
    : [];

  nodes.push({
    id: rootId,
    parentId: null,
    objective: "Assemble permission-filtered institutional evidence for the question.",
    brain: "KNOWLEDGE",
    capabilities: knowledgeCaps,
    dependsOn: [],
    status: knowledgeCaps.length > 0 ? "PENDING" : "BLOCKED",
    maxRetries: 1,
    requiresApproval: false,
    completionCriterion: "At least one governed source retrieved with provenance, or an explicit UNAVAILABLE.",
  });

  let ordinal = 1;
  for (const entry of brains) {
    if (entry.brain === "KNOWLEDGE") continue;
    ordinal += 1;
    const caps = entry.authorizedReach.slice(0, 3);
    nodes.push({
      id: `N${ordinal}`,
      parentId: rootId,
      objective: `${getBrain(entry.brain).mandate}`,
      brain: entry.brain,
      capabilities: caps,
      dependsOn: [rootId],
      status: caps.length > 0 ? "PENDING" : "BLOCKED",
      maxRetries: 1,
      requiresApproval: getBrain(entry.brain).mode === "GOVERNED_WRITE",
      completionCriterion: getBrain(entry.brain).evaluationCriteria[0] ?? "Brain evaluation criteria satisfied.",
    });
  }

  const budget = buildBudget(request.budget, nodes.length);
  const plan: NoeliaPlan = {
    planId: request.planId,
    objective: question,
    nodes,
    budget,
    createdAt: (request.now ?? new Date()).toISOString(),
  };
  validatePlan(plan);
  const waves = planWaves(plan);

  const claims: NoeliaClaim[] = [];
  for (const entry of brains) {
    claims.push(
      makeClaim({
        id: `claim-plan-${entry.brain.toLowerCase()}`,
        kind: "INFERENCE",
        statement: `The ${entry.title} participates because the question matched its institutional mandate.`,
        brain: entry.brain,
        evidence: [`brain:${entry.brain}`],
        confidence: 0.6,
        limitation: "Keyword attribution is inspectable but coarse; a human may re-scope the council.",
      }),
    );
    if (entry.authorizedReach.length === 0) {
      claims.push(
        makeClaim({
          id: `claim-unavailable-${entry.brain.toLowerCase()}`,
          kind: "UNKNOWN",
          statement: `No authorized capability is available to the ${entry.title} for this caller.`,
          brain: entry.brain,
          evidence: [`brain:${entry.brain}`],
          confidence: null,
          limitation: "The brain's contribution is withheld by authorization, not by absence of data.",
        }),
      );
    }
  }

  const reasoning = buildReasoningSummary({
    objective: question,
    steps: [
      {
        kind: "INTENT",
        summary: `Question attributed to ${brains.length} canonical brain(s): ${brains.map((b) => b.brain).join(", ")}.`,
        evidence: brains.map((b) => `brain:${b.brain}`),
      },
      {
        kind: "DECOMPOSITION",
        summary: `Task DAG contains ${nodes.length} node(s) across ${waves.length} dependency wave(s).`,
        evidence: [`plan:${plan.planId}`],
      },
      {
        kind: "CONTEXT_SELECTION",
        summary: "Effective reach is the intersection of each brain's declared reach and the caller's authorized capabilities.",
        evidence: ["registry:authorizedToolNames"],
      },
    ],
    claims,
    unknowns: brains
      .filter((b) => b.authorizedReach.length === 0)
      .map((b) => `${b.brain}: no authorized capability`),
    limitations: [
      "This plan is not an answer. Execution, authorization and evidence persistence remain with HIVE and BEYU OS services.",
    ],
  });

  return {
    identity: NOELIA_CANONICAL_IDENTITY,
    plan,
    brains,
    waves,
    reasoning,
    degraded: brains.some((b) => b.authorizedReach.length === 0),
  };
}

/**
 * A brain may not be described as an independent assistant. The Command Centre
 * renders brain cards; this guard keeps the copy honest in one place.
 */
export function brainPresentation(entry: BrainPlanEntry): {
  heading: string;
  subtitle: string;
  status: "ACTIVE" | "DEGRADED" | "BLOCKED";
} {
  const status: "ACTIVE" | "DEGRADED" | "BLOCKED" =
    entry.authorizedReach.length === 0
      ? "BLOCKED"
      : entry.denied.length > 0
        ? "DEGRADED"
        : "ACTIVE";
  return {
    heading: `${NOELIA_CANONICAL_IDENTITY.displayName} · ${entry.title}`,
    subtitle:
      status === "BLOCKED"
        ? "No authorized capability for this caller."
        : `${entry.authorizedReach.length} of ${entry.declaredReach.length} declared capabilities authorized.`,
    status,
  };
}
