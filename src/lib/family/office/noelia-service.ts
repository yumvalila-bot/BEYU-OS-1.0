/**
 * BEYU Family Office — Noelia intelligence service (capital, wealth & generational).
 *
 * Noelia is the single canonical AI identity. These are Family Office capabilities
 * on the canonical HIVE runtime, NOT a second AI system and not a second Family
 * Office: the identity, answer tagging, model gateway and permission machinery all
 * remain in `src/lib/noelia/` and are untouched here.
 *
 * Every method:
 *
 *   - inherits the invoking principal's RBAC/ABAC, tenant, entity, country and
 *     classification scope (nothing is re-derived from input),
 *   - reads authorised rows only (finite tenant predicates + classification
 *     ceilings), and
 *   - NEVER persists, approves, transfers, executes, changes ownership, bypasses a
 *     governance step or posts to the ledger.
 *
 * Those prohibitions are not a style preference. Noelia has analytical authority
 * and nothing else; a tool path that could approve or move money would make the
 * audit trail lie about who decided.
 *
 * Simulation and drafting run the pure engines WITHOUT writing: their output is a
 * proposal a human must review and submit through a governed API.
 */
import { and, inArray } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import {
  familyCapitalAllocations,
  familyCommitteeDecisions,
  familyInsurancePolicies,
  familyInvestments,
  familyLiquiditySnapshots,
  familyObligations,
  familyRegulatoryEvents,
  familyTaxPositions,
} from "@/db/schema";
import { CLASSIFICATION_ORDER, classificationRank, isKnownClassification } from "@/lib/constants";
import type { NoeliaToolOutput, ToolInvocationContext } from "@/lib/noelia/types";
import { projectCapital, validateCommitteeDecision } from "@/lib/family/office/capital-wealth";
import { minorToNumeric, numericToMinor } from "@/lib/family-office-capital-service";

function requireCanonicalContext(): void {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Family Office Noelia services require canonical transaction-scoped tenant context");
  }
}

/** The classification ceiling implied by the caller's clearance. Never widened by input. */
function visibleClassifications(context: ToolInvocationContext) {
  if (!isKnownClassification(context.principal.clearance)) return [];
  return CLASSIFICATION_ORDER.filter((c) => classificationRank(c) <= classificationRank(context.principal.clearance));
}

/** Format integer minor units for display only. The authoritative value stays an integer. */
function money(valueMinor: number, currency: string): string {
  return `${minorToNumeric(valueMinor)} ${currency}`;
}

const ACCOUNTING_BOUNDARY =
  "Finance OS is the sole authority for accounting, journals, posting, periods, reconciliation and statements. Nothing Noelia reports here is an accounting entry.";

const APPROVAL_BOUNDARY =
  "Noelia may analyze, calculate, summarize, simulate, recommend, alert and draft. It may not approve, transfer, execute, change ownership, bypass a governance step or post to the ledger. A capital decision requires a recorded committee resolution citing document evidence; an AI summary is never that evidence.";

export class BeyuNoeliaFamilyOfficeService {
  /**
   * §13 — investment book: positions, measures and governance status.
   *
   * Unrealised figures are reported with their valuation basis attached, and a
   * position with no mark is reported as unmarked rather than as zero.
   */
  async investments(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const classifications = visibleClassifications(context);
    if (classifications.length === 0) return { findings: [], limitations: ["No classification is visible at your clearance."] };

    const rows = await db
      .select()
      .from(familyInvestments)
      .where(and(inArray(familyInvestments.tenantId, context.scope.tenantIds), inArray(familyInvestments.classification, classifications)));

    const byStatus = new Map<string, number>();
    for (const r of rows) byStatus.set(r.governanceStatus, (byStatus.get(r.governanceStatus) ?? 0) + 1);
    const unmarked = rows.filter((r) => !r.currentValue).length;
    const missingAuthority = rows.filter((r) => !r.committeeDecisionId && !["IDEA", "SCREENING"].includes(r.governanceStatus)).length;

    return {
      findings: [
        { label: "Investments in scope", value: String(rows.length), kind: "FACT" },
        { label: "Currencies", value: [...new Set(rows.map((r) => r.currency))].join(", ") || "none", kind: "FACT" },
        { label: "Positions with no valuation mark", value: String(unmarked), kind: "FACT" },
        { label: "Past screening with no committee decision on record", value: String(missingAuthority), kind: "FACT" },
        ...[...byStatus.entries()].map(([status, count]) => ({ label: `Governance status ${status}`, value: String(count), kind: "FACT" as const })),
      ],
      sources: [{ kind: "TABLE", ref: "family_investments", label: "Family Office investment register", authority: "FAMILY_OFFICE" }],
      headline: `${rows.length} investment position(s) in scope`,
      assumptions: ["Totals are per currency. No cross-currency total is produced because no FX rate has been ratified."],
      limitations: [ACCOUNTING_BOUNDARY],
      humanReviewRequired: true,
    };
  }

