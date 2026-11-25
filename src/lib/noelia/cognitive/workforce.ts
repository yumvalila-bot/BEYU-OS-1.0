import { NOELIA_BRAIN_IDS, type NoeliaBrainId } from "./brain-contracts";

/**
 * NOELIA — HIVE WORKFORCE (12 specialist capability profiles).
 *
 * A "specialist" here is NOT an agent, a process, a persona or a second
 * assistant. It is a *declaration over the one governed capability registry*:
 * a name, a mandate, the brain that owns it, and an ordered subset of registry
 * capability names it may exercise.
 *
 * Consequences that follow from that design (and are asserted by test):
 *
 *   1. A specialist can never introduce a capability that is not already
 *      registered. `resolveWorkforceReach` intersects with the live registry.
 *   2. A specialist inherits RBAC / ABAC / tenant / entity / country /
 *      classification / approval / audit with no extra code, because it
 *      dispatches through `NoeliaToolRegistry.invoke` like everything else.
 *   3. A specialist cannot widen authority by delegating. Delegation is an
 *      INTERSECTION, never a union.
 *   4. `mayPost` is false for all twelve. No workforce member can reach
 *      `CAP_POSTING` or any write capability.
 *
 * Adding a specialist is therefore a reviewed change to this file, not a new
 * runtime.
 */

export type WorkforceSupervision = "READ_ONLY" | "ADVISORY" | "ADVISORY_HUMAN_REVIEW";

export type WorkforceProfile = {
  /** Stable code, used for audit and for UI keys. */
  code: string;
  /** Human-facing role name. Never presented as a separate AI identity. */
  title: string;
  /** The brain that owns this specialism. */
  brain: NoeliaBrainId;
  /** What this specialist is for. Rendered verbatim in the Command Centre. */
  mandate: string;
  /** Ordered capability names. Each MUST resolve in the live registry. */
  capabilities: readonly string[];
  supervision: WorkforceSupervision;
  /**
   * Highest risk class this specialist may exercise. A `LOW` specialist can
   * only call `risk: "LOW"` capabilities even if its list names a higher one —
   * the registry re-checks and the reach resolver filters.
   */
  riskCeiling: "LOW" | "MEDIUM";
  /** Present for completeness and to make the answer auditable: always false. */
  mayPost: false;
  /** Whether this specialist may propose (not start) a workflow. */
  mayProposeWorkflow: boolean;
};

/**
 * The twelve specialists.
 *
 * Capability names are drawn from the existing registry only. Where a mandate
 * needs a capability this repository does not have (for example a dedicated
 * treasury-observation capability), the specialist declares the closest real
 * capability instead of inventing one — and the mandate wording is kept honest
 * to that.
 */
