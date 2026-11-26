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
 * DOMAIN SENSING — the layer that replaces bare keyword attribution.
 *
 * The previous implementation matched a handful of institutional keywords and
 * unconditionally added KNOWLEDGE. Its recorded limitation was that a plainly
 * phrased clinical question ("my patient has a persistent fever") reached no
 * brain but Knowledge, because "fever" was not a trigger term. That is not a
 * vocabulary problem, it is an architecture problem: the router had no concept
 * of a DOMAIN, only of words that happened to be on a list.
 *
 * This layer senses DOMAINS first and derives brains from them. Two properties
 * are deliberately preserved:
 *
 *   1. There are still exactly eight canonical brains. Clinical and legal
 *      questions are NOT answered by a new "CLINICAL" or "LEGAL" brain — those
 *      do not exist and inventing them would violate the eight-brain contract.
 *      A clinical question is answered by ANALYTICAL (evidence and reasoning),
 *      KNOWLEDGE (governed sources) and, when consequences are institutional,
 *      INSTITUTIONAL. The `domain` is reported alongside so the caller can see
 *      WHY those brains were convened.
 *   2. Attribution remains deterministic and inspectable. Every match is
 *      recorded with the term that caused it, so the router is still auditable —
 *      an unauditable router is a hidden router.
 *
 * NOELIA remains advisory: this changes WHO is convened, never what anyone is
 * authorised to do. `planQueenBeeWork` still intersects declared reach with the
 * caller's authorised capabilities, so a better router cannot widen authority.
 */

/** The institutional domains the layer can recognise. */
export type NoeliaDomain =
  | "CLINICAL"
  | "FINANCIAL"
  | "GOVERNANCE"
  | "LEGAL"
  | "OPERATIONAL"
  | "WORKFORCE"
  | "KNOWLEDGE"
  | "CROSS_SECTOR";

type DomainSignal = {
  domain: NoeliaDomain;
  /** Institutional vocabulary, INCLUDING lay phrasing a non-specialist would use. */
  pattern: RegExp;
  /** Brains convened when this domain is present. Never adds a new brain. */
  brains: readonly NoeliaBrainId[];
  /** Whether an institutional consequence usually rides along with the question. */
  escalates?: boolean;
};

/**
 * Domain signals.
 *
 * Each pattern deliberately includes PLAIN LANGUAGE alongside the formal term.
 * "My patient has a fever" must reach the clinical domain even though it
 * contains no clinical jargon: `patient`, `fever`, `symptom`, `diagnos` and
 * `treat` all appear in sentences real managers write.
 */
