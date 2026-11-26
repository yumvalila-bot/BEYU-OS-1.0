/**
 * NOELIA — GOVERNED REASONING AND PLANNING ENGINE.
 *
 * Implements the auditable half of the reasoning pipeline (master prompt
 * Part VII). It produces a *plan* and a *reasoning summary* — never private
 * chain-of-thought.
 *
 * What this module is:
 *   • a dependency-aware task DAG with explicit contracts per node,
 *   • a deterministic scheduler (topological waves) with cycle detection,
 *   • a typed epistemic claim model that makes FACT / INFERENCE / ASSUMPTION /
 *     PREDICTION / RECOMMENDATION / UNKNOWN / SIMULATION structurally distinct,
 *   • a budget that bounds node count, depth and delegation.
 *
 * What this module is NOT:
 *   • an executor. It never calls a tool, never touches the database and never
 *     authorizes anything. HIVE's registry executes; this only plans.
 *
 * Design rule: every claim carries evidence references and a confidence. A
 * claim whose kind is not FACT may never be rendered as one — `renderClaim`
 * prefix-tags it, and `assertNotPresentedAsFact` fails closed.
 */

import type { NoeliaBrainId } from "./brain-contracts";
import { NOELIA_BRAIN_IDS } from "./brain-contracts";

/* ------------------------------------------------------------------ claims */

export const NOELIA_CLAIM_KINDS = [
  "FACT",
  "INFERENCE",
  "ASSUMPTION",
  "PREDICTION",
  "RECOMMENDATION",
  "UNKNOWN",
  "SIMULATION",
] as const;

export type NoeliaClaimKind = (typeof NOELIA_CLAIM_KINDS)[number];

export type NoeliaClaim = {
  id: string;
  kind: NoeliaClaimKind;
  statement: string;
  /** Capability names or record references that support this claim. */
  evidence: string[];
  /** 0..1. Null means "the producer declined to estimate" — never 0 by default. */
  confidence: number | null;
  /** Which brain produced it. */
  brain: NoeliaBrainId;
  /** Populated for RECOMMENDATION: what would change the recommendation. */
  whatWouldChange?: string[];
  /** Populated for ASSUMPTION/PREDICTION/SIMULATION: explicit boundary. */
  limitation?: string;
};

const CLAIM_PREFIX: Record<NoeliaClaimKind, string> = {
  FACT: "",
  INFERENCE: "Inference: ",
  ASSUMPTION: "Assumption: ",
  PREDICTION: "Prediction: ",
  RECOMMENDATION: "Recommendation: ",
  UNKNOWN: "Unknown: ",
  SIMULATION: "Simulated (not a record): ",
};

function clampConfidence(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));
}

export function makeClaim(input: {
  id: string;
  kind: NoeliaClaimKind;
  statement: string;
  brain: NoeliaBrainId;
  evidence?: string[];
  confidence?: number | null;
  whatWouldChange?: string[];
  limitation?: string;
}): NoeliaClaim {
  const statement = input.statement.trim();
  if (statement.length === 0) throw new Error("A claim must state something.");
  if (input.kind === "FACT" && (input.evidence ?? []).length === 0) {
    // A fact with no evidence reference is an assertion. Fail closed.
    throw new Error(`FACT claim '${input.id}' requires at least one evidence reference.`);
  }
  if (input.kind === "RECOMMENDATION" && (input.whatWouldChange ?? []).length === 0) {
    throw new Error(`RECOMMENDATION '${input.id}' must state what would change it.`);
  }
  return {
    id: input.id,
    kind: input.kind,
    statement,
    evidence: [...(input.evidence ?? [])],
    confidence: clampConfidence(input.confidence ?? null),
    brain: input.brain,
    ...(input.whatWouldChange ? { whatWouldChange: [...input.whatWouldChange] } : {}),
    ...(input.limitation ? { limitation: input.limitation } : {}),
  };
}

/** Render a claim so its epistemic status is visible in prose. */
export function renderClaim(claim: NoeliaClaim): string {
  return `${CLAIM_PREFIX[claim.kind]}${claim.statement}`;
}

/**
 * Guard: a non-fact claim must never be emitted through a fact-only channel.
 * Callers that persist authoritative "observed facts" use this.
 */
export function assertNotPresentedAsFact(claims: readonly NoeliaClaim[]): void {
  const offending = claims.filter((claim) => claim.kind !== "FACT");
  if (offending.length > 0) {
    throw new Error(
      `Epistemic violation: ${offending.map((c) => `${c.id}(${c.kind})`).join(", ")} cannot be presented as fact.`,
    );
  }
}

/**
 * Group claims by kind. Used by synthesis so a reader can see, at a glance,
 * which statements are observed and which are reasoned.
 */
