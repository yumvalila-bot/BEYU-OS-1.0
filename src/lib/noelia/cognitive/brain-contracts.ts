/**
 * NOELIA — COGNITIVE BRAIN CONTRACTS.
 *
 * EIGHT BRAINS. ONE QUEEN BEE. ONE HIVE.
 *
 * This module is the *contract layer* only. It declares what a cognitive brain
 * is, which of the eight canonical brains exist, what each one consumes and
 * produces, and which governed capabilities it may reach. It contains NO
 * runtime behaviour, NO model calls, NO database access and NO authorization
 * of its own.
 *
 * Design rule (master prompt, Part V):
 *   "Avoid eight duplicated agent frameworks. Use shared cognitive
 *    infrastructure and specialized modules."
 *
 * Therefore a brain is a *declaration* bound to the single existing HIVE
 * dispatch point (`NoeliaToolRegistry`). A brain cannot execute: only the
 * registry can, and the registry re-checks RBAC/ABAC/tenant/entity/country/
 * classification/approval on every invocation. A brain's declared capability
 * list is a *maximum reach*, never a grant — `authorizedToolNames` decides.
 *
 * A brain is never an identity. There is exactly one NOELIA identity and no
 * brain may present itself as a separate assistant.
 */

import type { PermissionCode } from "@/lib/constants";

export const NOELIA_BRAIN_IDS = [
  "EXECUTIVE",
  "INSTITUTIONAL",
  "KNOWLEDGE",
  "ANALYTICAL",
  "OPERATIONAL",
  "LEARNING",
  "COLLECTIVE",
  "PERSONAL_CONTEXT",
] as const;

export type NoeliaBrainId = (typeof NOELIA_BRAIN_IDS)[number];

/** The one canonical display name. No brain introduces a competing identity. */
export const NOELIA_CANONICAL_IDENTITY = {
  systemId: "NOELIA_AI",
  displayName: "NOELIA",
  identity: "QUEEN_BEE",
  runtime: "HIVE",
  motto: "Intelligence • Governance • Care",
} as const;

/**
 * What a brain is allowed to *do*, structurally.
 *
 * - READ_ONLY   — may assemble evidence; may not propose a write at all.
 * - ADVISORY    — may produce findings and recommendations, never a mutation.
 * - GOVERNED_WRITE — may only ever propose an action through the governed
 *                 action/workflow path (request → human approval → execute).
 *                 No brain has this today; the field exists so a future
 *                 capability must declare it explicitly rather than drift.
 */
export type BrainMode = "READ_ONLY" | "ADVISORY" | "GOVERNED_WRITE";

/** Epistemic outputs a brain may emit. Mirrors the canonical status catalogue. */
export type BrainOutputKind =
  | "FACT"
  | "INFERENCE"
  | "ASSUMPTION"
  | "PREDICTION"
  | "RECOMMENDATION"
  | "UNKNOWN"
  | "SIMULATION";

export type BrainDefinition = {
  id: NoeliaBrainId;
  /** Ordinal label used by the Command Centre ("BRAIN 01"). */
  ordinal: number;
  title: string;
  mandate: string;
  responsibilities: readonly string[];
  /** Explicit input contract — what the brain needs before it may reason. */
  inputs: readonly string[];
  /** Explicit output contract — what it must return. */
  outputs: readonly BrainOutputKind[];
  mode: BrainMode;
  /**
   * Maximum capability reach. Intersected with the caller's authorized tools
   * at runtime; never a grant on its own.
   */
  capabilityReach: readonly string[];
  /** Permission floors a caller must already hold for this brain to run. */
  requiredPermissions: readonly PermissionCode[];
  /** Memory classes this brain may read. Writes always go through governance. */
  memoryAccess: readonly ("WORKING" | "CONVERSATION" | "USER_CONTEXT" | "INSTITUTIONAL" | "DECISION" | "OPERATIONAL" | "DOCUMENT" | "CORRECTION")[];
  /** How the brain is evaluated. */
  evaluationCriteria: readonly string[];
  /** True only when the brain must never mutate authoritative institutional facts. */
  cannotAlterAuthoritativeRecords: boolean;
};

