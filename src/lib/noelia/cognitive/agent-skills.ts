import { NOELIA_BRAIN_IDS, type NoeliaBrainId } from "./brain-contracts";
import { HIVE_WORKFORCE_PROFILES, type WorkforceCapabilityIndex } from "./workforce";

/**
 * NOELIA — AGENT SKILLS (SPECIFY → PLAN → BUILD → TEST → REVIEW → SIMPLIFY → SHIP).
 *
 * This extends the HIVE workforce registry. It is deliberately NOT a second
 * registry, a second agent runtime, or a plugin system:
 *
 *   - A *skill* is a declaration over the same governed capabilities a
 *     *specialist* uses. It adds one thing the workforce does not model: an
 *     ordered lifecycle with an explicit completion state per stage, and a
 *     hard stop at the human gate.
 *   - A skill may only name capabilities that at least one declared specialist
 *     already holds. That makes the skill set a *subset* of existing authority,
 *     so introducing a skill can never widen what NOELIA can reach.
 *   - A skill never executes. It records where a piece of work stands, so the
 *     Command Centre can show an honest state instead of an implied "done".
 *
 * The lifecycle stops at SHIP. There is no AUTOMERGE, DEPLOY or PUBLISH stage,
 * because those are human decisions. `SHIP` means "ready for a human to merge",
 * and `humanGate` is the field that says so.
 */

/** The seven stages, in order. Index order is the sequence; there is no other. */
export const SKILL_LIFECYCLE_STAGES = [
  "SPECIFY",
  "PLAN",
  "BUILD",
  "TEST",
  "REVIEW",
  "SIMPLIFY",
  "SHIP",
] as const;

export type SkillLifecycleStage = (typeof SKILL_LIFECYCLE_STAGES)[number];

/**
 * How far a piece of skill work has actually got.
 *
 * `BLOCKED` is a first-class state, not an error: work that cannot proceed for a
 * reason outside the agent's control must be representable, or it will be
 * reported as merely pending.
 */
export type SkillStageState = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED" | "SKIPPED";

export type SkillStageRecord = {
  stage: SkillLifecycleStage;
  state: SkillStageState;
  /** Optional evidence pointer (a path, a test name, a command). Never a claim. */
  evidence: string | null;
  /** Required when state is BLOCKED — the reason work cannot proceed. */
  blockedReason: string | null;
};

export type AgentSkill = {
  /** Stable code, used for audit and UI keys. */
  code: string;
  title: string;
  /** The brain that owns this skill, same vocabulary as the workforce. */
  brain: NoeliaBrainId;
  /** What the skill produces. Rendered verbatim; must not overclaim. */
  purpose: string;
  /** Capability names. Each MUST be held by at least one declared specialist. */
  capabilities: readonly string[];
  /** The seven stage records. Always all seven, always in order. */
  lifecycle: readonly SkillStageRecord[];
  /**
   * Whether the work behind this skill has reached a human merge gate.
   * NEVER set by the agent to `true` to mean "shipped": it means "a human may
   * now decide". The field is named for the gate, not for the outcome.
   */
  readyForHumanGate: boolean;
};

/** The canonical stage order, exported so callers never re-derive it. */
export function stageIndex(stage: SkillLifecycleStage): number {
  return SKILL_LIFECYCLE_STAGES.indexOf(stage);
}

const ALL_STAGES = SKILL_LIFECYCLE_STAGES;

/** Build the seven stage records from a partial map, defaulting every gap to NOT_STARTED. */
function stages(
  overrides: Partial<Record<SkillLifecycleStage, Partial<Omit<SkillStageRecord, "stage">>>>,
): SkillStageRecord[] {
  return ALL_STAGES.map((stage) => {
    const provided = overrides[stage];
    return {
      stage,
      state: provided?.state ?? "NOT_STARTED",
      evidence: provided?.evidence ?? null,
      blockedReason: provided?.blockedReason ?? null,
    };
  });
}

/**
 * The skill catalogue.
 *
 * Each entry describes real work in this repository. Where a stage was never
 * reached, it says NOT_STARTED or BLOCKED rather than implying completion —
 * this catalogue is read by the Command Centre and must be safe to trust.
 */
