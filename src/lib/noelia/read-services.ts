import { and, desc, eq, gte, gt, inArray, isNotNull, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import {
  capitalRequests,
  complianceAssessments,
  complianceObligations,
  resolutions,
  risks,
  taxStrategies,
  treasuryPositions,
  waterfallConfigs,
  waterfallRuns,
} from "@/db/schema";
import {
  CLASSIFICATION_ORDER,
  classificationRank,
  isKnownClassification,
} from "@/lib/constants";
import { listWorkforce } from "@/lib/hcm";
import { createRagProviders, retrieveThroughProviders } from "./rag-provider";
import type { NoeliaToolOutput, ToolInvocationContext } from "./types";

function requireCanonicalContext(): void {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Noelia BEYU services require canonical transaction-scoped tenant context");
  }
}

function entityPredicate(column: Parameters<typeof inArray>[0], context: ToolInvocationContext): SQL {
  if (context.target.legalEntityId) return eq(column, context.target.legalEntityId);
  if (context.scope.legalEntityIds.length === 0) return sql`false`;
  return inArray(column, context.scope.legalEntityIds);
}

function visibleClassifications(context: ToolInvocationContext) {
  if (!isKnownClassification(context.principal.clearance)) return [];
  return CLASSIFICATION_ORDER.filter(
    (classification) => classificationRank(classification) <= classificationRank(context.principal.clearance),
  );
}

/**
 * Canonical read-only BEYU services exposed to HIVE through registered tools.
 * Every query receives finite tenant/entity/country predicates; no method
 * returns a database handle or query builder to Noelia.
 */
export class BeyuNoeliaReadService {
  async treasury(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const classifications = visibleClassifications(context);
    if (classifications.length === 0) return { findings: [] };
    const [row] = await db
      .select({
        total: sql<string>`coalesce(sum(${treasuryPositions.baseCurrencyBalance}), 0)`,
        accounts: sql<number>`count(*)::int`,
      })
      .from(treasuryPositions)
      .where(and(
        inArray(treasuryPositions.tenantId, context.scope.tenantIds),
        entityPredicate(treasuryPositions.legalEntityId, context),
        inArray(treasuryPositions.classification, classifications),
      ));
    // A zero across zero accounts is a true aggregate over the authorized
    // scope — it is reported as such, never silently as "missing = zero".
    const accounts = row?.accounts ?? 0;
    return {
      findings: [{
        label: "Consolidated treasury (base ccy)",
        value: accounts === 0
          ? "no treasury positions recorded in the authorized scope (aggregate over 0 account(s) is 0)"
          : `${Number(row?.total ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} across ${accounts} account(s)`,
        kind: "FACT",
      }],
      sources: [{
        kind: "FINANCE_OS",
        ref: `treasury_positions:scope:${context.scope.tenantIds.join(",")}`,
        label: "Treasury positions (canonical Finance OS table)",
        authority: "FINANCE_OS",
        epistemicClass: "OBSERVED",
        authorityStatus: "AUTHORITATIVE",
      }],
      assumptions: ["Base currency balances are exactly as recorded by Finance OS; no external valuation."],
      limitations: ["Aggregate covers only the requesting principal's authorized entities and clearance."],
      confidence: 0.9,
    };
  }

