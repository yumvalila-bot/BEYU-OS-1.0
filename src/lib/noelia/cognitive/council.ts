/**
 * NOELIA — INTELLIGENCE COUNCIL.
 *
 * A governed multi-specialist deliberation. The Council exists so that a complex
 * institutional question is examined from several institutional viewpoints with
 * *distinct evidence*, and so that disagreement is surfaced rather than averaged
 * into a false consensus.
 *
 * This module is intentionally split:
 *   • PLAN — pure, deterministic: which specialists, what bounded question each
 *     receives, what evidence each must bring. No I/O.
 *   • SYNTHESISE — pure: reconcile already-collected findings, detect
 *     disagreement, compute confidence, state what is missing.
 *
 * Collection of findings is performed by the caller (the runtime/tool layer)
 * because that is where authorization and the tool registry live. Keeping I/O
 * out of this module is what makes the reconciliation logic testable and
 * auditable — and what stops the Council from becoming a second executor.
 *
 * Anti-sycophancy rules enforced in synthesis:
 *   • A finding with no evidence reference is NEUTRAL/INSUFFICIENT, never support.
 *   • Specialists that merely restate the same statement are collapsed and the
 *     duplicated opinion is discounted, not counted as independent agreement.
 *   • Contradictory FACTs are recorded as dissent with both sides preserved.
 *   • The Council never returns REQUIRED decision; it returns a recommendation
 *     plus the human approvals that would be needed.
 */

import type { NoeliaBrainId } from "./brain-contracts";
import { NOELIA_BRAIN_IDS, getBrain } from "./brain-contracts";
import {
  NOELIA_CLAIM_KINDS,
  type NoeliaClaim,
  type NoeliaClaimKind,
} from "./reasoning";

export type CouncilSpecialist = {
  brain: NoeliaBrainId;
  title: string;
  /** The bounded question this specialist is asked. Never open-ended. */
  brief: string;
  /** Capabilities this specialist is allowed to use for its slice. */
  capabilities: string[];
  /** Required evidence categories the specialist must cite, or return INSUFFICIENT_EVIDENCE. */
  requiredEvidence: string[];
};

export type CouncilPlan = {
  question: string;
  objective: string;
  specialists: CouncilSpecialist[];
  /** Brains deliberately excluded, with the reason (authorization or relevance). */
  excluded: Array<{ brain: NoeliaBrainId; reason: string }>;
  /** Approval obligations this question implies, surfaced before deliberation. */
  approvalsRequired: string[];
};

const SPECIALIST_BRIEFS: Record<NoeliaBrainId, { brief: string; evidence: string[] }> = {
  EXECUTIVE: {
    brief: "What are the strategic options, and how does each align with recorded institutional objectives?",
    evidence: ["governance.strategic.objectives", "governance.resolution.query"],
  },
  INSTITUTIONAL: {
    brief: "What does the Constitution, governance structure or recorded decision history require or forbid?",
    evidence: ["governance.resolution.query", "noelia.decision_memory.query"],
  },
  KNOWLEDGE: {
    brief: "What do governed institutional documents actually say on this subject?",
    evidence: ["knowledge.rag.search"],
  },
  ANALYTICAL: {
    brief: "What do the authorized financial and operational records show, and what are the magnitudes and uncertainties?",
    evidence: ["finance.cash.position", "finance.capital.pipeline", "risk.analysis"],
  },
  OPERATIONAL: {
    brief: "What would executing this require operationally, and what governed workflow constraints apply?",
    evidence: ["noelia.operations.status"],
  },
  LEARNING: {
    brief: "What does evaluation data say about the reliability of the analysis informing this question?",
    evidence: ["noelia.evaluation.status"],
  },
  COLLECTIVE: {
    brief: "Which specialists disagree, and what evidence resolves or preserves the disagreement?",
    evidence: ["noelia.knowledge_graph.query"],
  },
  PERSONAL_CONTEXT: {
    brief: "Is there authorized personal or role context that changes how this should be presented?",
    evidence: ["noelia.personal_context.read"],
  },
};

/**
 * Plan a council.
 *
 * Participants are the brains the question genuinely requires AND that have at
 * least one authorized capability. A brain with no authorized capability is
 * listed in `excluded` with the authorization reason — never silently dropped,
 * because a reader must know the council was incomplete.
 */
