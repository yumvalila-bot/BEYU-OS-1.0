/**
 * BEYU OS — POLICY DECISION REGISTER (pure).
 *
 *     Never silently invent policy.
 *
 * Whenever authoritative evidence is absent, the institution records a
 * POLICY DECISION REQUIRED. This module is the canonical shape of that record,
 * the standing register of open questions raised by the institution mandate, and
 * the guard that stops a requirement being resolved by anything other than a
 * human with the recorded authority.
 *
 * ============================ THREE INVARIANTS ============================
 *
 * 1. A REQUIREMENT RECORDS A QUESTION, NEVER AN ANSWER. `decision` is null until
 *    a human decides, and the options list never marks a preferred option.
 * 2. A REQUIREMENT IS NEVER AUTO-RESOLVED. `resolvePolicyDecision` requires an
 *    actor type of HUMAN, a decision maker, a governance reference and an
 *    effective date. Missing any one is refused.
 * 3. AN AI ACTOR MAY NEVER RESOLVE ONE. Noelia may summarise the register, rank
 *    the questions and draft the options. It may not decide them.
 */
import {
  POLICY_DECISION_STATUSES,
  assertHumanAuthority,
  assertIsoDate,
  isPresent,
  type FamilyActorType,
  type PolicyDecisionRequirement,
  type PolicyDecisionStatus,
} from "./model";

export const POLICY_DECISION_VERSION = "family-policy-decision-1.0.0";

/* ------------------------------------------------------------------ */
/* Construction                                                        */
/* ------------------------------------------------------------------ */

export type RaisePolicyDecisionInput = Omit<
  PolicyDecisionRequirement,
  "status" | "decision" | "decisionReference" | "effectiveDate"
> & { options?: string[] };

/**
 * Raise a POLICY DECISION REQUIRED.
 *
 * The requirement is created OPEN with no decision. There is no parameter that
 * lets a caller create it pre-resolved, because a pre-resolved requirement is an
 * invented policy with extra steps.
 */
export function raisePolicyDecisionRequirement(
  input: RaisePolicyDecisionInput,
): PolicyDecisionRequirement {
  if (!isPresent(input.code)) {
    throw new Error("A policy decision requirement must have a stable code.");
  }
  if (!isPresent(input.issue)) {
    throw new Error("A policy decision requirement must state the issue.");
  }
  if (input.options.length < 2) {
    throw new Error(
      `Policy decision ${input.code} must present at least two genuine options, including "do nothing yet". A single option is a decision, not a question.`,
    );
  }
  if (!isPresent(input.decisionAuthority)) {
    throw new Error(`Policy decision ${input.code} must name who has to decide it.`);
  }

  return {
    code: input.code,
    issue: input.issue,
    domain: input.domain,
    options: input.options,
    assumptions: input.assumptions,
    legalImplications: input.legalImplications,
    taxImplications: input.taxImplications,
    financialImplications: input.financialImplications,
    risk: input.risk,
    decisionAuthority: input.decisionAuthority,
    status: "OPEN",
    decision: null,
    decisionReference: null,
    effectiveDate: null,
  };
}

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

export type ResolutionInput = {
  actorType: FamilyActorType;
  /** The accountable human who decided. */
  decisionMaker: string;
  /** The decision itself, in the decider's words. */
  decision: string;
  /** Governance reference evidencing the decision — a resolution or instrument clause. */
  decisionReference: string;
  /** ISO date from which the decision takes effect. */
  effectiveDate: string;
};

/**
 * Resolve an open requirement.
 *
 * Refuses: an AI actor; a missing decision maker; a missing decision; a missing
 * governance reference; a missing or malformed effective date; and a requirement
 * that is already decided (a decision is corrected by a new governed decision,
 * never by editing the old one).
 */