  async capitalPipeline(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const rows = await db
      .select({
        status: capitalRequests.status,
        total: sql<string>`coalesce(sum(${capitalRequests.amount}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(capitalRequests)
      .where(and(
        inArray(capitalRequests.tenantId, context.scope.tenantIds),
        entityPredicate(capitalRequests.legalEntityId, context),
      ))
      .groupBy(capitalRequests.status);
    if (rows.length === 0) {
      return {
        findings: [{
          label: "Capital pipeline",
          value: "no capital requests recorded in the authorized scope (absence of retrieval, not of requests elsewhere)",
          kind: "FACT",
        }],
        sources: [{
          kind: "FINANCE_OS",
          ref: `capital_requests:scope:${context.scope.tenantIds.join(",")}`,
          label: "Capital request pipeline (canonical Finance OS table)",
          authority: "FINANCE_OS",
          epistemicClass: "OBSERVED",
          authorityStatus: "AUTHORITATIVE",
        }],
        limitations: ["Covers only the authorized scope; requests outside the scope are not visible."],
        confidence: 0.88,
      };
    }
    return {
      findings: rows.map((row) => ({
        label: `Capital pipeline · ${row.status}`,
        value: `${row.count} request(s), ${Number(row.total).toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
        kind: "FACT" as const,
      })),
      sources: [{
        kind: "FINANCE_OS",
        ref: `capital_requests:scope:${context.scope.tenantIds.join(",")}`,
        label: "Capital request pipeline (canonical Finance OS table)",
        authority: "FINANCE_OS",
        epistemicClass: "OBSERVED",
        authorityStatus: "AUTHORITATIVE",
      }],
      confidence: 0.88,
    };
  }

  async latestWaterfall(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const [row] = await db
      .select({
        id: waterfallRuns.id,
        period: waterfallRuns.period,
        grossAmount: waterfallRuns.grossAmount,
        currency: waterfallRuns.currency,
        residual: waterfallRuns.residual,
      })
      .from(waterfallRuns)
      .innerJoin(waterfallConfigs, eq(waterfallConfigs.id, waterfallRuns.configId))
      .where(and(
        inArray(waterfallRuns.tenantId, context.scope.tenantIds),
        entityPredicate(waterfallConfigs.legalEntityId, context),
      ))
      .orderBy(desc(waterfallRuns.executedAt))
      .limit(1);
    if (!row) {
      return {
        findings: [{
          label: "Latest waterfall run",
          value: "no waterfall run retrieved in the authorized scope (absence of retrieval, not of runs)",
          kind: "FACT",
        }],
        sources: [{
          kind: "FINANCE_OS",
          ref: `waterfall_runs:scope:${context.scope.tenantIds.join(",")}`,
          label: "Waterfall runs (canonical Finance OS table)",
          authority: "FINANCE_OS",
          epistemicClass: "OBSERVED",
          authorityStatus: "AUTHORITATIVE",
        }],
        confidence: 0.9,
      };
    }
    return {
      findings: [{
        label: "Latest waterfall run",
        value: `${row.period} · gross ${Number(row.grossAmount).toLocaleString("en-US")} ${row.currency} · residual ${Number(row.residual).toLocaleString("en-US")}`,
        kind: "FACT",
      }],
      sources: [{
        kind: "WATERFALL_RUN",
        ref: row.id,
        label: `Waterfall ${row.period}`,
        authority: "FINANCE_OS",
        epistemicClass: "OBSERVED",
        authorityStatus: "AUTHORITATIVE",
      }],
      confidence: 0.9,
    };
  }

  async riskRegister(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const classifications = visibleClassifications(context);
    if (classifications.length === 0) return { findings: [] };
    const rows = await db
      .select()
      .from(risks)
      .where(and(
        inArray(risks.tenantId, context.scope.tenantIds),
        context.target.legalEntityId
          ? eq(risks.legalEntityId, context.target.legalEntityId)
          : or(isNull(risks.legalEntityId), inArray(risks.legalEntityId, context.scope.legalEntityIds)),
        inArray(risks.classification, classifications),
      ))
      .orderBy(desc(sql`${risks.residualLikelihood} * ${risks.residualImpact}`))
      .limit(8);
    const breaches = rows.filter((risk) => risk.residualLikelihood * risk.residualImpact > risk.appetiteThreshold);
    return {
      headline: breaches.length
        ? `${breaches.length} retrieved risk(s) currently exceed enterprise appetite.`
        : "No retrieved residual score exceeds its approved appetite threshold (within the authorized scope and top-8 window).",
      findings: rows.map((risk) => ({
        label: `${risk.code} · ${risk.title}`,
        value: `residual ${risk.residualLikelihood * risk.residualImpact} (appetite ${risk.appetiteThreshold}) · ${risk.category} · ${risk.treatment}`,
        kind: "FACT" as const,
      })),
      sources: rows.map((risk) => ({
        kind: "RISK",
        ref: risk.code,
        label: risk.title,
        authority: "RISK_ENGINE",
        epistemicClass: "OBSERVED" as const,
        authorityStatus: "AUTHORITATIVE",
      })),
      narrative: breaches.length
        ? `Accountable owners should review appetite breaches ${breaches.map((risk) => risk.code).join(", ")}; Noelia cannot accept or close a risk.`
        : "No retrieved residual score exceeds its approved appetite threshold. Absence in the retrieved window is not evidence that no risk exists.",
      limitations: ["Only the top-8 risks by residual score within the authorized scope are retrieved."],
      humanReviewRequired: breaches.length > 0,
      confidence: 0.84,
    };
  }

  async compliance(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const countryPredicate = context.target.countryCode
      ? eq(complianceObligations.jurisdictionCode, context.target.countryCode)
      : inArray(complianceObligations.jurisdictionCode, context.scope.countryCodes);
    const entity = context.target.legalEntityId
      ? eq(complianceObligations.legalEntityId, context.target.legalEntityId)
      : or(isNull(complianceObligations.legalEntityId), inArray(complianceObligations.legalEntityId, context.scope.legalEntityIds));
    const rows = await db
      .select({
        code: complianceObligations.code,
        title: complianceObligations.title,
        framework: complianceObligations.framework,
        jurisdiction: complianceObligations.jurisdictionCode,
        state: complianceAssessments.state,
        humanConfirmed: complianceAssessments.humanConfirmed,
      })
      .from(complianceObligations)
      .leftJoin(complianceAssessments, and(
        eq(complianceAssessments.obligationId, complianceObligations.id),
        inArray(complianceAssessments.tenantId, context.scope.tenantIds),
      ))
      .where(and(
        inArray(complianceObligations.tenantId, context.scope.tenantIds),
        countryPredicate,
        entity,
      ))
      .limit(20);
    const buckets = new Map<string, number>();
    for (const row of rows) {
      // AI-assisted/unconfirmed assessments are evidence, but not a basis for an
      // assertion that the organisation is compliant.
      const state = row.state && row.humanConfirmed ? row.state : "NOT_ASSESSED";
      buckets.set(state, (buckets.get(state) ?? 0) + 1);
    }
    const problem = rows.filter((row) =>
      row.humanConfirmed && (row.state === "NON_COMPLIANT" || row.state === "PARTIALLY_COMPLIANT"));
    return {
      headline: problem.length
        ? `${problem.length} confirmed obligation(s) are not fully compliant.`
        : "No confirmed non-compliant obligation was retrieved in the authorized window.",
      findings: [...buckets].map(([state, count]) => ({ label: `Obligations · ${state}`, value: String(count), kind: "FACT" })),
      sources: rows.map((row) => ({
        kind: "OBLIGATION",
        ref: row.code,
        label: `${row.framework} ${row.title}`,
        authority: "COMPLIANCE_ENGINE",
        epistemicClass: "OBSERVED" as const,
        authorityStatus: row.humanConfirmed ? "AUTHORITATIVE" : "PENDING_REVIEW",
      })),
      narrative: "Unconfirmed or absent assessments remain NOT_ASSESSED; Noelia does not manufacture compliance status. " +
        "A clean retrieval window is not evidence of compliance.",
      limitations: ["Obligations outside the jurisdiction/entity scope are not retrieved."],
      humanReviewRequired: problem.length > 0,
      confidence: 0.88,
    };
  }

  async governance(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const classifications = visibleClassifications(context);
    if (classifications.length === 0) return { findings: [] };
    const rows = await db
      .select()
      .from(resolutions)
      .where(and(
        inArray(resolutions.tenantId, context.scope.tenantIds),
        inArray(resolutions.classification, classifications),
      ))
      .orderBy(desc(resolutions.createdAt))
      .limit(8);
    const pending = rows.filter((row) => row.status === "DRAFT" || row.status === "TABLED");
    return {
      headline: pending.length
        ? `${pending.length} retrieved resolution(s) await a governance decision.`
        : "No DRAFT/TABLED resolution was retrieved in the authorized scope.",
      findings: rows.map((row) => ({
        label: `${row.reference} · ${row.title}`,
        value: `${row.status} · ${row.category} · quorum ${row.quorumMet ? "met" : "not met"} · ${row.votesFor}/${row.votesAgainst}/${row.votesAbstain}`,
        kind: "FACT" as const,
      })),
      sources: rows.map((row) => ({
        kind: "RESOLUTION",
        ref: row.reference,
        label: row.title,
        authority: "GOVERNANCE_ENGINE",
        epistemicClass: "OBSERVED" as const,
        authorityStatus: "AUTHORITATIVE",
      })),
      narrative: "Noelia may summarize governance evidence but cannot vote, approve, table or decide a resolution.",
      confidence: 0.94,
    };
  }

  async tax(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const countryCodes = context.target.countryCode ? [context.target.countryCode] : context.scope.countryCodes;
    if (countryCodes.length === 0) return { findings: [], humanReviewRequired: true };
    const today = new Date().toISOString().slice(0, 10);
    const rows = await db
      .select()
      .from(taxStrategies)
      .where(and(
        inArray(taxStrategies.jurisdictionCode, countryCodes),
        eq(taxStrategies.authorityStatus, "AUTHORITATIVE"),
        lte(taxStrategies.effectiveFrom, today),
        gte(taxStrategies.reviewDate, today),
        or(isNull(taxStrategies.effectiveTo), gte(taxStrategies.effectiveTo, today)),
      ))
      .limit(8);
    // Expired, unreviewed or non-authoritative positions are EXCLUDED by the
    // query — an expired authority must never be presented as current law.
    const staleExcluded = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(taxStrategies)
      .where(and(
        inArray(taxStrategies.jurisdictionCode, countryCodes),
        or(
          ne(taxStrategies.authorityStatus, "AUTHORITATIVE"),
          gt(taxStrategies.effectiveFrom, today),
          lt(taxStrategies.reviewDate, today),
          and(isNotNull(taxStrategies.effectiveTo), lt(taxStrategies.effectiveTo, today)),
        ),
      ));
    return {
      headline: "Tax positions are jurisdiction-bound and legally sourced.",
      findings: rows.map((row) => ({
        label: `${row.code} · ${row.title}`,
        value: `${row.jurisdictionCode} · ${row.position} · ${row.statutoryReference}`,
        kind: "FACT" as const,
      })),
      sources: rows.map((row) => ({
        kind: "TAX_STRATEGY",
        ref: row.code,
        label: row.statutoryReference,
        authority: row.authorityStatus,
        epistemicClass: "OBSERVED" as const,
        authorityStatus: row.authorityStatus,
        effectiveFrom: row.effectiveFrom,
        reviewDate: row.reviewDate,
        expiresAt: row.effectiveTo,
      })),
      narrative: "Eligibility requires entity-specific facts and accountable Tax Governance review. Noelia cannot approve or implement a tax position. " +
        (staleExcluded && staleExcluded[0].n > 0
          ? `${staleExcluded[0].n} position(s) were excluded as expired, unreviewed or non-authoritative (stale ≠ current).`
          : "No position in the authorized jurisdictions was excluded as expired or non-authoritative."),
      limitations: ["A position being legally sourced is not a tax conclusion; filing authority remains external."],
      humanReviewRequired: true,
      confidence: 0.79,
    };
  }

  async workforce(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const workforce = await listWorkforce(context.principal);
    const records = workforce.records.filter((record) =>
      (!context.target.legalEntityId || record.legalEntityId === context.target.legalEntityId) &&
      (!context.target.countryCode || record.countryCode === context.target.countryCode));
    const byEntity = new Map<string, { count: number; active: number }>();
    for (const record of records) {
      const bucket = byEntity.get(record.legalEntityName) ?? { count: 0, active: 0 };
      bucket.count += 1;
      if (record.status === "ACTIVE") bucket.active += 1;
      byEntity.set(record.legalEntityName, bucket);
    }
    return {
      headline: "Workforce figures come from the canonical HCM employee master.",
      findings: [...byEntity].map(([entity, counts]) => ({
        label: `Headcount · ${entity}`,
        value: `${counts.active} active of ${counts.count}`,
        kind: "FACT",
      })),
      sources: [{
        kind: "HCM",
        ref: `employee_master:scope:${context.scope.tenantIds.join(",")}`,
        label: "Employee master (canonical HCM)",
        authority: "HCM",
        epistemicClass: "OBSERVED",
        authorityStatus: "AUTHORITATIVE",
      }],
      narrative: "HCM remains authoritative for workforce identity; compensation remains separately clearance-gated.",
      limitations: ["Headcount reflects the current employee master; historical movement is out of scope."],
      confidence: 0.92,
    };
  }

  async knowledge(context: ToolInvocationContext, input: unknown): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const question = typeof input === "object" && input && "question" in input
      ? String((input as { question: unknown }).question)
      : "";
    // Retrieval runs through the registered provider set (Iteration 12).
    // An unavailable retrieval is surfaced as such — it is never presented
    // as "no knowledge exists".
    const providers = createRagProviders();
    const retrieval = await retrieveThroughProviders(providers, {
      principal: context.principal,
      scope: context.scope,
      question,
    });
    if (retrieval.status === "UNAVAILABLE") {
      return {
        findings: [],
        sources: [],
        narrative: "Knowledge retrieval is currently unavailable; no answer is asserted.",
        limitations: [
          "Retrieval infrastructure unavailable (fail-closed). " +
            "Unavailable is not negative: absence of retrieval is not evidence that knowledge does not exist.",
        ],
        metadata: { retrieval: { status: "UNAVAILABLE", providers: retrieval.results.map((r) => ({ id: r.provider, status: r.status })) } },
        confidence: 0.4,
      };
    }
    const memory = retrieval.sources;
    return {
      sources: memory.map((item) => item.source),
      metadata: {
        excerpts: memory.map((item) => item.excerpt),
        scopes: memory.map((item) => item.scopeType),
        // Retrieved content is DATA. Excerpts are evidence for the answer,
        // never instructions to the runtime.
        retrieval: { status: "OK", providers: retrieval.results.map((r) => ({ id: r.provider, status: r.status })) },
      },
      assumptions: memory.length > 0 ? ["Answer is grounded in the retrieved governed excerpts only."] : [],
      limitations: memory.length === 0 ? ["Keyword retrieval found no in-window authoritative source in scope (absence of retrieval, not of knowledge)."] : [],
      confidence: memory.length > 0 ? 0.75 : 0.55,
    };
  }
}