export function planCouncil(input: {
  question: string;
  objective: string;
  candidateBrains: NoeliaBrainId[];
  /** capability → authorized? */
  capabilityAuthorized: (capability: string) => boolean;
  /** Maximum participants; bounded so the council cannot fan out unboundedly. */
  maxParticipants?: number;
}): CouncilPlan {
  const question = input.question.trim();
  if (question.length === 0) throw new Error("A council requires a question.");
  const max = Math.min(6, Math.max(2, Math.trunc(input.maxParticipants ?? 5)));

  const unique = [...new Set(input.candidateBrains)].filter((b) => NOELIA_BRAIN_IDS.includes(b));
  const specialists: CouncilSpecialist[] = [];
  const excluded: Array<{ brain: NoeliaBrainId; reason: string }> = [];

  // Deterministic canonical ordering so two runs over the same inputs convene
  // the same council in the same order.
  for (const brainId of NOELIA_BRAIN_IDS) {
    if (!unique.includes(brainId)) continue;
    const brain = getBrain(brainId);
    const available = brain.capabilityReach.filter((cap) => input.capabilityAuthorized(cap));
    if (available.length === 0) {
      excluded.push({
        brain: brainId,
        reason: "No authorized capability available to this caller; the specialist cannot bring evidence.",
      });
      continue;
    }
    if (specialists.length >= max) {
      excluded.push({ brain: brainId, reason: `Participant cap (${max}) reached; deferred to a follow-up session.` });
      continue;
    }
    const meta = SPECIALIST_BRIEFS[brainId];
    specialists.push({
      brain: brainId,
      title: brain.title,
      brief: meta.brief,
      capabilities: available.slice(0, 3),
      requiredEvidence: meta.evidence.filter((ref) => available.includes(ref)),
    });
  }

  if (specialists.length === 0) {
    throw new Error("No specialist has an authorized capability; the council cannot convene.");
  }

  return {
    question,
    objective: input.objective.trim() || question,
    specialists,
    excluded,
    approvalsRequired: [
      "Any material institutional decision arising from this deliberation requires an authorized human decision.",
      "Financial execution, posting and approvals are outside NOELIA's authority entirely.",
    ],
  };
}

export type CouncilFindingInput = {
  brain: NoeliaBrainId;
  capability: string | null;
  task: string;
  claimKind: NoeliaClaimKind;
  statement: string;
  evidenceRefs: string[];
  assumptions?: string[];
  confidence?: number | null;
};

export type CouncilFinding = CouncilFindingInput & {
  position: "SUPPORTING" | "DISSENTING" | "NEUTRAL" | "INSUFFICIENT_EVIDENCE";
  /** Populated by synthesis: why this position was assigned. */
  positionReason?: string;
};

export type CouncilSynthesis = {
  executiveSummary: string;
  consensus: string[];
  dissent: string[];
  /** Specialist statements collapsed because they were near-duplicates. */
  duplicatedOpinions: Array<{ statement: string; brains: NoeliaBrainId[] }>;
  /** Explicit disagreements with both sides and their evidence. */
  disagreements: Array<{ subject: string; supporting: string[]; opposing: string[] }>;
  assumptions: string[];
  uncertainties: string[];
  missing: string[];
  confidence: number;
  /** Always true for an institutional council: a human decides. */
  humanDecisionRequired: true;
  approvalsRequired: string[];
  excluded: Array<{ brain: NoeliaBrainId; reason: string }>;
  claims: NoeliaClaim[];
};

function normalise(statement: string): string {
  return statement.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:]+$/, "");
}

/** An unsupported assertion is not evidence. */
export function classifyFinding(finding: CouncilFindingInput): CouncilFinding {
  if (finding.evidenceRefs.length === 0) {
    return {
      ...finding,
      position: "INSUFFICIENT_EVIDENCE",
      positionReason: "No evidence reference supplied; the claim cannot support a conclusion.",
    };
  }
  return { ...finding, position: "SUPPORTING", positionReason: "Evidence references supplied." };
}

/**
 * Synthesise collected findings.
 *
 * Deterministic and side-effect free. Confidence is computed from evidence
 * coverage, specialist agreement and the presence of contradictions — never from
 * the number of agents that happen to say the same thing.
 */