export const HIVE_WORKFORCE_PROFILES: readonly WorkforceProfile[] = [
  {
    code: "FINANCIAL_ANALYST",
    title: "Financial Analyst",
    brain: "ANALYTICAL",
    mandate:
      "Read recorded financial position, variance and budget-versus-actual posture. Reports what Finance OS records; never estimates a missing figure and never posts a ledger entry.",
    capabilities: ["finance.cash.position", "finance.treasury.aggregate", "finance.reconciliation.status", "analytics.run"],
    supervision: "ADVISORY_HUMAN_REVIEW",
    riskCeiling: "LOW",
    mayPost: false,
    mayProposeWorkflow: true,
  },
  {
    code: "RISK_ANALYST",
    title: "Risk Analyst",
    brain: "ANALYTICAL",
    mandate:
      "Summarize registered risk exposure, concentration and control state. Cannot accept, mitigate, close or reassign a risk.",
    capabilities: ["risk.register.query", "risk.analysis"],
    supervision: "ADVISORY",
    riskCeiling: "LOW",
    mayPost: false,
    mayProposeWorkflow: true,
  },
  {
    code: "COMPLIANCE_OFFICER",
    title: "Compliance Officer",
    brain: "INSTITUTIONAL",
    mandate:
      "Report obligations, control effectiveness and open findings. Cannot close a finding, file a return or submit a regulatory response.",
    capabilities: ["compliance.obligation.query", "compliance.analysis"],
    supervision: "ADVISORY_HUMAN_REVIEW",
    riskCeiling: "LOW",
    mayPost: false,
    mayProposeWorkflow: true,
  },
  {
    code: "GOVERNANCE_ANALYST",
    title: "Governance Analyst",
    brain: "INSTITUTIONAL",
    mandate:
      "Explain recorded resolutions, delegations and strategic objectives. Cannot alter an instrument, create a resolution or change a delegation.",
    capabilities: ["governance.resolution.query", "governance.strategic.objectives", "legal.knowledge.query"],
    supervision: "ADVISORY_HUMAN_REVIEW",
    riskCeiling: "LOW",
    mayPost: false,
    mayProposeWorkflow: true,
  },
  {
    code: "KNOWLEDGE_LIBRARIAN",
    title: "Knowledge Librarian",
    brain: "KNOWLEDGE",
    mandate:
      "Retrieve governed knowledge with provenance and report source health. Retrieval is authorization-filtered in SQL before any text is assembled into context.",
    capabilities: ["knowledge.rag.search", "legal.knowledge.query", "tax.knowledge.query"],
    supervision: "READ_ONLY",
    riskCeiling: "LOW",
    mayPost: false,
    mayProposeWorkflow: false,
  },
  {
    code: "OPERATIONS_COORDINATOR",
    title: "Operations Coordinator",
    brain: "OPERATIONAL",
    mandate:
      "Report workflow state, current step and blockers. Cannot advance, approve, retry or cancel a workflow instance.",
    capabilities: ["noelia.operations.status", "noelia.personal_context.read"],
    supervision: "READ_ONLY",
    riskCeiling: "LOW",
    mayPost: false,
    mayProposeWorkflow: false,
  },
  {
    code: "STRATEGIC_PLANNER",
    title: "Strategic Planner",
    brain: "EXECUTIVE",
    mandate:
      "Frame objectives, options and trade-offs as advisory recommendations with stated assumptions and what-would-change-this.",
    capabilities: ["governance.strategic.objectives", "noelia.scenario.simulate", "risk.register.query", "finance.capital.pipeline"],
    supervision: "ADVISORY_HUMAN_REVIEW",
    riskCeiling: "LOW",
    mayPost: false,
    mayProposeWorkflow: true,
  },
  {
    code: "INSTITUTIONAL_HISTORIAN",
    title: "Institutional Historian",
    brain: "INSTITUTIONAL",
    mandate:
      "Recall predecessor decisions, supersession chains and recorded precedent. Distinguishes a recorded decision from an AI inference without exception.",
    capabilities: ["noelia.decision_memory.query", "noelia.knowledge_graph.query", "governance.resolution.query", "noelia.world_model.query"],
    supervision: "READ_ONLY",
    riskCeiling: "LOW",
    mayPost: false,
    mayProposeWorkflow: false,
  },
  {
    code: "TREASURY_OBSERVER",
    title: "Treasury Observer",
    brain: "ANALYTICAL",
    mandate:
      "Observe recorded liquidity and obligation posture. Cannot move funds, initiate a payment, draw a facility or post to a ledger.",
    capabilities: ["finance.cash.position", "finance.maturity.profile", "finance.treasury.aggregate", "finance.fx.view"],
    supervision: "READ_ONLY",
    riskCeiling: "LOW",
    mayPost: false,
    mayProposeWorkflow: false,
  },
  {
    code: "WORKFORCE_ANALYST",
    title: "Workforce Analyst",
    brain: "PERSONAL_CONTEXT",
    mandate:
      "Report headcount and capability coverage from the unified employee master. Cannot create, change or terminate an employment record.",
    capabilities: ["hcm.workforce.observe", "hcm.employee.aggregate", "hcm.turnover.analyze"],
    supervision: "READ_ONLY",
    riskCeiling: "LOW",
    mayPost: false,
    mayProposeWorkflow: false,
  },
  {
    code: "SECTOR_SPECIALIST",
    title: "Sector Specialist",
    brain: "ANALYTICAL",
    mandate:
      "Compare sector posture across HEALTH_OS, FINANCE_OS, AGRICULTURE_OS and UJENZI_OS strictly within the caller's authorized sector scope. No cross-OS data shortcut exists.",
    capabilities: ["cross.os.intelligence", "analytics.run", "agriculture.export.analytics"],
    supervision: "READ_ONLY",
    riskCeiling: "LOW",
    mayPost: false,
    mayProposeWorkflow: false,
  },
  {
    code: "EVIDENCE_AUDITOR",
    title: "Evidence Auditor",
    brain: "LEARNING",
    mandate:
      "Check provenance completeness and surface contradictions between claims. May annotate a finding; may never suppress, delete or overwrite another specialist's finding.",
    capabilities: [
      "noelia.evaluation.status",
      "noelia.decision_memory.query",
      "noelia.knowledge_graph.query",
      "memory.read",
      "noelia.world_model.query",
    ],
    supervision: "READ_ONLY",
    riskCeiling: "LOW",
    mayPost: false,
    mayProposeWorkflow: false,
  },
];