export const AGENT_SKILLS: readonly AgentSkill[] = [
  {
    code: "ZERO_COST_MODEL_GOVERNANCE",
    title: "Zero-cost model governance",
    brain: "INSTITUTIONAL",
    purpose:
      "Declare the cost class of every executable model, refuse execution unless the zero-cost verdict is ALLOWED, and keep paid or unverified models visible instead of silently absent.",
    capabilities: ["noelia.operations.status", "analytics.run"],
    lifecycle: stages({
      SPECIFY: { state: "COMPLETE", evidence: "docs/noelia/NOELIA_ZERO_COST_VERIFICATION.md" },
      PLAN: { state: "COMPLETE", evidence: "drizzle/0086_zero_cost_model_policy_and_local_embeddings.sql" },
      BUILD: { state: "COMPLETE", evidence: "src/lib/noelia/zero-cost-policy.ts, model-gateway.ts" },
      TEST: { state: "COMPLETE", evidence: "tests/noelia/zero-cost-policy.test.ts (25), ollama-gateway.test.ts (18)" },
      REVIEW: { state: "IN_PROGRESS", evidence: "docs/noelia/NOELIA_ZERO_COST_VERIFICATION.md §7" },
      // REVIEW is still open (independent review is a human act), so SIMPLIFY is
      // not claimed complete: the lifecycle is ordered and the catalogue must
      // show the real frontier rather than the intended one.
      SIMPLIFY: { state: "NOT_STARTED", evidence: null },
      SHIP: { state: "BLOCKED", evidence: null, blockedReason: "Awaiting human merge review; agents do not merge." },
    }),
    readyForHumanGate: true,
  },
  {
    code: "LOCAL_SEMANTIC_RETRIEVAL",
    title: "Local semantic and hybrid retrieval",
    brain: "KNOWLEDGE",
    purpose:
      "Rank governed knowledge sources by meaning using an in-process lexical embedding, combined with PostgreSQL full-text search, with no network call and no paid vector store.",
    capabilities: ["knowledge.rag.search", "analytics.run"],
    lifecycle: stages({
      SPECIFY: { state: "COMPLETE", evidence: "docs/noelia/NOELIA_ACCEPTANCE_MATRIX.md" },
      PLAN: { state: "COMPLETE", evidence: "embeddings.ts + 0086 pg_trgm index" },
      BUILD: { state: "COMPLETE", evidence: "src/lib/noelia/embeddings.ts, knowledge-retrieval.ts" },
      TEST: { state: "COMPLETE", evidence: "embeddings.test.ts (25), knowledge-retrieval.test.ts (18)" },
      REVIEW: { state: "IN_PROGRESS", evidence: "limitation recorded: synonyms are not resolved" },
      SIMPLIFY: { state: "NOT_STARTED", evidence: null },
      SHIP: { state: "BLOCKED", evidence: null, blockedReason: "Awaiting human merge review." },
    }),
    readyForHumanGate: true,
  },
  {
    code: "LOCAL_INFERENCE_VERIFICATION",
    title: "Local inference verification",
    brain: "KNOWLEDGE",
    purpose:
      "Prove that a self-hosted model can answer through the governed gateway, or record precisely why it cannot.",
    capabilities: ["noelia.evaluation.status", "noelia.operations.status"],
    lifecycle: stages({
      SPECIFY: { state: "COMPLETE", evidence: "docs/noelia/NOELIA_ZERO_COST_VERIFICATION.md §5" },
      PLAN: { state: "COMPLETE", evidence: "BeyuOllamaProvider adapter + NOT_CONNECTED status" },
      BUILD: { state: "COMPLETE", evidence: "src/lib/noelia/ollama-provider.ts" },
      TEST: {
        state: "BLOCKED",
        evidence: "tests/noelia/ollama-gateway.test.ts exercises HTTP doubles only",
        blockedReason:
          "No Ollama runtime and no model weights in this environment (verified: no listener on :11434). No inference has ever executed, so the adapter cannot be reported VERIFIED.",
      },
      REVIEW: { state: "NOT_STARTED", evidence: null },
      SIMPLIFY: { state: "NOT_STARTED", evidence: null },
      SHIP: { state: "BLOCKED", evidence: null, blockedReason: "Depends on TEST, which is blocked by the missing runtime." },
    }),
    readyForHumanGate: false,
  },
  {
    code: "TENANT_ISOLATION_HARDENING",
    title: "Tenant isolation hardening",
    brain: "INSTITUTIONAL",
    purpose:
      "Keep every governed read inside the caller's authorized tenant set, enforced by bound parameters and row-level security rather than application-side filtering.",
    capabilities: ["governance.resolution.query", "analytics.run"],
    lifecycle: stages({
      SPECIFY: { state: "COMPLETE", evidence: "docs/noelia/NOELIA_SECURITY_MODEL.md" },
      PLAN: { state: "COMPLETE", evidence: "FORCE RLS + 4 tenant-scoped policies on new table" },
      BUILD: { state: "COMPLETE", evidence: "drizzle/0086 (RLS), src/lib/scope-service.ts" },
      TEST: { state: "COMPLETE", evidence: "tests/noelia/database-security.test.ts, zero-cost-migration-contract.test.ts" },
      REVIEW: { state: "IN_PROGRESS", evidence: "hand-built sql.raw replaced with inArray bound parameters" },
      SIMPLIFY: { state: "NOT_STARTED", evidence: null },
      SHIP: { state: "BLOCKED", evidence: null, blockedReason: "Awaiting human merge review." },
    }),
    readyForHumanGate: true,
  },
] as const;

/**
 * Every capability a skill may name is one a declared specialist already holds.
 *
 * This is the property that makes adding a skill a non-event for authority: the
 * skill set is bounded by the workforce set, which is bounded by the live
 * registry, which is bounded by the caller's grants.
 */
export function skillCapabilitiesWithinWorkforce(): {
  code: string;
  unheld: string[];
}[] {
  const held = new Set(HIVE_WORKFORCE_PROFILES.flatMap((profile) => [...profile.capabilities]));
  return AGENT_SKILLS.map((skill) => ({
    code: skill.code,
    unheld: skill.capabilities.filter((capability) => !held.has(capability)),
  })).filter((entry) => entry.unheld.length > 0);
}

