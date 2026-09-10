/**
 * BEYU OS — FAMILY OFFICE CAPITAL & WEALTH ENGINE: regulatory and market
 * intelligence (§21) and tax intelligence (§22).
 *
 * ============================== WHAT THIS IS ================================
 *
 * A register of external intelligence — tax, company law, financial regulation,
 * land, agriculture, healthcare, foreign exchange, trade, interest rates,
 * inflation, commodities, technology, demographics — where every item carries a
 * source, a date, a jurisdiction, a confidence level and the entities or assets
 * it affects, and is classified OPPORTUNITY, THREAT or REVIEW REQUIRED.
 *
 * §22 adds the tax epistemic ladder, which is the reason this module exists in
 * this form at all.
 *
 * ============================ THE §22 DISCIPLINE ==============================
 *
 * Tax data must distinguish, in this order of strength:
 *
 *   ASSUMPTION  → ESTIMATE → CURRENT_RULE → PROFESSIONAL_REVIEW →
 *   FINAL_ACCOUNTING_TREATMENT
 *
 * The Family Office may MODEL tax at the first three levels. It may record a
 * professional's review at the fourth. It may NEVER assert the fifth: final tax
 * treatment is the authority of Finance OS and qualified professionals. A record
 * that claims `FINAL_ACCOUNTING_TREATMENT` without a Finance OS reference is
 * refused, and a model at any lower level is refused when presented as final.
 *
 * This matters concretely: a book statement ("capital allowances reduce taxable
 * profit") read as universal tax law is how a family books a benefit it does not
 * have. Every tax figure here therefore carries its level, and the level travels
 * with the number.
 */

export const FAMILY_INTELLIGENCE_VERSION = "family-intelligence-1.0.0";

/* ------------------------------------------------------------------ */
/* §21 — Regulatory and market intelligence                            */
/* ------------------------------------------------------------------ */

/** The intelligence domains §21 names. */
export const INTELLIGENCE_DOMAINS = [
  "TAX",
  "COMPANY_LAW",
  "FINANCIAL_REGULATION",
  "LAND",
  "AGRICULTURE",
  "HEALTHCARE",
  "FOREIGN_EXCHANGE",
  "TRADE",
  "INTEREST_RATES",
  "INFLATION",
  "COMMODITIES",
  "TECHNOLOGY",
  "DEMOGRAPHICS",
] as const;
export type IntelligenceDomain = (typeof INTELLIGENCE_DOMAINS)[number];

/** The three classifications §21 requires. */
export const INTELLIGENCE_CLASSIFICATIONS = [
  { code: "OPPORTUNITY", label: "Opportunity", description: "A development the family may be able to act on." },
  { code: "THREAT", label: "Threat", description: "A development that could harm a family position." },
  { code: "REVIEW_REQUIRED", label: "Review required", description: "A development whose effect cannot be determined without review." },
] as const;
export type IntelligenceClassification = (typeof INTELLIGENCE_CLASSIFICATIONS)[number]["code"];

/**
 * Confidence in the item. Deliberately coarse: a precise-looking confidence
 * figure on a regulatory rumour would be false precision.
 */
export const CONFIDENCE_LEVELS = [
  { code: "CONFIRMED", label: "Confirmed", description: "Published in an official source and verified." },
  { code: "LIKELY", label: "Likely", description: "Corroborated by more than one credible source." },
  { code: "REPORTED", label: "Reported", description: "A single credible source, uncorroborated." },
  { code: "SPECULATIVE", label: "Speculative", description: "Rumour or inference. Never a basis for action." },
] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number]["code"];