/**
 * The eight canonical brains.
 *
 * Capability reach names only capabilities that already exist in the default
 * registry, or that this change adds with the same governed contract. Nothing
 * here invents a capability id that is not registered — that would be a
 * declaration with no handler, which the registry denies (TOOL_UNREGISTERED).
 */
export const NOELIA_BRAINS: readonly BrainDefinition[] = [
  {
    id: "EXECUTIVE",
    ordinal: 1,
    title: "Executive Brain",
    mandate:
      "Prepare executive intelligence: strategic options, institutional priorities and decision-ready briefings across sector boundaries.",
    responsibilities: [
      "Strategic planning and goal decomposition",
      "Cross-sector opportunity and risk synthesis",
      "Executive briefing composition",
      "Resource prioritisation framing",
      "Decision preparation (never decision execution)",
    ],
    inputs: ["authorized question or mandate", "horizon", "resolved authorized scope", "governing objectives"],
    outputs: ["FACT", "INFERENCE", "ASSUMPTION", "RECOMMENDATION", "UNKNOWN"],
    mode: "ADVISORY",
    capabilityReach: [
      "finance.treasury.aggregate",
      "finance.capital.pipeline",
      "finance.waterfall.latest",
      "finance.cash.position",
      "risk.register.query",
      "compliance.obligation.query",
      "governance.resolution.query",
      "governance.strategic.objectives",
      "hcm.workforce.observe",
      "health.runtime.status",
      "knowledge.rag.search",
      "noelia.world_model.query",
      "noelia.decision_memory.query",
      "noelia.council.deliberate",
      "noelia.scenario.simulate",
    ],
    requiredPermissions: ["ai:executive.read"],
    memoryAccess: ["INSTITUTIONAL", "DECISION", "DOCUMENT"],
    evaluationCriteria: [
      "Every claim carries an epistemic status",
      "Recommendations name what would change them",
      "No recommendation is presented as a decision",
    ],
    cannotAlterAuthoritativeRecords: true,
  },
  {
    id: "INSTITUTIONAL",
    ordinal: 2,
    title: "Institutional Brain",
    mandate:
      "Represent BEYU's constitution, hierarchy, entity relationships, governance structures and decision history as recorded — never as assumed.",
    responsibilities: [
      "Institutional hierarchy and entity relationships",
      "Governance bodies, charters and authority relationships",
      "Policy and decision history",
      "Institutional continuity and provenance",
    ],
    inputs: ["resolved authorized scope", "entity/country context", "governing documents"],
    outputs: ["FACT", "INFERENCE", "UNKNOWN"],
    mode: "READ_ONLY",
    capabilityReach: [
      "governance.resolution.query",
      "governance.strategic.objectives",
      "noelia.world_model.query",
      "noelia.knowledge_graph.query",
      "noelia.decision_memory.query",
      "knowledge.rag.search",
    ],
    requiredPermissions: ["ai:noelia.query"],
    memoryAccess: ["INSTITUTIONAL", "DECISION"],
    evaluationCriteria: [
      "Recorded state is distinguished from derived and simulated state",
      "No entity relationship is invented",
      "Restricted personal information is never surfaced",
    ],
    cannotAlterAuthoritativeRecords: true,
  },
  {
    id: "KNOWLEDGE",
    ordinal: 3,
    title: "Knowledge Brain",
    mandate:
      "Ingest, index, retrieve and attribute governed institutional knowledge with permission filtering applied before context assembly.",
    responsibilities: [
      "Document ingestion metadata and digests",
      "Semantic and structured retrieval",
      "Source attribution and provenance",
      "Classification filtering and context-size management",
    ],
    inputs: ["question", "resolved authorized scope", "classification ceiling"],
    outputs: ["FACT", "INFERENCE", "UNKNOWN"],
    mode: "READ_ONLY",
    capabilityReach: [
      "knowledge.rag.search",
      "noelia.knowledge_graph.query",
      "noelia.decision_memory.query",
    ],
    requiredPermissions: ["ai:noelia.query"],
    memoryAccess: ["DOCUMENT", "INSTITUTIONAL", "DECISION"],
    evaluationCriteria: [
      "No unauthorized information enters model context",
      "Every retrieved passage carries source provenance",
      "Retrieval rank and excerpt hash are recorded",
    ],
    cannotAlterAuthoritativeRecords: true,
  },
  {
    id: "ANALYTICAL",
    ordinal: 4,
    title: "Analytical Brain",
    mandate:
      "Perform quantitative, financial and operational analysis over canonical specialist engines, with assumptions and limitations made explicit.",
    responsibilities: [
      "Financial and operational analysis",
      "Forecasting and scenario comparison",
      "Risk and variance analysis",
      "Assumption testing and evidence evaluation",
    ],
    inputs: ["analysis request", "horizon", "authorized metrics"],
    outputs: ["FACT", "INFERENCE", "ASSUMPTION", "PREDICTION", "SIMULATION", "UNKNOWN"],
    mode: "READ_ONLY",
    capabilityReach: [
      "analytics.run",
      "finance.treasury.aggregate",
      "finance.cash.position",
      "risk.analysis",
      "noelia.scenario.simulate",
    ],
    requiredPermissions: ["ai:analytics.read"],
    memoryAccess: ["OPERATIONAL", "INSTITUTIONAL"],
    evaluationCriteria: [
      "Missing data is UNAVAILABLE, never zero",
      "Forecasts are never presented as actuals",
      "Confidence is explainable, not a bare maximum",
    ],
    cannotAlterAuthoritativeRecords: true,
  },
  {
    id: "OPERATIONAL",
    ordinal: 5,
    title: "Operational Brain",
    mandate:
      "Coordinate governed workflows and authorized tool execution through the existing HIVE registry, workflow and scheduler services.",
    responsibilities: [
      "Workflow coordination and supervision",
      "Authorized tool execution through the registry",
      "Escalation and recovery awareness",
      "Execution verification",
    ],
    inputs: ["workflow id or capability plan", "resolved authorized scope", "approval evidence"],
    outputs: ["FACT", "UNKNOWN"],
    mode: "READ_ONLY",
    capabilityReach: [
      "noelia.operations.status",
    ],
    requiredPermissions: ["ai:workflow.run"],
    memoryAccess: ["OPERATIONAL"],
    evaluationCriteria: [
      "A tool call is never reported as success because it was issued",
      "Making and checking are separated",
      "Every transition is audited",
    ],
    cannotAlterAuthoritativeRecords: true,
  },
  {
    id: "LEARNING",
    ordinal: 6,
    title: "Learning Brain",
    mandate:
      "Evaluate quality against golden benchmarks and propose verified corrections — never silently altering authoritative facts, permissions or policy.",
    responsibilities: [
      "Evaluation runs against golden cases",
      "Error classification and regression detection",
      "Verified correction proposals (human-approved publication only)",
      "Performance measurement",
    ],
    inputs: ["evaluation dataset", "baseline results", "correction proposal"],
    outputs: ["FACT", "INFERENCE", "RECOMMENDATION"],
    mode: "READ_ONLY",
    capabilityReach: [
      "noelia.evaluation.status",
    ],
    requiredPermissions: ["ai:evaluation.read"],
    memoryAccess: ["CORRECTION", "DECISION"],
    evaluationCriteria: [
      "An improvement is measurable against a recorded baseline",
      "No learning path can rewrite governance or permissions",
      "Evaluation history is preserved",
    ],
    cannotAlterAuthoritativeRecords: true,
  },
  {
    id: "COLLECTIVE",
    ordinal: 7,
    title: "Collective Brain",
    mandate:
      "Convene independent specialist analysis, detect disagreement and reconcile evidence — without manufacturing consensus.",
    responsibilities: [
      "Multi-specialist delegation with bounded tasks",
      "Independent finding collection",
      "Contradiction and disagreement detection",
      "Reconciled synthesis with dissent preserved",
    ],
    inputs: ["institutional question", "authorized participant set", "evidence bundle"],
    outputs: ["FACT", "INFERENCE", "ASSUMPTION", "RECOMMENDATION", "UNKNOWN"],
    mode: "ADVISORY",
    capabilityReach: [
      "noelia.council.deliberate",
      "noelia.knowledge_graph.query",
    ],
    requiredPermissions: ["ai:executive.read"],
    memoryAccess: ["INSTITUTIONAL", "DECISION", "DOCUMENT"],
    evaluationCriteria: [
      "Specialist findings are evidence-based and distinct",
      "Disagreement is recorded, never averaged away",
      "Final authority remains with authorized humans",
    ],
    cannotAlterAuthoritativeRecords: true,
  },
  {
    id: "PERSONAL_CONTEXT",
    ordinal: 8,
    title: "Personal Context Brain",
    mandate:
      "Apply authorized user preferences and role-aware personal context to NOELIA's assistance without touching institutional records.",
    responsibilities: [
      "Authorized preference resolution",
      "Role-aware presentation",
      "Conversation continuity within policy",
      "Privacy boundary enforcement",
    ],
    inputs: ["principal", "user preference records", "tenant policy"],
    outputs: ["FACT", "UNKNOWN"],
    mode: "READ_ONLY",
    capabilityReach: [
      "noelia.personal_context.read",
    ],
    requiredPermissions: ["ai:noelia.query"],
    memoryAccess: ["USER_CONTEXT", "CONVERSATION", "WORKING"],
    evaluationCriteria: [
      "Personal context never enters institutional evidence",
      "Preferences can never widen authorization",
      "User-scoped reads are limited to the caller's own records",
    ],
    cannotAlterAuthoritativeRecords: true,
  },
] as const;