export function groupClaims(claims: readonly NoeliaClaim[]): Record<NoeliaClaimKind, NoeliaClaim[]> {
  const out = Object.fromEntries(NOELIA_CLAIM_KINDS.map((kind) => [kind, [] as NoeliaClaim[]])) as Record<
    NoeliaClaimKind,
    NoeliaClaim[]
  >;
  for (const claim of claims) out[claim.kind].push(claim);
  return out;
}

/* ---------------------------------------------------------------- plan DAG */

export type NoeliaPlanNode = {
  id: string;
  /** null for roots. */
  parentId: string | null;
  objective: string;
  /** The brain that owns this node. */
  brain: NoeliaBrainId;
  /** Capabilities this node intends to use. Registered-capability names only. */
  capabilities: string[];
  /** Node ids that must complete first. */
  dependsOn: string[];
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED" | "BLOCKED";
  /** How many times the node may be retried on failure. */
  maxRetries: number;
  /** True when the node may not run without human approval evidence. */
  requiresApproval: boolean;
  /** Human-readable completion criterion — checked by the supervisor, not here. */
  completionCriterion: string;
};

export type NoeliaTaskBudget = {
  maxNodes: number;
  maxDepth: number;
  maxDelegationsPerNode: number;
};

export const DEFAULT_TASK_BUDGET: NoeliaTaskBudget = {
  maxNodes: 12,
  maxDepth: 4,
  maxDelegationsPerNode: 3,
};

export type NoeliaPlan = {
  planId: string;
  objective: string;
  nodes: NoeliaPlanNode[];
  budget: NoeliaTaskBudget;
  createdAt: string;
};

/**
 * Validate a plan against its budget and structure.
 *
 * Enforced, all fail-closed:
 *  • every id unique,
 *  • every parentId/dependsOn resolves,
 *  • no dependency cycles (a cycle is an unplannable deadlock),
 *  • depth within budget,
 *  • node count within budget,
 *  • a node may not depend on itself,
 *  • brain ids are canonical.
 */
export function validatePlan(plan: NoeliaPlan): void {
  if (plan.nodes.length === 0) throw new Error("A plan must contain at least one node.");
  if (plan.nodes.length > plan.budget.maxNodes) {
    throw new Error(`Plan exceeds node budget (${plan.nodes.length} > ${plan.budget.maxNodes}).`);
  }
  const ids = new Set<string>();
  for (const node of plan.nodes) {
    if (ids.has(node.id)) throw new Error(`Duplicate plan node id '${node.id}'.`);
    ids.add(node.id);
    if (!NOELIA_BRAIN_IDS.includes(node.brain)) {
      throw new Error(`Plan node '${node.id}' names a non-canonical brain '${node.brain}'.`);
    }
    if (node.dependsOn.includes(node.id)) {
      throw new Error(`Plan node '${node.id}' depends on itself.`);
    }
    for (const dep of node.dependsOn) {
      if (!plan.nodes.some((n) => n.id === dep)) {
        throw new Error(`Plan node '${node.id}' depends on unknown node '${dep}'.`);
      }
    }
    if (node.parentId !== null && !plan.nodes.some((n) => n.id === node.parentId)) {
      throw new Error(`Plan node '${node.id}' references unknown parent '${node.parentId}'.`);
    }
  }

  // Depth via parent chain.
  const byId = new Map(plan.nodes.map((n) => [n.id, n]));
  for (const node of plan.nodes) {
    let depth = 1;
    let cursor = node.parentId;
    const seen = new Set<string>([node.id]);
    while (cursor) {
      if (seen.has(cursor)) throw new Error(`Parent cycle detected at '${node.id}'.`);
      seen.add(cursor);
      depth += 1;
      if (depth > plan.budget.maxDepth) {
        throw new Error(`Plan node '${node.id}' exceeds depth budget (${plan.budget.maxDepth}).`);
      }
      cursor = byId.get(cursor)?.parentId ?? null;
    }
  }

  // Dependency cycles via DFS colouring.
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (id: string): void => {
    const colour = state.get(id) ?? 0;
    if (colour === 1) throw new Error(`Dependency cycle detected at '${id}'.`);
    if (colour === 2) return;
    state.set(id, 1);
    for (const dep of byId.get(id)?.dependsOn ?? []) visit(dep);
    state.set(id, 2);
  };
  for (const node of plan.nodes) visit(node.id);

  // Delegation bound: a node may not fan out beyond budget.
  const children = new Map<string, number>();
  for (const node of plan.nodes) {
    if (!node.parentId) continue;
    children.set(node.parentId, (children.get(node.parentId) ?? 0) + 1);
  }
  for (const [parentId, count] of children) {
    if (count > plan.budget.maxDelegationsPerNode) {
      throw new Error(
        `Plan node '${parentId}' delegates ${count} children, exceeding budget ${plan.budget.maxDelegationsPerNode}.`,
      );
    }
  }
}