export type RegulatoryEvent = {
  id: string;
  tenantId: string;
  domain: IntelligenceDomain;
  classification: IntelligenceClassification;
  title: string;
  summary: string;
  /** The source. Required: an unsourced intelligence item is a rumour. */
  source: string;
  sourceUrl: string | null;
  /** The date of the development, not the date it was recorded. */
  eventDate: string;
  /** The jurisdiction it applies in. Required: a tax change in one country is not a tax change. */
  jurisdictionRef: string;
  /** The countries affected. */
  countryCodes: readonly string[];
  confidence: ConfidenceLevel;
  /** The entities and assets it affects. Required: intelligence with no subject cannot be routed. */
  affectedEntityRefs: readonly string[];
  affectedAssetRefs: readonly string[];
  /** What the family should do about it. Advisory; never an instruction. */
  recommendedAction: string | null;
  /** Whether a review has been assigned. */
  reviewAssignedTo: string | null;
  reviewDueDate: string | null;
  status: "NEW" | "UNDER_REVIEW" | "ACTIONED" | "DISMISSED" | "EXPIRED";
  recordedBy: string;
  /** Always a human or a governed service. An AI-sourced item is marked UNVERIFIED. */
  recordedByActorType: "HUMAN" | "SERVICE" | "AI";
  recordedAt: string;
};

/**
 * Validate an intelligence item.
 *
 * Every field §21 requires is checked, and one rule is enforced beyond the brief:
 * an AI-recorded item may never carry `CONFIRMED` confidence. Noelia can retrieve
 * and summarise; confirming a regulatory development against its official source
 * is a verification act, and an unverified item presented as confirmed is the
 * specific failure that makes an intelligence register dangerous rather than
 * merely noisy.
 */
