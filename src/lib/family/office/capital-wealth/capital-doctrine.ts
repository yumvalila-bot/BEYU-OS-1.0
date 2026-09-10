/**
 * BEYU OS — FAMILY OFFICE CAPITAL & WEALTH ENGINE: capital doctrine (§5),
 * asset ladder (§6) and institutional capital boundary (§7).
 *
 * ============================ THE CENTRAL DISTINCTION =======================
 *
 * CAP-001…CAP-015 are POLICY PRINCIPLES. They are NOT investment instructions,
 * NOT thresholds, NOT approval criteria and NOT a scoring rubric. Nothing in
 * this module can approve, reject or rank an investment. That distinction is
 * load-bearing: a principle that a machine can evaluate into a decision is a
 * policy value in code, which is precisely what the Family Office engine forbids
 * (`docs/audit/FAMILY_OFFICE_COMPLETENESS_AUDIT.md`: "no policy VALUES in
 * code").
 *
 * What this module DOES provide:
 *
 *   1. The doctrine catalogue, each principle with a stable ID, its statement,
 *      the policy key it maps to, and the FIR/ratification that must exist
 *      before it can be *enforced* rather than merely *quoted*.
 *   2. A relevance classifier: given a capital matter, which principles bear on
 *      it. Relevance is structural (the matter touches debt, so CAP-004 bears on
 *      it) — it is not an assessment of whether the matter satisfies them.
 *   3. The asset-ladder progression model and its seven actions, with the
 *      explicit rule that fitting the metaphor is never a rationale.
 *   4. The institutional-capital ("be the bank, not the banker") boundary, with
 *      the regulated-activity guard that refuses to represent any internal
 *      allocation as banking.
 *
 * Every enforcement point that a principle would drive requires a ratified
 * policy. Absent one, the honest answer is `POLICY_DECISION_REQUIRED` — the
 * fail-closed convention already used across `src/lib/family/**`.
 */

import { capitalGovernanceError } from "./errors";

export const FAMILY_CAPITAL_DOCTRINE_VERSION = "family-capital-doctrine-1.0.0";

/* ------------------------------------------------------------------ */
/* §5 — The fifteen capital doctrine principles                        */
/* ------------------------------------------------------------------ */

export type CapitalDoctrineId =
  | "CAP-001"
  | "CAP-002"
  | "CAP-003"
  | "CAP-004"
  | "CAP-005"
  | "CAP-006"
  | "CAP-007"
  | "CAP-008"
  | "CAP-009"
  | "CAP-010"
  | "CAP-011"
  | "CAP-012"
  | "CAP-013"
  | "CAP-014"
  | "CAP-015";

/**
 * The doctrine, verbatim. `statement` is the principle as ratified text; it is
 * quoted, never interpreted into a number.
 */