export function resolvePolicyDecision(
  requirement: PolicyDecisionRequirement,
  resolution: ResolutionInput,
): PolicyDecisionRequirement {
  assertHumanAuthority(resolution.actorType, `resolve policy decision ${requirement.code}`);

  const problems: string[] = [];
  if (!isPresent(resolution.decisionMaker)) problems.push("No accountable decision maker recorded.");
  if (!isPresent(resolution.decision)) problems.push("No decision recorded.");
  if (!isPresent(resolution.decisionReference)) {
    problems.push("No governance reference. A policy decision must be evidenced by a resolution or instrument, not by memory.");
  }
  if (!isPresent(resolution.effectiveDate)) {
    problems.push("No effective date.");
  } else {
    try {
      assertIsoDate(resolution.effectiveDate, "effectiveDate");
    } catch (e) {
      problems.push((e as Error).message);
    }
  }
  if (requirement.status === "DECIDED") {
    problems.push(
      `${requirement.code} is already decided. A decision is superseded by a new governed decision; it is never edited.`,
    );
  }
  if (requirement.status === "REJECTED") {
    problems.push(`${requirement.code} was rejected. Raise a new requirement rather than resolving a rejected one.`);
  }

  if (problems.length > 0) {
    throw new Error(`Cannot resolve ${requirement.code}: ${problems.join(" ")}`);
  }

  return {
    ...requirement,
    status: "DECIDED",
    decision: resolution.decision,
    decisionReference: resolution.decisionReference,
    effectiveDate: resolution.effectiveDate,
  };
}

/* ------------------------------------------------------------------ */
/* The standing register                                               */
/* ------------------------------------------------------------------ */

/**
 * The open questions the Multigenerational Family Institution mandate raises but
 * cannot answer.
 *
 * Every entry here is a question this repository does NOT have authority to
 * settle. They are recorded rather than defaulted, because a family institution
 * that quietly picks defaults will eventually discover that its defaults were
 * decisions — made by nobody, approved by nobody, and very difficult to reverse.
 */