/**
 * Deterministic execution waves: each wave contains only nodes whose
 * dependencies are satisfied by earlier waves. Validates first.
 */
export function planWaves(plan: NoeliaPlan): NoeliaPlanNode[][] {
  validatePlan(plan);
  const remaining = new Map(plan.nodes.map((n) => [n.id, n]));
  const done = new Set<string>();
  const waves: NoeliaPlanNode[][] = [];
  let guard = 0;
  while (remaining.size > 0) {
    guard += 1;
    if (guard > plan.nodes.length + 1) throw new Error("Plan scheduling did not converge.");
    const ready = [...remaining.values()]
      .filter((node) => node.dependsOn.every((dep) => done.has(dep)))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (ready.length === 0) throw new Error("Plan has unsatisfiable dependencies.");
    waves.push(ready);
    for (const node of ready) {
      remaining.delete(node.id);
      done.add(node.id);
    }
  }
  return waves;
}

/* --------------------------------------------------------- reasoning trace */

export type ReasoningStepKind =
  | "INTENT"
  | "DECOMPOSITION"
  | "CONTEXT_SELECTION"
  | "EVIDENCE_RETRIEVAL"
  | "HYPOTHESIS"
  | "DELEGATION"
  | "VALIDATION"
  | "CONTRADICTION"
  | "SYNTHESIS"
  | "CONFIDENCE"
  | "LIMITATION";

export type ReasoningStep = {
  kind: ReasoningStepKind;
  summary: string;
  /** Capability/record references supporting the step. */
  evidence: string[];
};

/**
 * A concise, auditable reasoning summary. This is deliberately NOT a hidden
 * chain-of-thought dump: each step is a one-line, user-reviewable statement
 * with its evidence references.
 */
export type ReasoningSummary = {
  objective: string;
  steps: ReasoningStep[];
  claims: NoeliaClaim[];
  contradictions: string[];
  unknowns: string[];
  confidence: number;
  limitations: string[];
};

export function buildReasoningSummary(input: {
  objective: string;
  steps: ReasoningStep[];
  claims: NoeliaClaim[];
  contradictions?: string[];
  unknowns?: string[];
  limitations?: string[];
}): ReasoningSummary {
  const claims = input.claims;
  const sourceBacked = claims.filter((c) => c.kind === "FACT").length;
  const total = claims.length;
  const declared = claims
    .map((c) => c.confidence)
    .filter((c): c is number => typeof c === "number");
  const mean = declared.length ? declared.reduce((a, b) => a + b, 0) / declared.length : 0;
  // Evidence weight: share of claims that are observed facts, blended with mean
  // declared confidence. Capped so an unsupported answer cannot reach certainty.
  const evidenceWeight = total === 0 ? 0 : sourceBacked / total;
  const confidence = Math.round(Math.min(0.95, mean * 0.5 + evidenceWeight * 0.5) * 1000) / 1000;
  return {
    objective: input.objective,
    steps: input.steps,
    claims,
    contradictions: [...(input.contradictions ?? [])],
    unknowns: [...(input.unknowns ?? [])],
    confidence,
    limitations: [...(input.limitations ?? [])],
  };
}

/**
 * Detect contradictions between claims in a simple, explainable way: two FACT
 * claims from different brains carrying the same subject key and different
 * statements. This deliberately over-reports rather than silently merging.
 */
export function detectContradictionPairs(
  claims: readonly NoeliaClaim[],
  subjectKeyOf: (claim: NoeliaClaim) => string | null,
): Array<{ subject: string; claims: NoeliaClaim[] }> {
  const buckets = new Map<string, NoeliaClaim[]>();
  for (const claim of claims) {
    if (claim.kind !== "FACT") continue;
    const key = subjectKeyOf(claim);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push(claim);
    buckets.set(key, list);
  }
  // Statement comparison normalises whitespace and terminal punctuation, so
  // "Cash is 100" and "cash is 100." are agreement, not a contradiction.
  const normalise = (statement: string) =>
    statement.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:]+$/, "");
  const out: Array<{ subject: string; claims: NoeliaClaim[] }> = [];
  for (const [subject, list] of buckets) {
    const statements = new Set(list.map((c) => normalise(c.statement)));
    if (statements.size > 1) out.push({ subject, claims: list });
  }
  return out.sort((a, b) => a.subject.localeCompare(b.subject));
}