export const CAPITAL_DOCTRINE: readonly {
  id: CapitalDoctrineId;
  /** Short title used in the UI and in audit records. */
  title: string;
  statement: string;
  /**
   * The policy key a future ratification would fill to make this principle
   * enforceable. Naming the key is engineering; supplying its value is
   * ratification.
   */
  policyKey: string;
  /**
   * What kind of thing the ratification would have to decide. This is the
   * honest gap: until it exists, the principle can be cited but not applied.
   */
  ratificationRequires: string;
  /** The matter tags this principle bears on. Relevance, not compliance. */
  relevantMatterTags: readonly CapitalMatterTag[];
}[] = [
  {
    id: "CAP-001",
    title: "Preserve capital",
    statement: "Preserve capital.",
    policyKey: "capital.preservation",
    ratificationRequires: "The maximum acceptable loss per position and per portfolio, and the mechanism by which capital protection is triggered.",
    relevantMatterTags: ["INVESTMENT", "REAL_ESTATE", "DEBT", "SCENARIO", "CAPITAL_REQUEST"],
  },
  {
    id: "CAP-002",
    title: "Acquire productive assets",
    statement: "Acquire productive assets.",
    policyKey: "capital.productivity",
    ratificationRequires: "The definition of a productive asset, and the minimum productive capital ratio the family holds itself to.",
    relevantMatterTags: ["INVESTMENT", "REAL_ESTATE", "CAPITAL_REQUEST", "BUSINESS"],
  },
  {
    id: "CAP-003",
    title: "Understand cash flow",
    statement: "Understand cash flow.",
    policyKey: "capital.cashflow.comprehension",
    ratificationRequires: "The cash-flow evidence required before a matter is committee-ready.",
    relevantMatterTags: ["INVESTMENT", "REAL_ESTATE", "DEBT", "TREASURY", "CASH_FLOW", "CAPITAL_REQUEST"],
  },
  {
    id: "CAP-004",
    title: "Debt only when properly supported",
    statement: "Use debt only when repayment is properly supported.",
    policyKey: "capital.debt.serviceability",
    ratificationRequires: "The DSCR, interest-coverage and LTV boundaries at which debt is considered properly supported, per asset class and jurisdiction.",
    relevantMatterTags: ["DEBT", "REAL_ESTATE", "CAPITAL_REQUEST", "OBLIGATION"],
  },
  {
    id: "CAP-005",
    title: "Risk must be compensated",
    statement: "If BEYU accepts risk, expected compensation must justify that risk.",
    policyKey: "capital.risk.compensation",
    ratificationRequires: "The minimum expected return per unit of accepted risk, and the risk measure used.",
    relevantMatterTags: ["INVESTMENT", "SCENARIO", "RISK", "CAPITAL_REQUEST"],
  },
  {
    id: "CAP-006",
    title: "Maintain liquidity",
    statement: "Maintain liquidity.",
    policyKey: "capital.liquidity.reserve",
    ratificationRequires: "The liquidity reserve level and the runway floor, by currency and by horizon.",
    relevantMatterTags: ["TREASURY", "LIQUIDITY", "DEBT", "CAPITAL_REQUEST"],
  },
  {
    id: "CAP-007",
    title: "Numbers are required",
    statement: "Numbers are required for material capital decisions.",
    policyKey: "capital.materiality.evidence",
    ratificationRequires: "The materiality threshold above which quantified evidence is mandatory, and the minimum evidence set.",
    relevantMatterTags: ["INVESTMENT", "REAL_ESTATE", "DEBT", "CAPITAL_REQUEST", "SCENARIO"],
  },
  {
    id: "CAP-008",
    title: "Document thesis and counter-thesis",
    statement: "Document investment thesis and counter-thesis.",
    policyKey: "capital.thesis.documentation",
    ratificationRequires: "The minimum thesis and counter-thesis content required before committee review.",
    relevantMatterTags: ["INVESTMENT", "REAL_ESTATE", "CAPITAL_REQUEST", "DECISION_JOURNAL"],
  },
  {
    id: "CAP-009",
    title: "Remain emotionally disciplined",
    statement: "Remain emotionally disciplined.",
    policyKey: "capital.behavioural.discipline",
    ratificationRequires: "The cooling-off and second-review triggers for decisions showing behavioural pressure indicators.",
    relevantMatterTags: ["DECISION_JOURNAL", "INVESTMENT", "CAPITAL_REQUEST"],
  },
  {
    id: "CAP-010",
    title: "Learn from every investment",
    statement: "Learn from every investment.",
    policyKey: "capital.postinvestment.review",
    ratificationRequires: "The deadline and mandatory content of a post-investment review, and who must sign it.",
    relevantMatterTags: ["POST_INVESTMENT_REVIEW", "DECISION_JOURNAL", "INVESTMENT"],
  },
  {
    id: "CAP-011",
    title: "Comply with applicable law",
    statement: "Comply with applicable law.",
    policyKey: "capital.legal.compliance",
    ratificationRequires: "The jurisdictions in scope and the legal-review gate that must clear before execution.",
    relevantMatterTags: ["INVESTMENT", "REAL_ESTATE", "DEBT", "OBLIGATION", "REGULATORY", "CAPITAL_REQUEST"],
  },
  {
    id: "CAP-012",
    title: "Tax cannot rescue a bad investment",
    statement: "Tax benefits cannot rescue an economically bad investment.",
    policyKey: "capital.tax.subordination",
    ratificationRequires: "The rule that economic return is assessed before tax effect, and the prohibition on tax-led approval.",
    relevantMatterTags: ["INVESTMENT", "REAL_ESTATE", "TAX", "CAPITAL_REQUEST"],
  },
  {
    id: "CAP-013",
    title: "Build scalable systems",
    statement: "Build scalable systems rather than permanent founder dependency.",
    policyKey: "capital.systemisation",
    ratificationRequires: "The business-maturity level required before a holding qualifies for further capital.",
    relevantMatterTags: ["BUSINESS", "CAPITAL_REQUEST", "GENERATIONAL"],
  },
  {
    id: "CAP-014",
    title: "Prefer sustainable compounding",
    statement: "Prefer sustainable compounding.",
    policyKey: "capital.compounding.preference",
    ratificationRequires: "The holding-period preference and the reinvestment rule for realised proceeds.",
    relevantMatterTags: ["INVESTMENT", "CAPITAL_RECYCLING", "GENERATIONAL"],
  },
  {
    id: "CAP-015",
    title: "Protect generational continuity",
    statement: "Protect generational continuity.",
    policyKey: "capital.generational.continuity",
    ratificationRequires: "The succession, education and transfer objectives that capital allocation must not compromise.",
    relevantMatterTags: ["GENERATIONAL", "EDUCATION", "CAPITAL_REQUEST", "INVESTMENT"],
  },
];