const BRAIN_BY_ID = new Map<NoeliaBrainId, BrainDefinition>(
  NOELIA_BRAINS.map((brain) => [brain.id, brain]),
);

export function getBrain(id: NoeliaBrainId): BrainDefinition {
  const brain = BRAIN_BY_ID.get(id);
  if (!brain) throw new Error(`Unknown NOELIA brain '${id}'.`);
  return brain;
}

/**
 * Resolve a brain's EFFECTIVE capability reach for a caller.
 *
 * The result is never wider than the brain declaration and never wider than
 * the caller's authorized capabilities. This is the single place where
 * "what the brain may reach" meets "what the human may reach".
 */
export function effectiveBrainReach(
  id: NoeliaBrainId,
  authorizedCapabilities: readonly string[],
): string[] {
  const brain = getBrain(id);
  const authorized = new Set(authorizedCapabilities);
  return brain.capabilityReach.filter((name) => authorized.has(name)).sort();
}

/** Deterministic capability→brain attribution used by the Command Centre. */
export function brainsForCapability(capability: string): NoeliaBrainId[] {
  return NOELIA_BRAINS.filter((brain) => brain.capabilityReach.includes(capability)).map(
    (brain) => brain.id,
  );
}

/**
 * A brain can never be an independent identity. Any attempt to present one as
 * such is rejected here rather than in eight separate call sites.
 */
export function assertSingleIdentity(presentedName: string): void {
  const normalised = presentedName.trim().toUpperCase();
  const allowed = new Set<string>([
    NOELIA_CANONICAL_IDENTITY.displayName,
    NOELIA_CANONICAL_IDENTITY.systemId,
  ]);
  if (!allowed.has(normalised)) {
    throw new Error(
      `NOELIA single-identity invariant: '${presentedName}' is not the canonical identity (${NOELIA_CANONICAL_IDENTITY.displayName}).`,
    );
  }
}