export function validateRegulatoryEvent(event: RegulatoryEvent): readonly string[] {
  const findings: string[] = [];
  if (!event.source.trim()) findings.push("A source is required. An unsourced intelligence item is a rumour and cannot enter the register as anything else.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.eventDate)) findings.push(`The event date must be ISO; received "${event.eventDate}".`);
  if (!event.jurisdictionRef.trim()) findings.push("A jurisdiction is required. A tax change in one country is not a tax change.");
  if (event.countryCodes.length === 0) findings.push("At least one affected country must be named, so country isolation can route the item.");
  if (event.affectedEntityRefs.length === 0 && event.affectedAssetRefs.length === 0) {
    findings.push("At least one affected entity or asset must be named. Intelligence with no subject cannot be routed to anyone.");
  }
  if (event.summary.trim().length < 20) findings.push("The summary must state what the development actually is.");
  if (event.confidence === "SPECULATIVE" && event.classification !== "REVIEW_REQUIRED") {
    findings.push(`A SPECULATIVE item must be classified REVIEW_REQUIRED. Classified ${event.classification}, which would let a rumour be read as an opportunity or a threat.`);
  }
  if (event.recordedByActorType === "AI" && event.confidence === "CONFIRMED") {
    findings.push("An AI-recorded item may not carry CONFIRMED confidence. Retrieval and summarisation are not verification; confirming a development against its official source is a human or governed-service act (§24).");
  }
  if (event.classification !== "OPPORTUNITY" && !event.reviewAssignedTo) {
    findings.push(`A ${event.classification} item must have a review assigned. An unassigned threat is a threat nobody owns.`);
  }
  return findings;
}

/**
 * Summarise the register: what is open, by domain, jurisdiction and
 * classification, and what is unowned.
 */
export function summariseIntelligenceRegister(events: readonly RegulatoryEvent[], asOf: string): {
  engineVersion: string;
  asOf: string;
  total: number;
  byClassification: { classification: IntelligenceClassification; count: number; ids: string[] }[];
  byDomain: { domain: IntelligenceDomain; count: number; threatCount: number }[];
  byJurisdiction: { jurisdictionRef: string; count: number; threatCount: number }[];
  byCountry: { countryCode: string; count: number; ids: string[] }[];
  /** Open threats with no owner. The most important list in the summary. */
  unownedThreats: { id: string; title: string; jurisdictionRef: string; eventDate: string }[];
  /** Overdue reviews. */
  overdueReviews: { id: string; title: string; reviewDueDate: string | null; reviewAssignedTo: string | null }[];
  /** Items excluded, with the reason. */
  excluded: { id: string; reason: string }[];
  explanation: string[];
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`asOf must be an ISO date; received "${asOf}".`);
  const excluded: { id: string; reason: string }[] = [];
  const valid: RegulatoryEvent[] = [];
  for (const event of events) {
    const findings = validateRegulatoryEvent(event);
    if (findings.length > 0) {
      excluded.push({ id: event.id, reason: findings[0] });
      continue;
    }
    valid.push(event);
  }
  const open = valid.filter((e) => e.status === "NEW" || e.status === "UNDER_REVIEW");

  return {
    engineVersion: FAMILY_INTELLIGENCE_VERSION,
    asOf,
    total: valid.length,
    byClassification: INTELLIGENCE_CLASSIFICATIONS.map((c) => {
      const rows = valid.filter((e) => e.classification === c.code);
      return { classification: c.code, count: rows.length, ids: rows.map((e) => e.id) };
    }),
    byDomain: INTELLIGENCE_DOMAINS.map((domain) => {
      const rows = valid.filter((e) => e.domain === domain);
      return { domain, count: rows.length, threatCount: rows.filter((e) => e.classification === "THREAT").length };
    }).filter((d) => d.count > 0),
    byJurisdiction: [...new Set(valid.map((e) => e.jurisdictionRef))].sort().map((jurisdictionRef) => {
      const rows = valid.filter((e) => e.jurisdictionRef === jurisdictionRef);
      return { jurisdictionRef, count: rows.length, threatCount: rows.filter((e) => e.classification === "THREAT").length };
    }),
    byCountry: [...new Set(valid.flatMap((e) => [...e.countryCodes]))].sort().map((countryCode) => {
      const rows = valid.filter((e) => e.countryCodes.includes(countryCode));
      return { countryCode, count: rows.length, ids: rows.map((e) => e.id) };
    }),
    unownedThreats: open.filter((e) => e.classification === "THREAT" && !e.reviewAssignedTo).map((e) => ({ id: e.id, title: e.title, jurisdictionRef: e.jurisdictionRef, eventDate: e.eventDate })),
    overdueReviews: open.filter((e) => e.reviewDueDate !== null && e.reviewDueDate < asOf).map((e) => ({ id: e.id, title: e.title, reviewDueDate: e.reviewDueDate, reviewAssignedTo: e.reviewAssignedTo })),
    excluded,
    explanation: [
      `${valid.length} valid item(s); ${excluded.length} excluded and named.`,
      `${open.filter((e) => e.classification === "THREAT").length} open threat(s); ${open.filter((e) => e.classification === "THREAT" && !e.reviewAssignedTo).length} of them unowned.`,
      "An intelligence item is never an instruction. It says something changed; whether to act is a governance decision (§21).",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* §22 — Tax intelligence epistemics                                   */
/* ------------------------------------------------------------------ */

/**
 * The tax epistemic ladder, ordered weakest to strongest.
 *
 * The order is the point: a figure can only be *promoted* up the ladder by an act
 * that carries the authority for that level, and `promoteTaxFigure` refuses any
 * promotion the evidence does not support.
 */
export const TAX_EPISTEMIC_LEVELS = [
  { rank: 1, code: "ASSUMPTION", label: "Assumption", description: "An input someone chose. Never evidence for its own correctness." },
  { rank: 2, code: "ESTIMATE", label: "Estimate", description: "Computed from assumptions and observed data. Still not a determination." },
  { rank: 3, code: "CURRENT_RULE", label: "Current rule", description: "The rule as currently published, in a named jurisdiction, as at a date." },
  { rank: 4, code: "PROFESSIONAL_REVIEW", label: "Professional review", description: "A qualified professional has reviewed it. Recorded by reference." },
  { rank: 5, code: "FINAL_ACCOUNTING_TREATMENT", label: "Final accounting treatment", description: "Finance OS's determination. Never asserted by the Family Office." },
] as const;
export type TaxEpistemicLevel = (typeof TAX_EPISTEMIC_LEVELS)[number]["code"];

export function taxLevelRank(level: TaxEpistemicLevel): number {
  return TAX_EPISTEMIC_LEVELS.find((l) => l.code === level)?.rank ?? 0;
}

/** What the Family Office may do at each level. */
export const FAMILY_OFFICE_TAX_AUTHORITY: Record<TaxEpistemicLevel, "MAY_MODEL" | "MAY_RECORD" | "MUST_NOT_ASSERT"> = {
  ASSUMPTION: "MAY_MODEL",
  ESTIMATE: "MAY_MODEL",
  CURRENT_RULE: "MAY_MODEL",
  PROFESSIONAL_REVIEW: "MAY_RECORD",
  FINAL_ACCOUNTING_TREATMENT: "MUST_NOT_ASSERT",
};

export type TaxPosition = {
  id: string;
  tenantId: string;
  /** The matter the tax position concerns. */
  subjectRef: string;
  subjectKind: "INVESTMENT" | "PROPERTY" | "ENTITY" | "TRANSACTION" | "OBLIGATION" | "DISTRIBUTION";
  jurisdictionRef: string;
  countryCode: string;
  /** The tax type. */
  taxType: string;
  /** The amount, minor units. Always at the stated level, never implicitly final. */
  amountMinor: number;
  currency: string;
  /** The epistemic level. Travels with the amount. */
  level: TaxEpistemicLevel;
  /** The rule relied on, where the level is CURRENT_RULE or above. */
  ruleReference: string | null;
  /** The date the rule was checked. A rule without a date goes stale silently. */
  ruleAsOf: string | null;
  /** The professional's reference, where the level is PROFESSIONAL_REVIEW. */
  professionalReviewRef: string | null;
  /** The Finance OS reference, where the level is FINAL_ACCOUNTING_TREATMENT. */
  financeRecordRef: string | null;
  /** Who recorded it. */
  recordedBy: string;
  recordedByActorType: "HUMAN" | "SERVICE" | "AI";
  asOf: string;
};

/**
 * Validate a tax position.
 *
 * The ladder is enforced structurally:
 *   - `CURRENT_RULE` and above require a rule reference and a date;
 *   - `PROFESSIONAL_REVIEW` requires the professional's reference;
 *   - `FINAL_ACCOUNTING_TREATMENT` requires a Finance OS reference, and the
 *     Family Office may never CREATE one — only record that Finance OS made it.
 *
 * The last rule is the whole of §22. A family office that asserts final tax
 * treatment has quietly taken accounting authority it does not have (§32).
 */
export function validateTaxPosition(position: TaxPosition): readonly string[] {
  const findings: string[] = [];
  if (!Number.isInteger(position.amountMinor)) findings.push("Amount must be an integer number of minor units.");
  if (!position.jurisdictionRef.trim()) findings.push("A jurisdiction is required. A tax position with no jurisdiction is not a tax position.");
  if (!/^[A-Z]{2}$/.test(position.countryCode)) findings.push(`Country must be ISO 3166-1 alpha-2; received "${position.countryCode}".`);

  const rank = taxLevelRank(position.level);
  if (rank >= 3 && !position.ruleReference) {
    findings.push(`A ${position.level} position must cite the rule it relies on. An uncited "current rule" is an assumption wearing a stronger label.`);
  }
  if (rank >= 3 && !position.ruleAsOf) {
    findings.push(`A ${position.level} position must state the date the rule was checked. Tax rules change; a rule without a date goes stale silently and keeps being relied on.`);
  }
  if (position.level === "PROFESSIONAL_REVIEW" && !position.professionalReviewRef) {
    findings.push("A PROFESSIONAL_REVIEW position must reference the professional's review. Without it the level is unsupported.");
  }
  if (position.level === "FINAL_ACCOUNTING_TREATMENT") {
    if (!position.financeRecordRef) {
      findings.push("A FINAL_ACCOUNTING_TREATMENT position must reference the Finance OS determination. The Family Office may record that Finance OS decided; it may never decide (§22, §32).");
    }
    if (position.recordedByActorType === "AI") {
      findings.push("An AI actor may never record a FINAL_ACCOUNTING_TREATMENT position (§22, §24).");
    }
  }
  if (rank <= 3 && position.financeRecordRef) {
    findings.push(`A Finance OS reference on a ${position.level} position implies a finality the level does not have. Remove the reference or promote the level with the authority for it.`);
  }
  return findings;
}

/**
 * Refuse a promotion the evidence does not support.
 *
 * `ASSUMPTION → ESTIMATE` needs a stated basis. `ESTIMATE → CURRENT_RULE` needs a
 * rule reference and a date. `CURRENT_RULE → PROFESSIONAL_REVIEW` needs the
 * professional's reference. `→ FINAL_ACCOUNTING_TREATMENT` needs a Finance OS
 * reference, and can only ever be performed by Finance OS itself.
 */
export function promoteTaxPosition(params: {
  position: TaxPosition;
  toLevel: TaxEpistemicLevel;
  ruleReference?: string | null;
  ruleAsOf?: string | null;
  professionalReviewRef?: string | null;
  financeRecordRef?: string | null;
  actorType: "HUMAN" | "SERVICE" | "AI";
}): { position: TaxPosition; promoted: boolean; reason: string } {
  const from = taxLevelRank(params.position.level);
  const to = taxLevelRank(params.toLevel);
  if (to <= from) {
    return { position: params.position, promoted: false, reason: `${params.toLevel} is not above ${params.position.level}. A demotion is a correction and requires a new record, not a promotion.` };
  }
  if (to - from > 1) {
    return {
      position: params.position,
      promoted: false,
      reason: `Cannot promote from ${params.position.level} to ${params.toLevel}: the ladder is climbed one level at a time, because each level requires its own evidence.`,
    };
  }
  if (params.toLevel === "FINAL_ACCOUNTING_TREATMENT") {
    if (!params.financeRecordRef) {
      return { position: params.position, promoted: false, reason: "FINAL_ACCOUNTING_TREATMENT requires a Finance OS determination reference. The Family Office may never assert final tax treatment (§22)." };
    }
    return {
      position: { ...params.position, level: params.toLevel, financeRecordRef: params.financeRecordRef, recordedByActorType: params.actorType },
      promoted: true,
      reason: `Recorded that Finance OS determined the final treatment (reference ${params.financeRecordRef}). The Family Office records the determination; it did not make it.`,
    };
  }
  if (params.toLevel === "PROFESSIONAL_REVIEW" && !params.professionalReviewRef) {
    return { position: params.position, promoted: false, reason: "PROFESSIONAL_REVIEW requires the professional's reference." };
  }
  if (params.toLevel === "CURRENT_RULE" && (!params.ruleReference || !params.ruleAsOf)) {
    return { position: params.position, promoted: false, reason: "CURRENT_RULE requires both the rule reference and the date it was checked." };
  }

  return {
    position: {
      ...params.position,
      level: params.toLevel,
      ruleReference: params.ruleReference ?? params.position.ruleReference,
      ruleAsOf: params.ruleAsOf ?? params.position.ruleAsOf,
      professionalReviewRef: params.professionalReviewRef ?? params.position.professionalReviewRef,
      recordedByActorType: params.actorType,
    },
    promoted: true,
    reason: `Promoted to ${params.toLevel} on the evidence supplied.`,
  };
}

/**
 * Refuse a tax-led investment rationale (CAP-012).
 *
 * "Tax benefits cannot rescue an economically bad investment." A rationale whose
 * only substantive content is a tax benefit is refused: the economic case must be
 * stated first, and the tax effect recorded as a secondary consideration.
 */
export function assertRationaleIsNotTaxLedOnly(params: { rationale: string; preTaxReturnBps: number | null }): void {
  if (params.preTaxReturnBps === null) {
    throw new Error(
      "A capital rationale must state the pre-tax return. Assessing the tax effect before the economics is precisely what CAP-012 forbids, and without a pre-tax figure the economics have not been assessed at all.",
    );
  }
  const taxTerms = ["tax", "allowance", "deduction", "credit", "relief", "incentive", "exemption", "deferral", "shield", "capital allowance", "vat"];
  let stripped = params.rationale.toLowerCase();
  for (const term of taxTerms) stripped = stripped.split(term).join(" ");
  const substantive = stripped.replace(/[\s.,;:()\-–—"'’%]/g, "");
  if (substantive.length < 40) {
    throw new Error(
      `A rationale consisting only of tax benefit is refused (CAP-012). Tax benefits cannot rescue an economically bad investment; the pre-tax economic case must be stated. Pre-tax return on record: ${params.preTaxReturnBps} bps.`,
    );
  }
}