export const CAPITAL_DOCTRINE_IDS = CAPITAL_DOCTRINE.map((d) => d.id);

export function isCapitalDoctrineId(value: string): value is CapitalDoctrineId {
  return (CAPITAL_DOCTRINE_IDS as readonly string[]).includes(value);
}

export function doctrineById(id: CapitalDoctrineId) {
  const found = CAPITAL_DOCTRINE.find((d) => d.id === id);
  if (!found) throw new Error(`Unknown capital doctrine principle: ${id}`);
  return found;
}

/** The matter kinds a doctrine principle can bear on. */
export const CAPITAL_MATTER_TAGS = [
  "INVESTMENT",
  "REAL_ESTATE",
  "DEBT",
  "OBLIGATION",
  "TREASURY",
  "LIQUIDITY",
  "CASH_FLOW",
  "RISK",
  "SCENARIO",
  "CAPITAL_REQUEST",
  "DECISION_JOURNAL",
  "POST_INVESTMENT_REVIEW",
  "BUSINESS",
  "REGULATORY",
  "TAX",
  "GENERATIONAL",
  "EDUCATION",
  "CAPITAL_RECYCLING",
] as const;
export type CapitalMatterTag = (typeof CAPITAL_MATTER_TAGS)[number];

/**
 * The principles that bear on a matter, by matter tag.
 *
 * This is a RELEVANCE lookup, not an assessment. It answers "which doctrine
 * must this matter be examined against?" and never "does this matter comply?".
 * Compliance is a governance judgement recorded by a human, against a ratified
 * policy, in the committee record.
 */
export function doctrineRelevantTo(matterTags: readonly CapitalMatterTag[]): readonly CapitalDoctrineId[] {
  const tags = new Set(matterTags);
  return CAPITAL_DOCTRINE.filter((d) => d.relevantMatterTags.some((t) => tags.has(t))).map((d) => d.id);
}

/**
 * The honest gap: what must be ratified before a principle can be enforced.
 *
 * Returns one entry per principle that bears on the matter, naming the policy
 * key and the decision required. A caller that wants to *apply* a principle must
 * resolve its policy key through the existing policy engine
 * (`src/lib/family/office/policy.ts`); if it does not resolve, the caller must
 * report `POLICY_DECISION_REQUIRED` and must not substitute a default.
 */