/** The stage a skill has actually reached — the furthest stage marked COMPLETE. */
export function furthestCompleteStage(skill: AgentSkill): SkillLifecycleStage | null {
  let furthest: SkillLifecycleStage | null = null;
  for (const record of skill.lifecycle) {
    if (record.state === "COMPLETE") furthest = record.stage;
  }
  return furthest;
}

/**
 * The lifecycle is ordered, so a stage cannot be COMPLETE while an earlier one
 * is not. Without this check a skill could report SHIP complete while BUILD was
 * never started, which is exactly the sort of claim this catalogue exists to
 * prevent. BLOCKED and SKIPPED earlier stages are permitted to unblock a later
 * COMPLETE only when the later stage does not depend on them — which cannot be
 * proven here, so they do not: an earlier BLOCKED forbids a later COMPLETE
 * unless the later stage is itself BLOCKED.
 */
export function assertSkillLifecycleOrder(skill: AgentSkill): void {
  let seenIncomplete: SkillLifecycleStage | null = null;
  for (const record of skill.lifecycle) {
    if (seenIncomplete && record.state === "COMPLETE") {
      throw new Error(
        `Skill ${skill.code} marks ${record.stage} COMPLETE while the earlier stage ${seenIncomplete} is not complete.`,
      );
    }
    if (record.state !== "COMPLETE" && !seenIncomplete) {
      seenIncomplete = record.stage;
    }
    if (record.state === "BLOCKED" && !record.blockedReason) {
      throw new Error(`Skill ${skill.code} stage ${record.stage} is BLOCKED without a reason.`);
    }
  }
}

/**
 * Guard used by the Command Centre and by tests.
 *
 * Checks structure, ordering, capability containment and the human gate. It does
 * not check that the evidence is true — a guard cannot verify a claim, and
 * pretending otherwise is how false confidence gets into a system.
 */
export function assertSkillRegistryIntegrity(
  index: WorkforceCapabilityIndex,
  skills: readonly AgentSkill[] = AGENT_SKILLS,
): void {
  const codes = new Set<string>();
  for (const skill of skills) {
    if (codes.has(skill.code)) throw new Error(`Duplicate skill code: ${skill.code}`);
    codes.add(skill.code);

    if (!NOELIA_BRAIN_IDS.includes(skill.brain)) {
      throw new Error(`Skill ${skill.code} references undeclared brain: ${skill.brain}`);
    }
    if (skill.capabilities.length === 0) {
      throw new Error(`Skill ${skill.code} declares no capabilities.`);
    }
    // Every declared capability must exist in the LIVE registry, not just in the
    // workforce list. A skill naming a capability nobody registered is a claim
    // with no implementation behind it.
    const unregistered = skill.capabilities.filter((capability) => !index.registered.has(capability));
    if (unregistered.length > 0) {
      throw new Error(`Skill ${skill.code} names unregistered capabilities: ${unregistered.join(", ")}`);
    }
    if (skill.lifecycle.length !== SKILL_LIFECYCLE_STAGES.length) {
      throw new Error(`Skill ${skill.code} must declare exactly ${SKILL_LIFECYCLE_STAGES.length} stages.`);
    }
    const declaredOrder = skill.lifecycle.map((record) => record.stage);
    if (declaredOrder.join(",") !== SKILL_LIFECYCLE_STAGES.join(",")) {
      throw new Error(`Skill ${skill.code} declares its stages out of order.`);
    }
    assertSkillLifecycleOrder(skill);
    // The gate is only reachable if the final stage is not merely NOT_STARTED.
    if (skill.readyForHumanGate && skill.lifecycle.some((r) => r.stage === "SHIP" && r.state === "NOT_STARTED")) {
      throw new Error(`Skill ${skill.code} claims readiness for the human gate without reaching SHIP.`);
    }
  }

  const leaking = skillCapabilitiesWithinWorkforce();
  if (leaking.length > 0) {
    throw new Error(
      `Skills name capabilities no specialist holds: ${leaking.map((l) => `${l.code}(${l.unheld.join("/")})`).join("; ")}`,
    );
  }
}

/**
 * Summary for the Command Centre: one row per skill, with the honest stage.
 * `atHumanGate` is derived, never stored, so it cannot drift from the stages.
 */
export function skillRegistrySummary(): {
  code: string;
  title: string;
  brain: NoeliaBrainId;
  reached: SkillLifecycleStage | null;
  blockedStages: SkillLifecycleStage[];
  atHumanGate: boolean;
}[] {
  return AGENT_SKILLS.map((skill) => {
    const reached = furthestCompleteStage(skill);
    const blockedStages = skill.lifecycle.filter((r) => r.state === "BLOCKED").map((r) => r.stage);
    return {
      code: skill.code,
      title: skill.title,
      brain: skill.brain,
      reached,
      blockedStages,
      atHumanGate: skill.readyForHumanGate && reached === "SIMPLIFY",
    };
  });
}