  /**
   * §8 — the obligation register: who owes whom, in which country, under what terms.
   *
   * Obligations with no recorded maturity are counted and named. A maturity nobody
   * wrote down is a refinancing risk nobody is monitoring.
   */
  async obligations(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const classifications = visibleClassifications(context);
    if (classifications.length === 0) return { findings: [], limitations: ["No classification is visible at your clearance."] };

    const rows = await db
      .select()
      .from(familyObligations)
      .where(and(inArray(familyObligations.tenantId, context.scope.tenantIds), inArray(familyObligations.classification, classifications)));

    const byDirection = new Map<string, number>();
    const byCurrency = new Map<string, number>();
    for (const r of rows) {
      byDirection.set(r.direction, (byDirection.get(r.direction) ?? 0) + 1);
      byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + 1);
    }
    const noMaturity = rows.filter((r) => !r.maturityDate).length;
    const floating = rows.filter((r) => r.rateType === "FLOATING").length;

    return {
      findings: [
        { label: "Obligations in scope", value: String(rows.length), kind: "FACT" },
        { label: "Floating-rate exposure", value: String(floating), kind: "FACT" },
        { label: "Obligations with no recorded maturity", value: String(noMaturity), kind: "FACT" },
        ...[...byDirection.entries()].map(([direction, count]) => ({ label: `Direction ${direction}`, value: String(count), kind: "FACT" as const })),
        ...[...byCurrency.entries()].map(([currency, count]) => ({ label: `Currency ${currency}`, value: String(count), kind: "FACT" as const })),
      ],
      sources: [{ kind: "TABLE", ref: "family_obligations", label: "Family Office obligation register", authority: "FAMILY_OFFICE" }],
      headline: `${rows.length} obligation(s) across ${byCurrency.size} currency(ies)`,
      risks:
        noMaturity > 0
          ? [`${noMaturity} obligation(s) have no recorded maturity date and therefore cannot be monitored for refinancing risk.`]
          : [],
      assumptions: ["Outstanding balances are per currency and are not aggregated across currencies."],
      limitations: [ACCOUNTING_BOUNDARY],
      humanReviewRequired: true,
    };
  }

  /**
   * §10/§21 — the allocation pipeline and committee decisions, re-validated.
   *
   * Quorum and majority are recomputed from the recorded votes. Noelia reports a
   * decision whose arithmetic does not hold as a finding rather than repeating it
   * as approved — summarising a void decision as valid would be worse than
   * silence.
   */
  async committee(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const classifications = visibleClassifications(context);
    if (classifications.length === 0) return { findings: [], limitations: ["No classification is visible at your clearance."] };

    const [allocations, decisions] = await Promise.all([
      db
        .select()
        .from(familyCapitalAllocations)
        .where(and(inArray(familyCapitalAllocations.tenantId, context.scope.tenantIds), inArray(familyCapitalAllocations.classification, classifications))),
      db
        .select()
        .from(familyCommitteeDecisions)
        .where(and(inArray(familyCommitteeDecisions.tenantId, context.scope.tenantIds), inArray(familyCommitteeDecisions.classification, classifications))),
    ]);

    const invalid = decisions
      .map((row) => ({
        id: row.id,
        findings: validateCommitteeDecision({
          id: row.id,
          tenantId: row.tenantId,
          allocationId: row.allocationId ?? "",
          decision: row.decision as never,
          bodyRef: row.bodyRef,
          members: ((row.members as unknown[]) ?? []) as never,
          quorumMinimum: row.quorumMinimum,
          majorityRule: row.majorityRule as never,
          date: row.decisionDate,
          reason: row.reason,
          conditions: (row.conditions as string[] | null) ?? [],
          followUps: (row.followUps as { action: string; ownerRef: string; dueDate: string }[] | null) ?? [],
          authorityRef: row.authorityRef,
          decidedByActorType: row.decidedByActorType as never,
          requesterRef: row.requesterRef,
          executorRef: row.executorRef,
          reconcilerRef: row.reconcilerRef,
        }),
      }))
      .filter((d) => d.findings.length > 0);

    const unauthorised = decisions.filter((d) => (d.decision === "APPROVE" || d.decision === "APPROVE_WITH_CONDITIONS") && !d.authorityRef).length;
    const segregationBreaches = allocations.filter((a) => a.requesterRef && a.requesterRef === a.executorRef).length;

    return {
      findings: [
        { label: "Capital allocation cases", value: String(allocations.length), kind: "FACT" },
        { label: "Committee decisions", value: String(decisions.length), kind: "FACT" },
        { label: "Decisions failing quorum or majority validation", value: String(invalid.length), kind: "FACT", status: "DERIVED" },
        { label: "Approvals with no authority instrument", value: String(unauthorised), kind: "FACT" },
        { label: "Allocations where requester and executor are the same party", value: String(segregationBreaches), kind: "FACT" },
      ],
      sources: [
        { kind: "TABLE", ref: "family_capital_allocations", label: "Family Office allocation pipeline", authority: "FAMILY_OFFICE" },
        { kind: "TABLE", ref: "family_committee_decisions", label: "Family Office committee decisions", authority: "FAMILY_OFFICE" },
      ],
      headline: `${decisions.length} committee decision(s), ${invalid.length} failing validation`,
      risks: invalid.map((d) => `Decision ${d.id} does not satisfy its own quorum and majority rules: ${d.findings.join(" ")}`),
      limitations: [APPROVAL_BOUNDARY],
      humanReviewRequired: true,
    };
  }

  /**
   * §24/§25 — regulatory and tax intelligence.
   *
   * Tax positions resting on an ASSUMPTION or ESTIMATE with no professional review
   * are separated out. Noelia may summarise them; it may not promote them, and a
   * summary that presented an assumption as a rule would be the failure §25 exists
   * to prevent.
   */
  async intelligence(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const classifications = visibleClassifications(context);
    if (classifications.length === 0) return { findings: [], limitations: ["No classification is visible at your clearance."] };

    const [regulatory, tax] = await Promise.all([
      db
        .select()
        .from(familyRegulatoryEvents)
        .where(and(inArray(familyRegulatoryEvents.tenantId, context.scope.tenantIds), inArray(familyRegulatoryEvents.classification, classifications))),
      db
        .select()
        .from(familyTaxPositions)
        .where(and(inArray(familyTaxPositions.tenantId, context.scope.tenantIds), inArray(familyTaxPositions.classification, classifications))),
    ]);

    const needsReview = regulatory.filter((e) => e.status === "REVIEW_REQUIRED").length;
    const unreviewedTax = tax.filter((t) => (t.level === "ASSUMPTION" || t.level === "ESTIMATE") && !t.professionalReviewRef).length;

    return {
      findings: [
        { label: "Regulatory / market events", value: String(regulatory.length), kind: "FACT" },
        { label: "Flagged REVIEW REQUIRED", value: String(needsReview), kind: "FACT" },
        { label: "Tax positions", value: String(tax.length), kind: "FACT" },
        { label: "Tax positions resting on an unreviewed assumption or estimate", value: String(unreviewedTax), kind: "FACT" },
      ],
      sources: [
        { kind: "TABLE", ref: "family_regulatory_events", label: "Family Office regulatory intelligence", authority: "FAMILY_OFFICE" },
        { kind: "TABLE", ref: "family_tax_positions", label: "Family Office tax positions", authority: "FAMILY_OFFICE" },
      ],
      headline: `${regulatory.length} intelligence item(s), ${needsReview} requiring review`,
      assumptions: [
        "Tax levels are internal classifications: ASSUMPTION, ESTIMATE, CURRENT_RULE, PROFESSIONAL_REVIEW, FINAL_ACCOUNTING_TREATMENT. Nothing here is book-derived tax law and nothing is a filing position.",
      ],
      uncertainty: [`An expired rule read as current is the failure mode this register exists to prevent; ${regulatory.length} item(s) carry an effective window that should be checked against today's date.`],
      limitations: [
        "Noelia cannot give tax or legal advice. A tax position becomes a final accounting treatment only when the responsible authority marks it as one.",
      ],
      humanReviewRequired: true,
    };
  }

  /**
   * §28 — capital simulator. Runs the pure projection engine and writes nothing.
   *
   * Every rate is a caller input. No default return, fee, tax or inflation rate is
   * supplied, because a hard-coded one would be an unratified investment policy
   * presented as a fact. The result is labelled SCENARIO and `outcomeGuaranteed`
   * is structurally false.
   */
  async simulate(context: ToolInvocationContext, input: {
    startingCapitalMinor: number;
    monthlyContributionMinor: number;
    annualReturnBps: number;
    annualFeeBps: number;
    annualTaxBps: number;
    annualInflationBps: number;
    years: 5 | 10 | 20 | 30 | 50;
    currency: string;
  }): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const projection = projectCapital({
      startingCapitalMinor: input.startingCapitalMinor,
      monthlyContributionMinor: input.monthlyContributionMinor,
      annualReturnBps: input.annualReturnBps,
      annualFeeBps: input.annualFeeBps,
      annualTaxBps: input.annualTaxBps,
      annualInflationBps: input.annualInflationBps,
      years: input.years,
      annualWithdrawalMinor: 0,
    });

    return {
      findings: [
        { label: `Projected nominal value at year ${input.years}`, value: money(projection.terminalNominalMinor, input.currency), kind: "INFERENCE", status: "SCENARIO" },
        { label: `Projected real (inflation-adjusted) value`, value: money(projection.terminalRealMinor, input.currency), kind: "INFERENCE", status: "SCENARIO" },
        { label: "Horizon (years)", value: String(input.years), kind: "FACT" },
      ],
      headline: `Projection over ${input.years} years — scenario only`,
      assumptions: [
        `Return ${input.annualReturnBps / 100}% p.a., fee ${input.annualFeeBps / 100}% p.a., tax ${input.annualTaxBps / 100}% p.a., inflation ${input.annualInflationBps / 100}% p.a. — all supplied by the caller.`,
        ...projection.assumptions,
      ],
      uncertainty: ["A projection is not a forecast. Actual outcomes depend on returns, fees, tax treatment and inflation that none of these inputs can establish."],
      limitations: [
        "This is a SCENARIO with outcomeGuaranteed: false. No projection produced here is guaranteed, and none should be presented as a target.",
        APPROVAL_BOUNDARY,
      ],
      forecasts: [`Nominal ${money(projection.terminalNominalMinor, input.currency)} / real ${money(projection.terminalRealMinor, input.currency)} at year ${input.years}`],
      humanReviewRequired: true,
    };
  }

  /**
   * §19 — liquidity posture from the latest stored projection.
   *
   * Read from stored snapshots rather than recomputed: the projection engine needs
   * caller-supplied Finance OS balances, and inventing the denominator in order to
   * report a ratio is precisely what this service must not do.
   */
  async liquidity(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const classifications = visibleClassifications(context);
    if (classifications.length === 0) return { findings: [], limitations: ["No classification is visible at your clearance."] };

    const rows = await db
      .select()
      .from(familyLiquiditySnapshots)
      .where(and(inArray(familyLiquiditySnapshots.tenantId, context.scope.tenantIds), inArray(familyLiquiditySnapshots.classification, classifications)));

    const latest = rows.sort((a, b) => (a.asOf < b.asOf ? 1 : -1)).slice(0, 1);

    return {
      findings: latest.length
        ? [
            { label: "As of", value: latest[0].asOf, kind: "FACT" },
            { label: "Currency", value: latest[0].currency, kind: "FACT" },
            { label: "Liquid", value: `${latest[0].liquid} ${latest[0].currency}`, kind: "FACT" },
            { label: "Near-liquid", value: `${latest[0].nearLiquid} ${latest[0].currency}`, kind: "FACT" },
            { label: "Liquidity coverage", value: latest[0].liquidityCoverageBps === null ? "not computable" : `${latest[0].liquidityCoverageBps / 100}%`, kind: "FACT", status: "DERIVED" },
            { label: "Runway (days)", value: latest[0].liquidityRunwayDays === null ? "not computable" : String(latest[0].liquidityRunwayDays), kind: "FACT", status: "DERIVED" },
          ]
        : [{ label: "Stored liquidity projections", value: "0", kind: "FACT" }],
      sources: [{ kind: "TABLE", ref: "family_liquidity_snapshots", label: "Family Office liquidity projections", authority: "FAMILY_OFFICE" }],
      headline: latest.length ? `Liquidity as of ${latest[0].asOf} (${latest[0].currency})` : "No stored liquidity projection in scope",
      limitations: [
        "A liquidity projection is a projection. Alerts are advisory only and never freeze, transfer or approve anything.",
        ACCOUNTING_BOUNDARY,
      ],
      humanReviewRequired: true,
    };
  }
  /* ---------------------------------------------------------------- */
  /* Protection & insurance — governed READ/summarise only (§27).      */
  /* No tool here may bind, cancel, modify, change a beneficiary,      */
  /* approve a claim or move money: none of those even have a service   */
  /* method on this class, and the write paths they would need are      */
  /* permission-bound routes a tool has no registration against.       */
  /* ---------------------------------------------------------------- */

  /**
   * §24/§27 — protection book summary: counts, contingent per-currency totals
   * and review exceptions. Death benefits are reported as CONTINGENT; no
   * wealth total is produced, because this domain has no authority to make one.
   */
  async protectionPolicies(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const classifications = visibleClassifications(context);
    if (classifications.length === 0) return { findings: [], limitations: ["No classification is visible at your clearance."] };

    const rows = await db
      .select()
      .from(familyInsurancePolicies)
      .where(and(inArray(familyInsurancePolicies.tenantId, context.scope.tenantIds), inArray(familyInsurancePolicies.classification, classifications)));

    const inForce = rows.filter((r) => r.status === "IN_FORCE");
    const byCurrency = new Map<string, { policies: number; contingentMinor: number }>();
    for (const r of inForce) {
      const c = byCurrency.get(r.currency) ?? { policies: 0, contingentMinor: 0 };
      c.policies += 1;
      c.contingentMinor += numericToMinor(r.deathBenefit);
      byCurrency.set(r.currency, c);
    }
    const dueForReview = rows.filter((r) => r.nextReviewDate !== null && r.nextReviewDate <= new Date().toISOString().slice(0, 10)).length;

    return {
      findings: [
        { label: "Policies in scope", value: String(rows.length), kind: "FACT" },
        { label: "In force", value: String(inForce.length), kind: "FACT" },
        { label: "Review due or past", value: String(dueForReview), kind: "FACT" },
        ...[...byCurrency.entries()].map(([currency, v]) => ({
          label: `Contingent death-benefit protection (${currency})`,
          value: `${(v.contingentMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} across ${v.policies} policy(ies)`,
          kind: "FACT" as const,
        })),
      ],
      sources: [{ kind: "TABLE", ref: "family_insurance_policies", label: "Family Office protection register", authority: "FAMILY_OFFICE" }],
      headline: `${inForce.length} in-force protection record(s)${byCurrency.size > 0 ? `; per-currency contingent totals attached` : ""}`,
      assumptions: ["No FX conversion is performed: totals are per currency because no cross-currency rate is ratified in this domain."],
      limitations: [
        "Death-benefit amounts are CONTINGENT protection, never liquid wealth; this summary adds nothing to any net-worth figure.",
        ACCOUNTING_BOUNDARY,
        APPROVAL_BOUNDARY,
        "This is a summary of records, not advice, not an insurer quotation, and not an underwriting statement.",
      ],
      humanReviewRequired: true,
    };
  }

  /**
   * §27 — flag review dates and missing information for the protection
   * register: missing beneficiary documents, absent review dates and lapsed
   * premium cadence on the rows the caller may already read.
   */
  async protectionReviewPackage(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const classifications = visibleClassifications(context);
    if (classifications.length === 0) return { findings: [], limitations: ["No classification is visible at your clearance."] };

    const policies = await db
      .select()
      .from(familyInsurancePolicies)
      .where(and(inArray(familyInsurancePolicies.tenantId, context.scope.tenantIds), inArray(familyInsurancePolicies.classification, classifications)));

    const findings: { label: string; value: string; kind: "FACT" }[] = [];
    for (const p of policies) {
      const problems: string[] = [];
      if ((p.documentRefs ?? []).length === 0) problems.push("no policy document referenced");
      if (p.nextReviewDate === null) problems.push("no next review date");
      if (p.premiumPayerRef === null) problems.push("premium payer unrecorded");
      if (p.status !== "DRAFT" && (p.ownerRef === null || p.insuredRef === null)) problems.push("ownership model incomplete (§9)");
      if (problems.length > 0) findings.push({ label: `Policy ${p.policyNumber}`, value: problems.join("; "), kind: "FACT" });
    }

    return {
      findings: findings.length > 0 ? findings : [{ label: "Review package", value: "No protection record in scope is missing a review date, document reference or ownership detail.", kind: "FACT" }],
      sources: [{ kind: "TABLE", ref: "family_insurance_policies", label: "Family Office protection register", authority: "FAMILY_OFFICE" }],
      headline: `${findings.length} protection record(s) need attention before the next review`,
      limitations: [
        "Missing information is reported as missing. Nothing here is inferred, completed or corrected — preparing the package is the whole of Noelia's role; the review itself is a governed human act.",
        APPROVAL_BOUNDARY,
      ],
      humanReviewRequired: true,
    };
  }
}