export const STANDING_POLICY_DECISIONS: readonly PolicyDecisionRequirement[] = [
  raisePolicyDecisionRequirement({
    code: "FAM-PD-001",
    issue: "What evidence is sufficient to verify each family-line relationship?",
    domain: "INSTITUTION",
    options: [
      "Ratify a single institutional minimum evidence standard.",
      "Set a per-jurisdiction evidence standard on legal advice.",
      "Require independent verification (registry extract or DNA) in addition to documents.",
      "Defer and verify case by case by Family Council resolution.",
    ],
    assumptions: ["A candidate standard exists in code but has not been ratified."],
    legalImplications: "Evidentiary sufficiency for descent, adoption and marriage is jurisdiction-specific and instrument-specific.",
    taxImplications: "Indirect: eligibility determines the tax character of distributions.",
    financialImplications: "Weak evidence permits ineligible participation in family capital.",
    risk: "Fraudulent lineage claims are the primary insider-abuse risk in a family institution.",
    decisionAuthority: "Family Council on legal advice, with Trustee confirmation for Trust classes.",
  }),
  raisePolicyDecisionRequirement({
    code: "FAM-PD-002",
    issue: "Are legally adopted children treated as direct descendants of the family line?",
    domain: "FAMILY_OWNERSHIP",
    options: [
      "Treat legally adopted children identically to birth descendants.",
      "Treat them as direct descendants only where the relevant instrument names them.",
      "Do not treat them as direct descendants; provide only through express instruments.",
    ],
    assumptions: ["No instrument provision was available to this repository."],
    legalImplications: "Adoption law and the definition of 'issue'/'descendants' in each Trust instrument control.",
    taxImplications: "Beneficiary class and generation-skipping treatment depend on the answer.",
    financialImplications: "Determines eligibility for family-line ownership and capital participation.",
    risk: "High. An incorrect default is very difficult to reverse once capital has moved.",
    decisionAuthority: "Family Council on legal advice; Trustees for Trust consequences.",
  }),
  raisePolicyDecisionRequirement({
    code: "FAM-PD-003",
    issue: "Are stepchildren and in-laws within the family line for any purpose?",
    domain: "FAMILY_OWNERSHIP",
    options: [
      "No family-line status for stepchildren or in-laws in any circumstance.",
      "Stepchildren included where a Trust instrument names them.",
      "Case-by-case by Family Council resolution with legal review.",
    ],
    assumptions: ["The mandate states eligibility must be explicitly defined; it does not define it."],
    legalImplications: "Forced-heirship and intestacy rules differ by jurisdiction.",
    taxImplications: "Affects the tax treatment of any distribution to them.",
    financialImplications: "Determines access to family capital and privileges.",
    risk: "Family conflict and reputational risk in both directions.",
    decisionAuthority: "Family Council on legal advice; Trustees for Trust consequences.",
  }),
  raisePolicyDecisionRequirement({
    code: "FAM-PD-004",
    issue: "What spousal participation is expressly governed, and on what terms?",
    domain: "FAMILY_GOVERNANCE",
    options: [
      "No spousal participation beyond attendance at family events.",
      "Derivative benefits through an eligible direct descendant, by express authorisation.",
      "Defined participation classes recorded in the Family Constitution.",
    ],
    assumptions: [
      "The mandate establishes that marriage confers nothing automatically and that spousal participation must be explicitly governed. It does not state the terms.",
    ],
    legalImplications: "Matrimonial property regimes differ by jurisdiction and may override family policy.",
    taxImplications: "Transfers between spouses are treated differently in every jurisdiction.",
    financialImplications: "Determines whether and how value may reach a spouse.",
    risk: "Undefined spousal participation is the most common source of family-institution dispute.",
    decisionAuthority: "Family Assembly and Family Council, on legal advice per jurisdiction.",
  }),
  raisePolicyDecisionRequirement({
    code: "FAM-PD-005",
    issue: "What is the materiality threshold for family institution decisions?",
    domain: "INSTITUTION",
    options: [
      "A single monetary threshold across all family institution decisions.",
      "Thresholds per domain (loans, distributions, investments, appointments).",
      "Thresholds per capital pool and per jurisdiction.",
      "Materiality defined by consequence rather than amount.",
    ],
    assumptions: ["No threshold was supplied."],
    legalImplications: "Interacts with delegated authority limits and Trust consent thresholds.",
    taxImplications: "None directly.",
    financialImplications: "Without a threshold, either every decision consumes Council time or decisions escape governance.",
    risk: "Governance failure in both directions.",
    decisionAuthority: "Family Council, recorded in the Family Constitution.",
  }),
  raisePolicyDecisionRequirement({
    code: "FAM-PD-006",
    issue: "What threshold is required to amend the Family Constitution's own amendment procedure?",
    domain: "AMENDMENT_PROCEDURE",
    options: [
      "Unanimity of the Family Assembly plus Family Council approval.",
      "Two-thirds of the Family Assembly with legal review and Trustee notification.",
      "The same threshold as any other provision (recorded as an explicit decision, not a default).",
    ],
    assumptions: ["No self-amendment threshold was supplied."],
    legalImplications: "Self-amendment thresholds are a matter for the instrument and applicable law.",
    taxImplications: "None directly.",
    financialImplications: "A weakly protected mechanism allows capital policy to change without adequate authority.",
    risk: "The mechanism protecting every other provision would itself be unprotected.",
    decisionAuthority: "Family Assembly on legal advice, by the procedure the current Constitution specifies.",
  }),
  raisePolicyDecisionRequirement({
    code: "FAM-PD-007",
    issue: "What are the six capital pools' owners, sources, permitted uses and allocation authorities?",
    domain: "FAMILY_CAPITAL",
    options: [
      "Define each pool in a Family Capital Policy ratified by the Family Council.",
      "Define pools per holding company under its constitutional documents.",
      "Define pools per jurisdiction.",
    ],
    assumptions: ["The six pool categories are canonical; their contents are not."],
    legalImplications: "Pool ownership determines which entity holds the capital and which law governs it.",
    taxImplications: "Pool character (permanent, lending, philanthropic) drives tax treatment.",
    financialImplications: "Without pool definitions, segregation cannot be enforced.",
    risk: "Capital deployed from the wrong pool is the principal capital-protection failure.",
    decisionAuthority: "Family Council on the recommendation of the Family Capital Committee, with Finance OS and tax input.",
  }),
  raisePolicyDecisionRequirement({
    code: "FAM-PD-008",
    issue: "Are concessional or zero-interest family loans permitted, and how is imputed interest treated?",
    domain: "FAMILY_CAPITAL",
    options: [
      "Market rate required in every case.",
      "Concessional rates permitted with imputed-interest treatment recorded for tax.",
      "Zero interest permitted only for education and emergency purposes.",
    ],
    assumptions: ["No lending policy was supplied."],
    legalImplications: "Below-market related-party loans can be recharacterised as distributions or gifts.",
    taxImplications: "Imputed interest may be taxable to the lender and deductible or taxable to the borrower.",
    financialImplications: "A concessional loan is a transfer of value and must be measured as one.",
    risk: "Related-party abuse and undisclosed wealth transfer.",
    decisionAuthority: "Family Loan Committee recommendation, Family Council approval, on tax advice per jurisdiction.",
  }),
  raisePolicyDecisionRequirement({
    code: "FAM-PD-009",
    issue: "Does the Trust instrument or applicable law confer any reserved Trust power on a family body?",
    domain: "FAMILY_GOVERNANCE",
    options: [
      "The instrument confers specific powers; record the clauses.",
      "Family bodies are advisory only on all reserved matters.",
      "Seek a Trust Protector determination where the instrument provides for one.",
    ],
    assumptions: ["No Trust instrument was available to this repository."],
    legalImplications: "Trustee independence and fiduciary duties are non-delegable unless the instrument and law provide otherwise.",
    taxImplications: "Family control can change Trust tax residence.",
    financialImplications: "Determines who may direct Trust investment and distribution.",
    risk: "Governance failure and potential Trustee liability.",
    decisionAuthority: "Legal counsel in the Trust jurisdiction, with the Trustees and any Trust Protector.",
  }),
  raisePolicyDecisionRequirement({
    code: "FAM-PD-010",
    issue: "What is the lawful basis, purpose and retention period for biometric registration of family members?",
    domain: "INSTITUTION",
    options: [
      "Do not collect biometrics; rely on document and in-person verification.",
      "Collect biometrics for identity verification only, with explicit consent and a defined retention period.",
      "Collect biometrics only where a jurisdiction requires it for a specific purpose.",
    ],
    assumptions: ["The mandate permits biometric registration 'where lawful' but supplies no basis."],
    legalImplications: "Special-category data protection rules apply in most jurisdictions and require an explicit lawful basis.",
    taxImplications: "None.",
    financialImplications: "Breach liability and remediation cost.",
    risk: "Data-protection enforcement, and irreversible loss of family trust. Biometrics cannot be reissued.",
    decisionAuthority: "Family Council on data-protection advice per jurisdiction; never collected merely because it is technically possible.",
  }),
  raisePolicyDecisionRequirement({
    code: "FAM-PD-011",
    issue: "How is health information about family members classified, accessed and retained?",
    domain: "INSTITUTION",
    options: [
      "Do not store health information; record only coverage and eligibility.",
      "Store health information under enhanced controls with named access.",
      "Store only aggregate protection exposure, never individual health data.",
    ],
    assumptions: ["The mandate requires enhanced privacy controls but does not define them."],
    legalImplications: "Health data is special-category data in most jurisdictions.",
    taxImplications: "None.",
    financialImplications: "Breach liability.",
    risk: "The most sensitive data class in the institution; a breach is personal and permanent.",
    decisionAuthority: "Family Council on data-protection advice, with the Family Health & Protection Committee.",
  }),
  raisePolicyDecisionRequirement({
    code: "FAM-PD-012",
    issue: "Which jurisdictions apply to each entity, Trust and family member, and what are the governing instruments?",
    domain: "INSTITUTION",
    options: [
      "Record a jurisdiction register with governing law, tax residence and regulatory regime per entity.",
      "Engage counsel per jurisdiction to produce the register.",
      "Limit the institution to jurisdictions already documented and defer the rest.",
    ],
    assumptions: ["Tanzanian law is never assumed to apply globally, and foreign law is never assumed to apply to Tanzania."],
    legalImplications: "Every material strategy requires jurisdiction-specific validation.",
    taxImplications: "Tax residence determines the entire tax analysis.",
    financialImplications: "Determines permitted structures and reporting obligations.",
    risk: "Applying the wrong jurisdiction's law is a silent, systemic error.",
    decisionAuthority: "Family Office legal function with external counsel, ratified by the Family Council.",
  }),
  raisePolicyDecisionRequirement({
    code: "FAM-PD-013",
    issue: "What are the Family Institution scorecard KPIs and their targets?",
    domain: "INSTITUTION",
    options: [
      "Adopt the mandate's seven KPI families with targets set by the Family Council.",
      "Adopt only the KPIs for which reliable data already exists in BEYU OS.",
      "Defer KPIs until the underlying records are populated.",
    ],
    assumptions: ["The mandate names the KPI families but supplies no targets or measurement basis."],
    legalImplications: "None.",
    taxImplications: "None.",
    financialImplications: "KPIs without a measurement basis produce misleading reporting.",
    risk: "A scorecard built on unavailable data is worse than no scorecard.",
    decisionAuthority: "Family Council, with the Family Office accountable for measurement.",
  }),
  raisePolicyDecisionRequirement({
    code: "FAM-PD-014",
    issue: "What curriculum, accreditation and completion standard does the Family Wealth Academy apply?",
    domain: "FAMILY_DEVELOPMENT",
    options: [
      "Internal curriculum with Family Council-defined completion standards.",
      "Externally accredited programmes where available.",
      "A blended model with external accreditation for finance and governance modules.",
    ],
    assumptions: ["The mandate names the curriculum areas but no standard."],
    legalImplications: "None, unless credentials are represented externally.",
    taxImplications: "Education funding may have tax treatment per jurisdiction.",
    financialImplications: "Determines education budget and next-generation capital use.",
    risk: "A credential that implies more than it is creates false venture-readiness evidence.",
    decisionAuthority: "Education Committee recommendation, Family Council approval.",
  }),
  raisePolicyDecisionRequirement({
    code: "FAM-PD-015",
    issue: "What are the succession criteria and readiness standards for each governed role?",
    domain: "FAMILY_SUCCESSION",
    options: [
      "Define criteria per role in the Family Constitution.",
      "Define criteria per role by the relevant committee under a Council-approved framework.",
      "Adopt external governance standards where they exist for the role.",
    ],
    assumptions: ["The mandate names the roles but not the criteria."],
    legalImplications: "Trustee and Trust Protector succession is governed by the instrument, not by family policy.",
    taxImplications: "None directly.",
    financialImplications: "Succession failure is a principal institutional risk.",
    risk: "Family status must not automatically become operational authority.",
    decisionAuthority: "Succession Committee recommendation, Family Council approval; Trustees for Trustee succession.",
  }),
];