/** Minimum shape of the registry this module needs — avoids a circular import. */
export type WorkforceCapabilityIndex = {
  /** Names actually registered in the live registry. */
  registered: ReadonlySet<string>;
  /** Risk class per registered capability, when known. */
  riskOf: (capability: string) => "LOW" | "MEDIUM" | "HIGH" | null;
};

/**
 * The capabilities a specialist may ACTUALLY exercise for this caller.
 *
 * Three-way intersection:
 *   declared capabilities  ∩  capabilities registered  ∩  caller authorized
 *
 * A capability appears only if all three hold. A capability the specialist
 * declares but the registry no longer exposes is silently dropped here and
 * reported as `unresolved` by {@link auditWorkforceProfiles} so the drift is
 * visible rather than assumed away.
 */
export function resolveWorkforceReach(
  profile: WorkforceProfile,
  callerAuthorized: readonly string[],
  index: WorkforceCapabilityIndex,
): string[] {
  const authorized = new Set(callerAuthorized);
  const ceilingRank = profile.riskCeiling === "LOW" ? 0 : 1;
  const rank = (risk: "LOW" | "MEDIUM" | "HIGH" | null) =>
    risk === "LOW" ? 0 : risk === "MEDIUM" ? 1 : risk === "HIGH" ? 2 : 99;

  return profile.capabilities.filter((capability) => {
    if (!authorized.has(capability)) return false;
    if (!index.registered.has(capability)) return false;
    return rank(index.riskOf(capability)) <= ceilingRank;
  });
}

/**
 * Structural audit of the roster. Returns the declared-but-missing capability
 * names per specialist. Used by the Command Centre (to render an honest gap)
 * and by tests (to fail the build when the roster drifts from the registry).
 */
export function auditWorkforceProfiles(index: WorkforceCapabilityIndex): {
  profileCode: string;
  unresolved: string[];
}[] {
  return HIVE_WORKFORCE_PROFILES.map((profile) => ({
    profileCode: profile.code,
    unresolved: profile.capabilities.filter((capability) => !index.registered.has(capability)),
  })).filter((entry) => entry.unresolved.length > 0);
}

/**
 * Delegation is an intersection, never a union.
 *
 * A specialist delegating to another specialist receives the capabilities
 * BOTH hold for this caller. This is what stops a low-privilege specialist
 * from being used as a proxy to reach a high-privilege one.
 */
export function intersectDelegationReach(
  delegatorReach: readonly string[],
  delegateReach: readonly string[],
): string[] {
  const delegate = new Set(delegateReach);
  // A set, not a filter: a capability appearing twice in the delegator's list
  // must not produce a duplicate grant. Order follows the delegator's list so
  // the result is deterministic and easy to audit.
  return [...new Set(delegatorReach)].filter((capability) => delegate.has(capability));
}

/**
 * Guard used by the Command Centre and by tests: every specialist must be
 * owned by a declared brain, and no specialist may claim posting authority.
 */
export function assertWorkforceIntegrity(): void {
  const seen = new Set<string>();
  for (const profile of HIVE_WORKFORCE_PROFILES) {
    if (seen.has(profile.code)) {
      throw new Error(`Duplicate workforce specialist code: ${profile.code}`);
    }
    seen.add(profile.code);
    if (!NOELIA_BRAIN_IDS.includes(profile.brain)) {
      throw new Error(`Workforce specialist ${profile.code} references undeclared brain: ${profile.brain}`);
    }
    if (profile.mayPost !== false) {
      throw new Error(`Workforce specialist ${profile.code} must not be able to post.`);
    }
    if (profile.capabilities.length === 0) {
      throw new Error(`Workforce specialist ${profile.code} declares no capabilities.`);
    }
  }
  if (HIVE_WORKFORCE_PROFILES.length !== 12) {
    throw new Error(
      `HIVE workforce must declare exactly 12 specialists; found ${HIVE_WORKFORCE_PROFILES.length}.`,
    );
  }
}

/** Convenience: does this caller hold ANY capability for the specialist? */
export function isWorkforceProfileReachable(profile: WorkforceProfile, callerAuthorized: readonly string[]): boolean {
  const authorized = new Set(callerAuthorized);
  return profile.capabilities.some((capability) => authorized.has(capability));
}