const DOMAIN_SIGNALS: ReadonlyArray<DomainSignal> = [
  {
    domain: "CLINICAL",
    // Plain: patient, fever, sick, unwell, symptom, rash, pain, dose, medicine
    // Formal: clinical, diagnos, treat, therapy, prognos, comorb, triage, ward,
    //         outpatient, inpatient, referral, vitals, infection, sepsis, malaria
    pattern:
      /\b(patient|clinical|diagnos\w*|treat\w*|therap\w*|prognos\w*|symptom\w*|fever|unwell|sick|illness|ailment|rash|pain|dose|dosage|medicine|medication|prescri\w*|triage|ward|outpatients?|inpatients?|referral|vital signs|infection|sepsis|malaria|tuberculosis|comorbid\w*|surgery|surgical|maternity|antenatal|paediatric|pediatric|nurses?|nursing|diagnostics?|laborator\w*|tests?)\b/i,
    // No CLINICAL brain exists: clinical questions rest on evidence and
    // reasoning (ANALYTICAL) over governed sources (KNOWLEDGE). Where a
    // clinical decision carries institutional consequence the caller promotes
    // it via escalation, never automatically.
    brains: ["ANALYTICAL", "KNOWLEDGE"],
  },
  {
    domain: "FINANCIAL",
    pattern:
      /\b(financ\w*|treasury|cash|liquidity|cashflow|budget|revenue|cost|expense|capex|opex|capital|profit|margin|forecast|variance|audit|ledger|payroll|invoice|receivable|payable|tax|valuation|funding|credit|loan|interest rate|fx|foreign exchange|investment|return|dividend|waterfall|esop|captable)\b/i,
    brains: ["ANALYTICAL", "KNOWLEDGE"],
    escalates: true,
  },
  {
    domain: "GOVERNANCE",
    pattern:
      /\b(governance|constitution\w*|board|trustee|resolution|charter|authorit\w*|hierarchy|entity structure|ownership|policy|policies|approval|approve|delegat\w*|mandate|fiduciary|quorum|council|committee|separation of duties|sign-?off|ratif\w*)\b/i,
    brains: ["INSTITUTIONAL", "KNOWLEDGE"],
  },
  {
    domain: "LEGAL",
    pattern:
      /\b(legal|law|statut\w*|regulation|regulatory|compliance|licen[cs]e|permit|contract|agreement|clause|liabilit\w*|litigation|dispute|arbitration|jurisdiction|court|tribunal|breach|indemn\w*|gdpr|data protection|consent form|terms of service|intellectual property|copyright|trademark)\b/i,
    brains: ["INSTITUTIONAL", "KNOWLEDGE"],
  },
  {
    domain: "OPERATIONAL",
    pattern:
      /\b(workflow|schedule|pipeline|process|execution|operations|operational|uptime|throughput|queue|backlog|incident|downtime|deployment|logistics|supply chain|inventory|procurement|maintenance|rosta|shift|capacity planning)\b/i,
    brains: ["OPERATIONAL", "KNOWLEDGE"],
  },
  {
    domain: "WORKFORCE",
    pattern:
      /\b(workforce|employee|staff|headcount|hiring|recruit\w*|onboard\w*|attrition|turnover|performance review|training|competenc\w*|role|vacancy|succession|compensation|remuneration|hr|human resources|labour|labor)\b/i,
    brains: ["OPERATIONAL", "ANALYTICAL", "KNOWLEDGE"],
  },
  {
    domain: "KNOWLEDGE",
    pattern:
      /\b(document\w*|evidence|research|study|studies|literature|guideline\w*|protocol\w*|standard operating|best practice|knowledge|archive|record\w*|reference|retriev\w*|search|summary|summari[sz]\w*)\b/i,
    brains: ["KNOWLEDGE"],
  },
];

/**
 * Intent modifiers — these do not select a domain, they select the SHAPE of the
 * answer and are applied on top of whatever domains matched.
 */
const INTENT_SIGNALS: ReadonlyArray<{ brain: NoeliaBrainId; pattern: RegExp; label: string }> = [
  { brain: "EXECUTIVE", label: "strategy", pattern: /\b(strateg\w*|priorit\w*|brief|executive|should we|should beyu|opportunit\w*|expansion|invest|roadmap|vision|mission|long[- ]term|decision[- ]ready)\b/i },
  { brain: "ANALYTICAL", label: "quantification", pattern: /\b(analys\w*|analyse|analyze|forecast|scenario|variance|stress test|projection|trend|kpi|metric\w*|quantif\w*|compar\w*|benchmark\w*|estimat\w*|calculate|calculat\w*|statistic\w*)\b/i },
  { brain: "COLLECTIVE", label: "deliberation", pattern: /\b(council|deliberat\w*|multi[- ]specialist|independent analysis|second opinion|conflicting|disagree\w*|consensus|panel)\b/i },
  { brain: "LEARNING", label: "evaluation", pattern: /\b(evaluat\w*|quality of (the )?answers?|regression|learning|post[- ]mortem|lessons? learned|retrospective)\b/i },
  { brain: "PERSONAL_CONTEXT", label: "personalisation", pattern: /\b(my (preference|role|team|reports?)|for me|remind me|as (a|the) (trustee|director|manager|clinician|nurse|analyst)|in my capacity)\b/i },
];

/** A single inspectable reason a brain was convened. */
export type BrainAttributionReason = {
  brain: NoeliaBrainId;
  domain: NoeliaDomain | "INTENT";
  /** The literal text that matched, so the decision can be audited. */
  term: string;
};

export type BrainAttribution = {
  /** Convened brains in canonical ordinal order. Always contains KNOWLEDGE. */
  brains: NoeliaBrainId[];
  /** Domains sensed in the question, most evidence first. */
  domains: NoeliaDomain[];
  /** Every match, in the order it was found. */
  reasons: BrainAttributionReason[];
  /**
   * 0..1 — how much evidence there was for this attribution. Low confidence
   * means the question was vague, not that the answer is wrong. Callers are
   * expected to disclose it and, below their threshold, ask or escalate.
   */
  confidence: number;
  /** True when the question spans more than one domain. */
  multiDomain: boolean;
  /** Plain-language note suitable for showing a human. */
  explanation: string;
};