export function doctrineEnforcementGaps(matterTags: readonly CapitalMatterTag[]): readonly {
  id: CapitalDoctrineId;
  policyKey: string;
  ratificationRequires: string;
}[] {
  const relevant = new Set(doctrineRelevantTo(matterTags));
  return CAPITAL_DOCTRINE.filter((d) => relevant.has(d.id)).map((d) => ({
    id: d.id,
    policyKey: d.policyKey,
    ratificationRequires: d.ratificationRequires,
  }));
}

/**
 * Refuse a rationale that consists only of doctrine citation.
 *
 * "CAP-002 says acquire productive assets" is not a reason to buy a specific
 * asset. This guard exists because a doctrine reference in a rationale field
 * reads like evidence and is not. It throws rather than warning, because a
 * rationale that is only a principle citation is a governance defect the moment
 * it is recorded, not when it is read.
 */
export function assertRationaleIsNotDoctrineCitationOnly(rationale: string, citedPrinciples: readonly CapitalDoctrineId[]): void {
  let stripped = rationale.trim();
  for (const id of citedPrinciples) {
    stripped = stripped.split(id).join(" ");
  }
  for (const d of CAPITAL_DOCTRINE) {
    stripped = stripped.split(d.title).join(" ").split(d.statement).join(" ");
  }
  const substantive = stripped.replace(/[\s.,;:()\-–—"'’]/g, "");
  if (substantive.length < 40) {
    throw capitalGovernanceError(
      "EVIDENCE_INSUFFICIENT",
      "A rationale that only cites capital doctrine is not a rationale. CAP-001…CAP-015 are policy principles, not investment instructions (§5); the matter-specific evidence must be stated.",
      ["CAP-007", "CAP-008"],
      { citedPrinciples, substantiveLength: substantive.length },
    );
  }
}

/* ------------------------------------------------------------------ */
/* §6 — Asset ladder / capital progression                             */
/* ------------------------------------------------------------------ */

/**
 * The capital progression. Ordered: `ladderStageRank` is the progression index.
 *
 * The stages describe a SCALE of capital deployment, not a quality ranking and
 * not a prescription. A family can be healthy at any stage; the model exists so
 * that a proposed acquisition can be located on the ladder and its financing,
 * governance and liquidity consequences compared against the family's actual
 * position — not so that the system can say "you should be further up".
 */
export const CAPITAL_LADDER_STAGES = [
  { rank: 1, code: "SMALL_PRODUCTIVE_ASSET", label: "Small productive asset", description: "A single income-producing asset acquired with available capital." },
  { rank: 2, code: "CASH_PRODUCING_ASSET", label: "Cash-producing asset", description: "An asset whose recurring cash flow is evidenced and understood." },
  { rank: 3, code: "MULTIPLE_ASSETS", label: "Multiple assets", description: "A set of assets whose combined cash flow exceeds any single position." },
  { rank: 4, code: "PORTFOLIO", label: "Portfolio", description: "Assets held under a common strategy, with measured concentration and correlation." },
  { rank: 5, code: "CONSOLIDATION", label: "Consolidation", description: "Positions combined to reduce cost, risk or management overhead." },
  { rank: 6, code: "LARGER_STRATEGIC_ASSET", label: "Larger strategic asset", description: "A single material asset whose acquisition is itself a strategic decision." },
  { rank: 7, code: "BUSINESS_PLATFORM", label: "Business platform", description: "An operating business rather than a passive asset." },
  { rank: 8, code: "HOLDING_COMPANY", label: "Holding company", description: "A structure owning multiple businesses or assets." },
  { rank: 9, code: "GENERATIONAL_CAPITAL", label: "Generational capital", description: "Capital governed for continuity across generations." },
] as const;

export type CapitalLadderStageCode = (typeof CAPITAL_LADDER_STAGES)[number]["code"];

export function ladderStageByCode(code: CapitalLadderStageCode) {
  const found = CAPITAL_LADDER_STAGES.find((s) => s.code === code);
  if (!found) throw new Error(`Unknown capital ladder stage: ${code}`);
  return found;
}

/** The seven capital actions an asset or position can be taken through. */
export const CAPITAL_ACTIONS = ["BUY", "HOLD", "IMPROVE", "REFINANCE", "CONSOLIDATE", "SELL", "REDEPLOY"] as const;
export type CapitalAction = (typeof CAPITAL_ACTIONS)[number];

/**
 * What each action requires BEFORE it may be executed.
 *
 * These are structural prerequisites (the review and evidence that must exist),
 * never approvals. Each is a gate a human must clear through the existing
 * governance engine; the Family Office records whether the gate is clear.
 */
export const CAPITAL_ACTION_PREREQUISITES: Record<CapitalAction, readonly string[]> = {
  BUY: ["STRATEGIC_FIT", "FINANCIAL_MODEL", "DUE_DILIGENCE", "LEGAL_REVIEW", "TAX_REVIEW", "GOVERNANCE_APPROVAL"],
  HOLD: ["THESIS_STILL_VALID", "PERFORMANCE_REVIEWED"],
  IMPROVE: ["BUSINESS_CASE", "CAPITAL_REQUEST", "GOVERNANCE_APPROVAL"],
  REFINANCE: ["DEBT_SERVICEABILITY", "LEGAL_REVIEW", "GOVERNANCE_APPROVAL"],
  CONSOLIDATE: ["COMBINATION_ANALYSIS", "LEGAL_REVIEW", "TAX_REVIEW", "GOVERNANCE_APPROVAL"],
  SELL: ["VALUATION", "TAX_REVIEW", "LEGAL_REVIEW", "GOVERNANCE_APPROVAL"],
  REDEPLOY: ["PROCEEDS_ALLOCATION_PLAN", "GOVERNANCE_APPROVAL"],
};

export type LadderProgressionAssessment = {
  engineVersion: string;
  /** Always false: the ladder never recommends a stage. */
  recommendsStageChange: false;
  currentStage: CapitalLadderStageCode;
  proposedStage: CapitalLadderStageCode;
  direction: "ADVANCE" | "RETREAT" | "SAME";
  stagesCrossed: number;
  /** Structural prerequisites for the proposed action, unmet ones named. */
  prerequisites: readonly string[];
  unmetPrerequisites: readonly string[];
  /** Always true — recorded so a caller cannot silently drop it. */
  metaphorIsNotARationale: true;
  explanation: string[];
};

/**
 * Locate a proposed action on the ladder and list what it structurally requires.
 *
 * `satisfiedPrerequisites` is supplied by the caller from the governance record.
 * The assessment never marks a prerequisite satisfied on its own, and it never
 * recommends advancing or retreating: `recommendsStageChange` is typed `false`.
 */
export function assessLadderProgression(params: {
  currentStage: CapitalLadderStageCode;
  proposedStage: CapitalLadderStageCode;
  action: CapitalAction;
  satisfiedPrerequisites: readonly string[];
}): LadderProgressionAssessment {
  const current = ladderStageByCode(params.currentStage);
  const proposed = ladderStageByCode(params.proposedStage);
  const prerequisites = CAPITAL_ACTION_PREREQUISITES[params.action];
  const satisfied = new Set(params.satisfiedPrerequisites);
  const unmet = prerequisites.filter((p) => !satisfied.has(p));
  const direction = proposed.rank > current.rank ? "ADVANCE" : proposed.rank < current.rank ? "RETREAT" : "SAME";

  return {
    engineVersion: FAMILY_CAPITAL_DOCTRINE_VERSION,
    recommendsStageChange: false,
    currentStage: current.code,
    proposedStage: proposed.code,
    direction,
    stagesCrossed: Math.abs(proposed.rank - current.rank),
    prerequisites,
    unmetPrerequisites: unmet,
    metaphorIsNotARationale: true,
    explanation: [
      `${params.action} moves the position from "${current.label}" (stage ${current.rank}) to "${proposed.label}" (stage ${proposed.rank}) — ${direction.toLowerCase()}${direction === "SAME" ? "" : ` across ${Math.abs(proposed.rank - current.rank)} stage(s)`}.`,
      `Structural prerequisites for ${params.action}: ${prerequisites.join(", ")}.`,
      unmet.length > 0 ? `Unmet: ${unmet.join(", ")}. Each must be cleared by a human through the governance engine; the Family Office records the state, it does not grant it.` : "All structural prerequisites are recorded as satisfied by the caller.",
      "The asset ladder is a scale for locating a decision. Fitting the progression is never itself a reason to acquire anything (§6).",
    ],
  };
}

/**
 * Refuse an acquisition rationale that rests on the ladder metaphor.
 *
 * The "four green houses → red hotel" story is a teaching device. A rationale
 * field containing only ladder language and no matter-specific evidence is
 * refused outright, for the same reason doctrine-only rationales are.
 */
export function assertRationaleIsNotLadderMetaphorOnly(rationale: string): void {
  const ladderTerms = [
    ...CAPITAL_LADDER_STAGES.map((s) => s.label.toLowerCase()),
    "green house",
    "green houses",
    "red hotel",
    "asset ladder",
    "next rung",
    "up the ladder",
    "progression",
  ];
  let stripped = rationale.toLowerCase();
  for (const term of ladderTerms) stripped = stripped.split(term).join(" ");
  const substantive = stripped.replace(/[\s.,;:()\-–—"'’→]/g, "");
  if (substantive.length < 40) {
    throw capitalGovernanceError(
      "EVIDENCE_INSUFFICIENT",
      "An acquisition may never be recommended solely because it fits the asset-ladder metaphor (§6). State the matter-specific evidence: cash flow, valuation, financing, risk and exit.",
      ["CAP-002", "CAP-007"],
      { substantiveLength: substantive.length },
    );
  }
}

/* ------------------------------------------------------------------ */
/* §7 — Institutional capital ("be the bank, not the banker")          */
/* ------------------------------------------------------------------ */

/**
 * Internal capital activities the Family Office MAY model and govern.
 *
 * These are allocations of the family's OWN capital inside the family's OWN
 * structures. None of them is a regulated banking or lending business.
 */
export const INTERNAL_CAPITAL_ACTIVITIES = [
  { code: "INTERNAL_CAPITAL_ALLOCATION", label: "Internal capital allocation", description: "Directing family capital between the family's own entities and purposes." },
  { code: "SHAREHOLDER_FINANCING", label: "Shareholder financing", description: "Funding an entity in which the family already holds equity." },
  { code: "INTERCOMPANY_FINANCING", label: "Intercompany financing", description: "Funding between entities inside the family structure." },
  { code: "PROJECT_FINANCING_ANALYSIS", label: "Project financing analysis", description: "Modelling the financing of a specific project." },
  { code: "INVESTMENT_CAPITAL", label: "Investment capital", description: "Capital deployed into acquisitions and positions." },
  { code: "STRUCTURED_FINANCE_ANALYSIS", label: "Structured finance analysis", description: "Modelling structured arrangements before any legal or regulatory review." },
] as const;
export type InternalCapitalActivityCode = (typeof INTERNAL_CAPITAL_ACTIVITIES)[number]["code"];

/**
 * The regulated-activity boundary.
 *
 * The Family Office is NOT a bank, NOT a licensed lender and NOT a credit
 * provider. Any activity in this list is refused by the engine unless a legal,
 * regulatory and licensing review has been recorded against it — and even then
 * the engine models the activity, it does not perform it.
 */
export const REGULATED_ACTIVITY_FLAGS = [
  "ACCEPTING_DEPOSITS_FROM_THE_PUBLIC",
  "LENDING_AS_A_BUSINESS_TO_THIRD_PARTIES",
  "PROVIDING_CREDIT_TO_NON_GROUP_PARTIES",
  "ISSUING_DEBT_INSTRUMENTS_TO_INVESTORS",
  "MANAGING_MONEY_FOR_THIRD_PARTIES",
  "PROVIDING_PAYMENT_SERVICES",
  "PROVIDING_INVESTMENT_ADVICE_AS_A_BUSINESS",
  "PROVIDING_INSURANCE",
] as const;
export type RegulatedActivityFlag = (typeof REGULATED_ACTIVITY_FLAGS)[number];

export type InternalCapitalBoundaryCheck = {
  engineVersion: string;
  activity: InternalCapitalActivityCode;
  /** True when no regulated-activity flag is raised. */
  withinInternalCapitalBoundary: boolean;
  raisedFlags: readonly RegulatedActivityFlag[];
  /** Always false. The engine models capital; it never performs banking. */
  performsRegulatedActivity: false;
  /** What must exist before a raised flag may proceed. */
  requiredBeforeProceeding: readonly string[];
  /** Always true — a model is never an executed transaction. */
  modelOnly: true;
  explanation: string[];
};

/**
 * Check a proposed internal capital activity against the regulated-activity
 * boundary (§7).
 *
 * With no flags raised the activity is inside the boundary and may be modelled
 * and governed. With any flag raised, the check names the legal, regulatory and
 * licensing reviews that must be recorded before anyone may proceed — and it
 * still refuses to treat the activity as performed.
 */
export function checkInternalCapitalBoundary(params: {
  activity: InternalCapitalActivityCode;
  raisedFlags: readonly RegulatedActivityFlag[];
  recordedReviews: readonly { kind: "LEGAL" | "REGULATORY" | "LICENSING"; jurisdictionRef: string; reference: string }[];
}): InternalCapitalBoundaryCheck {
  const activity = INTERNAL_CAPITAL_ACTIVITIES.find((a) => a.code === params.activity);
  if (!activity) throw new Error(`Unknown internal capital activity: ${params.activity}`);
  const unknown = params.raisedFlags.filter((f) => !(REGULATED_ACTIVITY_FLAGS as readonly string[]).includes(f));
  if (unknown.length > 0) {
    throw capitalGovernanceError("ARCHITECTURE_DECISION_REQUIRED", `Unknown regulated-activity flag(s): ${unknown.join(", ")}. The flag catalogue is closed.`, [], { unknown });
  }
  const flags = [...new Set(params.raisedFlags)];
  const requiredKinds = ["LEGAL", "REGULATORY", "LICENSING"] as const;
  const recorded = new Set(params.recordedReviews.map((r) => r.kind));
  const missing = flags.length > 0 ? requiredKinds.filter((k) => !recorded.has(k)) : [];
  const withinBoundary = flags.length === 0;

  return {
    engineVersion: FAMILY_CAPITAL_DOCTRINE_VERSION,
    activity: activity.code,
    withinInternalCapitalBoundary: withinBoundary,
    raisedFlags: flags,
    performsRegulatedActivity: false,
    requiredBeforeProceeding: missing.map((k) => `${k}_REVIEW`),
    modelOnly: true,
    explanation: [
      `"${activity.label}": ${activity.description}`,
      withinBoundary
        ? "No regulated-activity flag is raised, so this remains an internal allocation of the family's own capital inside the family's own structures."
        : `Regulated-activity flag(s) raised: ${flags.join(", ")}. This is outside the internal-capital boundary.`,
      flags.length > 0
        ? missing.length > 0
          ? `Before anyone may proceed, record: ${missing.map((k) => `${k} review`).join(", ")}, each with a jurisdiction and a reference.`
          : "Legal, regulatory and licensing reviews are recorded. The activity may be MODELLED; the engine still does not perform it."
        : "The Family Office is not a bank, not a licensed lender and not a credit provider. 'Be the bank, not the banker' describes disciplined internal capital management, never a regulated banking business (§7).",
      "A model is never an executed transaction (§13).",
    ],
  };
}