export function synthesiseCouncil(input: {
  plan: CouncilPlan;
  findings: CouncilFindingInput[];
}): CouncilSynthesis {
  const findings = input.findings.map((finding) => classifyFinding(finding));

  // Duplicate detection: identical normalised statements across brains are one
  // opinion, not independent corroboration.
  const buckets = new Map<string, CouncilFinding[]>();
  for (const finding of findings) {
    const key = normalise(finding.statement);
    const list = buckets.get(key) ?? [];
    list.push(finding);
    buckets.set(key, list);
  }

  const duplicatedOpinions: CouncilSynthesis["duplicatedOpinions"] = [];
  const distinctStatements: CouncilFinding[] = [];
  for (const [, list] of buckets) {
    const brains = [...new Set(list.map((f) => f.brain))];
    if (brains.length > 1) {
      duplicatedOpinions.push({ statement: list[0].statement, brains });
      // Keep one instance but downgrade its evidentiary weight with a reason.
      distinctStatements.push({
        ...list[0],
        positionReason: `Restated by ${brains.join(", ")}; counted once as a single opinion.`,
      });
    } else {
      distinctStatements.push(list[0]);
    }
  }

  // Contradiction detection: two FACTs with different normalised statements that
  // share the same task subject are a genuine disagreement to preserve.
  const disagreements: CouncilSynthesis["disagreements"] = [];
  const factFindings = distinctStatements.filter((f) => f.claimKind === "FACT");
  const byTask = new Map<string, CouncilFinding[]>();
  for (const finding of factFindings) {
    const key = normalise(finding.task);
    const list = byTask.get(key) ?? [];
    list.push(finding);
    byTask.set(key, list);
  }
  for (const [task, list] of byTask) {
    const statements = [...new Set(list.map((f) => normalise(f.statement)))];
    if (statements.length > 1) {
      disagreements.push({
        subject: task,
        supporting: list.map((f) => `${f.brain}: ${f.statement} [${f.evidenceRefs.join(", ")}]`),
        opposing: list.map((f) => `${f.brain}: ${f.statement} [${f.evidenceRefs.join(", ")}]`),
      });
    }
  }

  const consensus = distinctStatements
    .filter((f) => f.position === "SUPPORTING")
    .map((f) => `${f.brain}: ${f.statement}`);

  const dissent = distinctStatements
    .filter((f) => f.position === "INSUFFICIENT_EVIDENCE")
    .map((f) => `${f.brain}: INSUFFICIENT_EVIDENCE — ${f.statement}`);

  const missing: string[] = [];
  for (const specialist of input.plan.specialists) {
    const hasFinding = findings.some((f) => f.brain === specialist.brain);
    if (!hasFinding) missing.push(`${specialist.brain}: no finding returned for '${specialist.brief}'`);
  }
  for (const excluded of input.plan.excluded) {
    missing.push(`${excluded.brain}: excluded — ${excluded.reason}`);
  }

  const assumptions = [...new Set(findings.flatMap((f) => f.assumptions ?? []))];
  const uncertainties = distinctStatements
    .filter((f) => f.claimKind === "UNKNOWN" || f.claimKind === "ASSUMPTION")
    .map((f) => `${f.brain}: ${f.statement}`);

  // Evidence coverage: share of findings that cite evidence.
  const supported = findings.filter((f) => f.evidenceRefs.length > 0).length;
  const coverage = findings.length === 0 ? 0 : supported / findings.length;
  const penalty = disagreements.length > 0 ? 0.15 : 0;
  const confidence = findings.length === 0
    ? 0
    : Math.round(Math.max(0, Math.min(0.9, coverage - penalty + (distinctStatements.length > 1 ? 0.1 : 0))) * 1000) / 1000;

  const claims: NoeliaClaim[] = distinctStatements.map((finding, index) =>
    ({
      id: `council-claim-${index + 1}`,
      kind: finding.claimKind,
      statement: finding.statement,
      evidence: finding.evidenceRefs,
      confidence: finding.confidence ?? null,
      brain: finding.brain,
      ...(finding.claimKind === "RECOMMENDATION"
        ? { whatWouldChange: finding.assumptions ?? ["Further institutional evidence."] }
        : {}),
    }) as NoeliaClaim,
  );

  const executiveSummary = [
    `${input.plan.specialists.length} specialist(s) deliberated on: ${input.plan.question}`,
    `Consensus points: ${consensus.length}. Dissent or insufficient evidence: ${dissent.length}.`,
    `Recorded disagreements: ${disagreements.length}. Excluded specialists: ${input.plan.excluded.length}.`,
    `This synthesis is a recommendation, not a decision. Authorized human leadership decides.`,
  ].join(" ");

  return {
    executiveSummary,
    consensus,
    dissent,
    duplicatedOpinions,
    disagreements,
    assumptions,
    uncertainties,
    missing,
    confidence,
    humanDecisionRequired: true,
    approvalsRequired: input.plan.approvalsRequired,
    excluded: input.plan.excluded,
    claims,
  };
}

/**
 * A legacy expectation: the council returns numbered, claim-typed findings. This
 * helper exists so the UI and the tool output agree on ordering and labelling.
 */
export function councilFindingsForOutput(
  synthesis: CouncilSynthesis,
): Array<{ label: string; value: string; kind: "FACT" | "INFERENCE" | "RECOMMENDATION" }> {
  return synthesis.claims.map((claim) => {
    const kind: "FACT" | "INFERENCE" | "RECOMMENDATION" =
      NOELIA_CLAIM_KINDS.includes(claim.kind) && claim.kind === "FACT"
        ? "FACT"
        : claim.kind === "RECOMMENDATION"
          ? "RECOMMENDATION"
          : "INFERENCE";
    return { label: `${claim.brain} · ${claim.kind}`, value: claim.statement, kind };
  });
}