/** Domain → ordinal for deterministic ordering of the domain list. */
const DOMAIN_ORDER: readonly NoeliaDomain[] = [
  "CLINICAL",
  "FINANCIAL",
  "GOVERNANCE",
  "LEGAL",
  "OPERATIONAL",
  "WORKFORCE",
  "KNOWLEDGE",
];

/**
 * Sense domains first, then derive brains.
 *
 * Deterministic: no randomness, no model call, no network. The same question
 * always produces the same attribution, which is what makes it auditable.
 */
export function attributeBrainsDetailed(question: string): BrainAttribution {
  const text = question.trim();
  const selected = new Set<NoeliaBrainId>();
  const reasons: BrainAttributionReason[] = [];
  const matchedDomains = new Set<NoeliaDomain>();

  // 1. DOMAINS — each match convenes the brains that domain requires.
  for (const signal of DOMAIN_SIGNALS) {
    const match = signal.pattern.exec(text);
    if (!match) continue;
    matchedDomains.add(signal.domain);
    for (const brain of signal.brains) selected.add(brain);
    for (const brain of signal.brains) {
      reasons.push({ brain, domain: signal.domain, term: match[0] });
    }
    // A domain with institutional consequence implies the governance view.
    if (signal.escalates && signal.domain === "FINANCIAL" && /\b(governance|board|trustee|approval|approve|authoris|authoriz)\b/i.test(text)) {
      selected.add("INSTITUTIONAL");
      reasons.push({ brain: "INSTITUTIONAL", domain: "FINANCIAL", term: "financial + governance" });
    }
  }

  // 2. INTENT — the shape of the answer, applied on top of the domains.
  for (const intent of INTENT_SIGNALS) {
    const match = intent.pattern.exec(text);
    if (!match) continue;
    selected.add(intent.brain);
    reasons.push({ brain: intent.brain, domain: "INTENT", term: match[0] });
  }

  // 3. The Knowledge Brain is the floor: every answer rests on governed
  //    retrieval, so it is never absent even if no domain matched.
  if (!selected.has("KNOWLEDGE")) {
    selected.add("KNOWLEDGE");
    reasons.push({ brain: "KNOWLEDGE", domain: "KNOWLEDGE", term: "evidence floor" });
  }

  const domains = DOMAIN_ORDER.filter((d) => matchedDomains.has(d));
  const brains = NOELIA_BRAINS.filter((brain) => selected.has(brain.id)).map((brain) => brain.id);
  const multiDomain = domains.length > 1;

  // CONFIDENCE — a deliberate, documented heuristic rather than a model score,
  // because a router whose confidence cannot be explained cannot be trusted to
  // escalate. It rises with distinct domains, with specialists beyond the
  // evidence floor, and with question specificity; it is capped below 1.0
  // because this is keyword evidence, never certainty.
  const domainScore = Math.min(domains.length, 3) / 3; // 0 .. 1
  const specialistScore = Math.min(brains.length - 1, 3) / 3; // 0 .. 1
  const specificityScore = Math.min(text.split(/\s+/).filter(Boolean).length, 24) / 24; // 0 .. 1
  const confidence = Math.min(
    0.95,
    Math.round((0.5 * domainScore + 0.35 * specialistScore + 0.15 * specificityScore) * 100) / 100,
  );

  const explanation = domains.length
    ? `Sensed ${domains.join(", ").toLowerCase()} domain${multiDomain ? "s" : ""}; convened ${brains.length} canonical brain(s).`
    : "No institutional domain was sensed; the evidence floor (Knowledge) alone was convened. The question may be too vague to route — consider asking for clarification.";

  return { brains, domains, reasons, confidence, multiDomain, explanation };
}

/**
 * Backwards-compatible accessor used across the cognitive core.
 *
 * Retained so existing call sites keep working unchanged while gaining the
 * improved attribution. Use `attributeBrainsDetailed` when the caller wants
 * domains, confidence or the audit trail of matches.
 */
export function attributeBrains(question: string): NoeliaBrainId[] {
  return attributeBrainsDetailed(question).brains;
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