/* ------------------------------------------------------------------ */
/* Register operations                                                 */
/* ------------------------------------------------------------------ */

/** Merge standing requirements with live ones. A live record wins on code. */
export function policyDecisionRegister(
  live: readonly PolicyDecisionRequirement[] = [],
): PolicyDecisionRequirement[] {
  const byCode = new Map<string, PolicyDecisionRequirement>();
  for (const r of STANDING_POLICY_DECISIONS) byCode.set(r.code, r);
  for (const r of live) byCode.set(r.code, r);
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export function openRequirements(
  register: readonly PolicyDecisionRequirement[],
): PolicyDecisionRequirement[] {
  return register.filter((r) => r.status === "OPEN" || r.status === "IN_REVIEW");
}

/**
 * Register summary for reporting.
 *
 * Includes the count of requirements raised by engines at runtime, so a report
 * can show that the institution is surfacing questions rather than answering
 * them quietly.
 */
export function summariseRegister(register: readonly PolicyDecisionRequirement[]): {
  version: string;
  total: number;
  byStatus: Record<PolicyDecisionStatus, number>;
  byDomain: Record<string, number>;
  openCodes: string[];
} {
  const byStatus = Object.fromEntries(POLICY_DECISION_STATUSES.map((s) => [s, 0])) as Record<
    PolicyDecisionStatus,
    number
  >;
  const byDomain: Record<string, number> = {};

  for (const r of register) {
    byStatus[r.status] += 1;
    byDomain[r.domain] = (byDomain[r.domain] ?? 0) + 1;
  }

  return {
    version: POLICY_DECISION_VERSION,
    total: register.length,
    byStatus,
    byDomain,
    openCodes: openRequirements(register)
      .map((r) => r.code)
      .sort(),
  };
}

/**
 * The invariant this register exists to enforce, stated as a check.
 *
 * Returns the requirements whose `decision` is populated without the authority
 * trail that must accompany it — which is to say, an invented policy.
 */
export function findInventedPolicies(
  register: readonly PolicyDecisionRequirement[],
): PolicyDecisionRequirement[] {
  return register.filter(
    (r) =>
      r.status === "DECIDED" &&
      (!isPresent(r.decision) || !isPresent(r.decisionReference) || !isPresent(r.effectiveDate)),
  );
}
