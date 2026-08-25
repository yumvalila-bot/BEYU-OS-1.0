import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import {
  capitalRequests,
  complianceAssessments,
  complianceObligations,
  policies,
  resolutions,
  risks,
  strategicObjectives,
  treasuryPositions,
} from "@/db/schema";
import {
  CLASSIFICATION_ORDER,
  classificationRank,
  isKnownClassification,
} from "@/lib/constants";
import { listWorkforce } from "@/lib/hcm";
import { calculateVariance, type VarianceInput } from "@/lib/specialist/fpna/engines";
import {
  project,
  sensitivityAnalysis,
  stressTest,
} from "@/lib/specialist/forecast/engines";
import type { ForecastScenario } from "@/lib/specialist/forecast/model";
import {
  type CapitalObservation,
} from "@/lib/specialist/risk/engines";
import {
  cashPosition,
  liquidityCoverage as treasuryLiquidityCoverage,
  treasuryConcentration,
} from "@/lib/specialist/treasury/engines";
import type { TreasuryPositionView } from "@/lib/specialist/treasury/model";
import { classifyTrend, canonicalStatus, detectAnomalies, metric } from "./epistemics";
import { parseHorizon } from "./executive";
import type { NoeliaAnalysisType, NoeliaFinding, NoeliaToolOutput, ToolInvocationContext } from "./types";

/**
 * Governed Noelia analytics service.
 *
 * This is an ADAPTER layer, not a second analytics engine. Every numeric
 * measure is computed by the canonical specialist engines (treasury, risk,
 * FP&A, forecast) over observations loaded WITH finite tenant/entity/country
 * predicates and classification pushdown. No algorithm is duplicated; no
 * balance is invented; missing data is UNAVAILABLE, never zero.
 */
export class BeyuNoeliaAnalyticsService {
  private requireContext(): void {
    if (!hasDatabaseTransactionContext()) {
      throw new Error("Noelia analytics require canonical transaction-scoped tenant context");
    }
  }

  private entityPredicate(column: Parameters<typeof inArray>[0], context: ToolInvocationContext): SQL {
    if (context.target.legalEntityId) return eq(column, context.target.legalEntityId);
    if (context.scope.legalEntityIds.length === 0) return sql`false`;
    return inArray(column, context.scope.legalEntityIds);
  }

  private visibleClassifications(context: ToolInvocationContext) {
    if (!isKnownClassification(context.principal.clearance)) return [];
    return CLASSIFICATION_ORDER.filter(
      (classification) => classificationRank(classification) <= classificationRank(context.principal.clearance),
    );
  }

  private isoDay(value: string | Date | null | undefined): string {
    if (!value) return "";
    if (typeof value === "string") return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
  }

  /** Load treasury positions with tenant/entity/classification pushdown. */
  private async loadTreasury(context: ToolInvocationContext): Promise<TreasuryPositionView[]> {
    const classifications = this.visibleClassifications(context);
    if (classifications.length === 0) return [];
    const rows = await db
      .select({
        id: treasuryPositions.id,
        tenantId: treasuryPositions.tenantId,
        legalEntityId: treasuryPositions.legalEntityId,
        institution: treasuryPositions.institution,
        accountLabel: treasuryPositions.accountLabel,
        accountType: treasuryPositions.accountType,
        currency: treasuryPositions.currency,
        balance: treasuryPositions.balance,
        baseCurrencyBalance: treasuryPositions.baseCurrencyBalance,
        asOf: treasuryPositions.asOf,
        classification: treasuryPositions.classification,
      })
      .from(treasuryPositions)
      .where(and(
        inArray(treasuryPositions.tenantId, context.scope.tenantIds),
        this.entityPredicate(treasuryPositions.legalEntityId, context),
        inArray(treasuryPositions.classification, classifications),
      ));
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      legalEntityId: row.legalEntityId,
      institution: row.institution,
      accountLabel: row.accountLabel,
      accountType: row.accountType,
      currency: row.currency,
      balance: row.balance,
      baseCurrencyBalance: row.baseCurrencyBalance,
      asOf: this.isoDay(row.asOf),
      securityClassification: row.classification,
      basis: "OBSERVED" as const,
    }));
  }

  /** Load capital requests with tenant/entity pushdown. */
  private async loadCapital(context: ToolInvocationContext): Promise<CapitalObservation[]> {
    const rows = await db
      .select({
        id: capitalRequests.id,
        code: capitalRequests.code,
        tenantId: capitalRequests.tenantId,
        legalEntityId: capitalRequests.legalEntityId,
        status: capitalRequests.status,
        amount: capitalRequests.amount,
        currency: capitalRequests.currency,
        sectorCode: capitalRequests.sectorCode,
      })
      .from(capitalRequests)
      .where(and(
        inArray(capitalRequests.tenantId, context.scope.tenantIds),
        this.entityPredicate(capitalRequests.legalEntityId, context),
      ));
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      tenantId: row.tenantId,
      legalEntityId: row.legalEntityId,
      status: row.status,
      amount: row.amount,
      currency: row.currency,
      sectorCode: row.sectorCode,
    }));
  }

  /** Load risk register with tenant/entity/classification pushdown. */
  private async loadRisks(context: ToolInvocationContext) {
    const classifications = this.visibleClassifications(context);
    if (classifications.length === 0) return [];
    return db
      .select()
      .from(risks)
      .where(and(
        inArray(risks.tenantId, context.scope.tenantIds),
        context.target.legalEntityId
          ? eq(risks.legalEntityId, context.target.legalEntityId)
          : or(isNull(risks.legalEntityId), inArray(risks.legalEntityId, context.scope.legalEntityIds)),
        inArray(risks.classification, classifications),
      ));
  }

  private async loadCompliance(context: ToolInvocationContext) {
    const countryPredicate = context.target.countryCode
      ? eq(complianceObligations.jurisdictionCode, context.target.countryCode)
      : inArray(complianceObligations.jurisdictionCode, context.scope.countryCodes);
    const entity = context.target.legalEntityId
      ? eq(complianceObligations.legalEntityId, context.target.legalEntityId)
      : or(isNull(complianceObligations.legalEntityId), inArray(complianceObligations.legalEntityId, context.scope.legalEntityIds));
    return db
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
      .limit(50);
  }

  /* ------------------------------------------------------------------ */
  /* Analysis entry points                                               */
  /* ------------------------------------------------------------------ */

  /** Public loader used by capability adapters needing scoped treasury views. */
  async loadTreasuryForTool(context: ToolInvocationContext): Promise<TreasuryPositionView[]> {
    return this.loadTreasury(context);
  }

  async analyze(
    analysisType: NoeliaAnalysisType,
    context: ToolInvocationContext,
    options: Record<string, unknown> = {},
  ): Promise<NoeliaToolOutput> {
    this.requireContext();
    switch (analysisType) {
      case "KPI_ANALYSIS": return this.kpiAnalysis(context);
      case "TREND_ANALYSIS": return this.trendAnalysis(context);
      case "VARIANCE_ANALYSIS": return this.varianceAnalysis(context, options);
      case "ANOMALY_DETECTION": return this.anomalyDetection(context);
      case "FORECAST": return this.forecast(context, options);
      case "SENSITIVITY_ANALYSIS": return this.sensitivity(context, options);
      case "SCENARIO_COMPARISON": return this.scenarioComparison(context, options);
      case "STRESS_TEST": return this.stressTest(context, options);
      case "CONCENTRATION_ANALYSIS": return this.concentrationAnalysis(context, options);
      case "LIQUIDITY_ANALYSIS": return this.liquidityAnalysis(context);
      case "PERFORMANCE_ANALYSIS": return this.performanceAnalysis(context);
      case "WORKFORCE_ANALYSIS": return this.workforceAnalysis(context);
      case "COMPLIANCE_ANALYSIS": return this.complianceAnalysis(context);
      case "RISK_ANALYSIS": return this.riskAnalysis(context);
      case "CAPITAL_ANALYSIS": return this.capitalAnalysis(context);
      case "GOVERNANCE_ANALYSIS": return this.governanceAnalysis(context);
      case "STRATEGIC_VARIANCE": return this.strategicVariance(context);
      case "OPPORTUNITY_DETECTION": return this.opportunityDetection(context);
      case "EARLY_WARNING": return this.earlyWarning(context);
      case "CROSS_DOMAIN_CORRELATION": return this.crossDomainCorrelation(context);
      default: {
        const exhaustive: never = analysisType;
        return {
          headline: "Unsupported analysis type.",
          findings: [{ label: "Analysis", value: String(exhaustive), kind: "INFERENCE", status: "UNAVAILABLE" }],
          confidence: 0.2,
        };
      }
    }
  }

  async kpiAnalysis(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    const [treasury, capital] = await Promise.all([this.loadTreasury(context), this.loadCapital(context)]);
    const cash = cashPosition(treasury, { asOf: new Date().toISOString().slice(0, 10) });
    const metrics = [
      metric({
        code: "KPI_CASH_TOTAL",
        label: "Consolidated cash (base ccy)",
        value: cash.baseCurrencyTotal === null
          ? "DATA_NOT_AVAILABLE"
          : String(cash.baseCurrencyTotal),
        status: canonicalStatus(cash.baseCurrencyTotalBasis),
        source: "TREASURY_POSITIONS",
        period: treasury.length ? treasury[0].asOf : null,
        trend: classifyTrend(treasury.map((p) => Number(p.baseCurrencyBalance))),
      }),
      metric({
        code: "KPI_CAPITAL_PIPELINE",
        label: "Capital requests in pipeline",
        value: String(capital.length),
        status: capital.length ? "OBSERVED" : "UNAVAILABLE",
        source: "CAPITAL_REQUESTS",
      }),
    ];
    const findings = metrics.map((m) => ({
      label: m.label,
      value: m.value,
      kind: m.status === "UNAVAILABLE" ? ("INFERENCE" as const) : ("FACT" as const),
      status: m.status,
      metricCode: m.code,
    }));
    return {
      headline: "KPI view assembled from canonical Finance OS sources.",
      findings,
      metrics,
      confidence: treasury.length || capital.length ? 0.88 : 0.5,
      metadata: { cashExplanation: cash.explanation },
    };
  }

  async trendAnalysis(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    const treasury = await this.loadTreasury(context);
    if (treasury.length === 0) {
      return {
        headline: "Trend analysis is UNAVAILABLE: no observed time series in scope.",
        findings: [{
          label: "Treasury time series",
          value: "DATA_NOT_AVAILABLE",
          kind: "INFERENCE",
          status: "UNAVAILABLE",
        }],
        confidence: 0.3,
        humanReviewRequired: false,
      };
    }
    const series = treasury.map((p) => Number(p.baseCurrencyBalance)).sort((a, b) => a - b);
    const anomalies = detectAnomalies(treasury.map((p, index) => ({ index, value: Number(p.baseCurrencyBalance) })));
    const trend = classifyTrend(series);
    return {
      headline: `Treasury base-currency trend classified ${trend}.`,
      findings: [
        {
          label: "Trend direction",
          value: trend,
          kind: "INFERENCE" as const,
          status: "DERIVED",
        },
        ...anomalies.map((index) => ({
          label: `Statistical outlier · ${treasury[index].institution}`,
          value: `${treasury[index].baseCurrencyBalance} ${treasury[index].currency}`,
          kind: "INFERENCE" as const,
          status: "INFERENCE" as const,
          provenance: `TREASURY_POSITION:${treasury[index].id}`,
        })),
      ],
      metrics: [metric({
        code: "TREND_TREASURY",
        label: "Treasury trend",
        value: trend,
        status: "DERIVED",
        source: "TREASURY_POSITIONS",
      })],
      narrative: anomalies.length
        ? "Outliers are statistical flags for human review, not accounting findings."
        : "No statistical outlier exceeded the deterministic detection threshold.",
      confidence: 0.82,
    };
  }

  async varianceAnalysis(context: ToolInvocationContext, options: Record<string, unknown>): Promise<NoeliaToolOutput> {
    const treasury = await this.loadTreasury(context);
    if (treasury.length === 0) {
      return {
        headline: "Variance analysis is UNAVAILABLE: no observed actuals exist in scope.",
        findings: [{ label: "Actuals", value: "DATA_NOT_AVAILABLE", kind: "INFERENCE", status: "UNAVAILABLE" }],
        confidence: 0.3,
      };
    }
    // No ratified budget/plan substrate exists, so variance can only be
    // CURRENT_VS_PRIOR over distinct as-of snapshots, or caller-supplied
    // figures. We never invent a budget.
    const prior = options.left as string | undefined;
    const current = options.right as string | undefined;
    if (typeof prior !== "string" || typeof current !== "string") {
      return {
        headline: "Variance requires two explicit observed figures; no budget substrate exists.",
        findings: [{
          label: "Budget vs actual variance",
          value: "REQUIRES_HUMAN_REVIEW",
          kind: "INFERENCE",
          status: "REQUIRES_HUMAN_REVIEW",
        }],
        narrative: "BEYU has no ratified plan/budget substrate. A variance computed against an invented budget would be fabrication.",
        confidence: 0.4,
        humanReviewRequired: true,
      };
    }
    const input: VarianceInput = {
      kind: "CURRENT_VS_PRIOR",
      seriesCode: "TREASURY_BASE",
      periodDate: new Date().toISOString().slice(0, 10),
      left: { label: "current", value: current, currency: "USD", basis: "OBSERVED" },
      right: { label: "prior", value: prior, currency: "USD", basis: "OBSERVED" },
    };
    const result = calculateVariance(input);
    const varianceLabel = `${result.leftLabel} vs ${result.rightLabel}`;
    const varianceValue = result.percentageVariance !== null
      ? `${result.percentageVariance}%`
      : "REQUIRES_POLICY";
    return {
      headline: varianceLabel,
      findings: [{
        label: varianceLabel,
        value: varianceValue,
        kind: "INFERENCE",
        status: canonicalStatus(result.leftBasis),
        confidence: result.confidence,
      }],
      metrics: [metric({
        code: "VARIANCE_CURRENT_VS_PRIOR",
        label: varianceLabel,
        value: varianceValue,
        status: canonicalStatus(result.leftBasis),
        confidence: result.confidence,
      })],
      narrative: result.explanation,
      confidence: 0.85,
    };
  }

  async anomalyDetection(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    const treasury = await this.loadTreasury(context);
    if (treasury.length < 4) {
      return {
        headline: "Anomaly detection requires at least 4 observed positions.",
        findings: [{
          label: "Anomaly detection",
          value: "DATA_NOT_AVAILABLE",
          kind: "INFERENCE",
          status: "UNAVAILABLE",
        }],
        confidence: 0.3,
      };
    }
    const anomalies = detectAnomalies(treasury.map((p, index) => ({ index, value: Number(p.baseCurrencyBalance) })));
    return {
      headline: anomalies.length
        ? `${anomalies.length} statistical outlier(s) flagged for review.`
        : "No statistical outlier detected.",
      findings: anomalies.map((index) => ({
        label: `Outlier · ${treasury[index].institution} · ${treasury[index].accountLabel}`,
        value: `${treasury[index].baseCurrencyBalance} ${treasury[index].currency}`,
        kind: "INFERENCE",
        status: "INFERENCE",
        provenance: `TREASURY_POSITION:${treasury[index].id}`,
      })),
      narrative: "Outliers are statistical flags (|z|>2) for human review; they are not accounting adjustments.",
      confidence: 0.8,
      humanReviewRequired: anomalies.length > 0,
    };
  }

  async forecast(context: ToolInvocationContext, options: Record<string, unknown>): Promise<NoeliaToolOutput> {
    const treasury = await this.loadTreasury(context);
    const asOf = new Date().toISOString().slice(0, 10);
    const horizon = Number(options.horizon ?? 3);
    if (treasury.length === 0) {
      return {
        headline: "Forecast is UNAVAILABLE: no observed history exists to project.",
        findings: [{
          label: "Forecast",
          value: "DATA_NOT_AVAILABLE",
          kind: "INFERENCE",
          status: "UNAVAILABLE",
        }],
        narrative: "A forecast conjured without observed history would be the most dangerous artefact this system could produce.",
        confidence: 0.2,
      };
    }
    const observations = treasury.map((p) => ({
      seriesCode: "TREASURY_BASE",
      periodDate: p.asOf || asOf,
      value: p.baseCurrencyBalance,
      currency: "USD",
      basis: "OBSERVED" as const,
      sourceType: "TREASURY_POSITION",
      sourceId: p.id,
    }));
    const result = project({
      seriesCode: "TREASURY_BASE",
      observations,
      method: "LINEAR_TREND",
      horizon: Math.min(Math.max(horizon, 1), 12),
      asOf,
      actorUserId: context.principal.userId,
      tenantId: context.target.tenantId,
      legalEntityId: context.target.legalEntityId,
    });
    const finalPoint = result.points?.[result.points.length - 1];
    return {
      headline: result.basis === "DATA_NOT_AVAILABLE"
        ? "Forecast UNAVAILABLE."
        : `Forecast horizon ${result.points?.length ?? 0} step(s).`,
      findings: [{
        label: `Forecast final (${finalPoint?.periodDate ?? asOf})`,
        value: finalPoint ? `${finalPoint.value}` : "DATA_NOT_AVAILABLE",
        kind: "INFERENCE",
        status: canonicalStatus(result.basis),
      }],
      forecasts: result.points?.map((p) => `${p.periodDate ?? p.step}: ${p.value}`) ?? [],
      narrative: result.explanation?.join(" ") ?? "",
      confidence: 0.6,
    };
  }

  async sensitivity(context: ToolInvocationContext, options: Record<string, unknown>): Promise<NoeliaToolOutput> {
    const treasury = await this.loadTreasury(context);
    if (treasury.length === 0) {
      return {
        headline: "Sensitivity analysis is UNAVAILABLE: no baseline forecast exists.",
        findings: [{ label: "Sensitivity", value: "DATA_NOT_AVAILABLE", kind: "INFERENCE", status: "UNAVAILABLE" }],
        confidence: 0.2,
      };
    }
    const asOf = new Date().toISOString().slice(0, 10);
    const observations = treasury.map((p) => ({
      seriesCode: "TREASURY_BASE",
      periodDate: p.asOf || asOf,
      value: p.baseCurrencyBalance,
      currency: "USD",
      basis: "OBSERVED" as const,
      sourceType: "TREASURY_POSITION",
      sourceId: p.id,
    }));
    const shift = Number(options.shiftPercent ?? 10);
    const result = sensitivityAnalysis({
      seriesCode: "TREASURY_BASE",
      observations,
      method: "LINEAR_TREND",
      horizon: 3,
      asOf,
      actorUserId: context.principal.userId,
      tenantId: context.target.tenantId,
      legalEntityId: context.target.legalEntityId,
    }, shift);
    return {
      headline: result.basis === "DATA_NOT_AVAILABLE"
        ? "Sensitivity UNAVAILABLE."
        : `Sensitivity to a ${shift}% assumption shift computed.`,
      findings: result.variations.map((variation) => ({
        label: `Sensitivity · ${variation.label}`,
        value: variation.resultingFinalValue !== null ? String(variation.resultingFinalValue) : "N/A",
        kind: "INFERENCE",
        status: "SCENARIO",
      })),
      scenarios: result.variations.map((variation) =>
        `assumption ${variation.assumptionId} shifted ${shift}% → final ${variation.resultingFinalValue}`),
      narrative: result.explanation?.join(" ") ?? "",
      confidence: 0.55,
    };
  }

  async scenarioComparison(context: ToolInvocationContext, options: Record<string, unknown>): Promise<NoeliaToolOutput> {
    const treasury = await this.loadTreasury(context);
    if (treasury.length === 0) {
      return {
        headline: "Scenario comparison is UNAVAILABLE: no observed baseline exists.",
        findings: [{ label: "Scenario comparison", value: "DATA_NOT_AVAILABLE", kind: "INFERENCE", status: "UNAVAILABLE" }],
        confidence: 0.2,
      };
    }
    const asOf = new Date().toISOString().slice(0, 10);
    const observations = treasury.map((p) => ({
      seriesCode: "TREASURY_BASE",
      periodDate: p.asOf || asOf,
      value: p.baseCurrencyBalance,
      currency: "USD",
      basis: "OBSERVED" as const,
      sourceType: "TREASURY_POSITION",
      sourceId: p.id,
    }));
    const base = {
      seriesCode: "TREASURY_BASE",
      observations,
      method: "LINEAR_TREND" as const,
      horizon: 3,
      asOf,
      actorUserId: context.principal.userId,
      tenantId: context.target.tenantId,
      legalEntityId: context.target.legalEntityId,
    };
    const scenarios: ForecastScenario[] = [
      {
        scenarioCode: "UPSIDE",
        kind: "UPSIDE",
        label: "Upside +10%",
        owner: context.principal.userId,
        createdAt: asOf,
        tenantId: context.target.tenantId,
        legalEntityId: context.target.legalEntityId,
        assumptions: [],
        rationale: "Deterministic +10% upside scenario.",
      },
      {
        scenarioCode: "DOWNSIDE",
        kind: "DOWNSIDE",
        label: "Downside -15%",
        owner: context.principal.userId,
        createdAt: asOf,
        tenantId: context.target.tenantId,
        legalEntityId: context.target.legalEntityId,
        assumptions: [],
        rationale: "Deterministic -15% downside scenario.",
      },
    ];
    const result = stressTest(base, {
      code: "DOWNSIDE_15",
      multiplier: 0.85,
      owner: context.principal.userId,
      rationale: "Deterministic downside stress scenario.",
      asOf,
    });
    return {
      headline: "Scenario comparison assembled (deterministic, SIMULATION_ONLY).",
      findings: [
        {
          label: "Stress · DOWNSIDE_15 final",
          value: result.points?.[result.points.length - 1]?.value ?? "DATA_NOT_AVAILABLE",
          kind: "INFERENCE",
          status: "SCENARIO",
        },
      ],
      scenarios: [
        "BASELINE: linear trend of observed positions.",
        "STRESS DOWNSIDE_15: −15% multiplier on observed base.",
      ],
      narrative: "Scenarios are hypothetical worlds, never financial truth.",
      confidence: 0.5,
    };
  }

  async stressTest(context: ToolInvocationContext, options: Record<string, unknown>): Promise<NoeliaToolOutput> {
    const treasury = await this.loadTreasury(context);
    if (treasury.length === 0) {
      return {
        headline: "Stress test is UNAVAILABLE: no observed baseline exists.",
        findings: [{ label: "Stress test", value: "DATA_NOT_AVAILABLE", kind: "INFERENCE", status: "UNAVAILABLE" }],
        confidence: 0.2,
      };
    }
    const asOf = new Date().toISOString().slice(0, 10);
    const observations = treasury.map((p) => ({
      seriesCode: "TREASURY_BASE",
      periodDate: p.asOf || asOf,
      value: p.baseCurrencyBalance,
      currency: "USD",
      basis: "OBSERVED" as const,
      sourceType: "TREASURY_POSITION",
      sourceId: p.id,
    }));
    const multiplier = Number(options.multiplier ?? 0.7);
    const result = stressTest({
      seriesCode: "TREASURY_BASE",
      observations,
      method: "LINEAR_TREND",
      horizon: 3,
      asOf,
      actorUserId: context.principal.userId,
      tenantId: context.target.tenantId,
      legalEntityId: context.target.legalEntityId,
    }, {
      code: `STRESS_${Math.round(multiplier * 100)}`,
      multiplier,
      owner: context.principal.userId,
      rationale: "Deterministic governed stress test requested by Noelia analytics.",
      asOf,
    });
    return {
      headline: `Stress test (${multiplier.toFixed(2)}×) computed — SIMULATION_ONLY.`,
      findings: [{
        label: `Stress final value`,
        value: result.points?.[result.points.length - 1]?.value ?? "DATA_NOT_AVAILABLE",
        kind: "INFERENCE",
        status: "SCENARIO",
      }],
      scenarios: [`Stress multiplier ${multiplier} applied to observed series.`],
      narrative: result.explanation?.join(" ") ?? "",
      confidence: 0.5,
    };
  }

  async concentrationAnalysis(context: ToolInvocationContext, options: Record<string, unknown>): Promise<NoeliaToolOutput> {
    const treasury = await this.loadTreasury(context);
    if (treasury.length === 0) {
      return {
        headline: "Concentration is UNAVAILABLE: no treasury positions in scope.",
        findings: [{ label: "Concentration", value: "DATA_NOT_AVAILABLE", kind: "INFERENCE", status: "UNAVAILABLE" }],
        confidence: 0.2,
      };
    }
    const dimension = String(options.dimension ?? "COUNTERPARTY") as "COUNTERPARTY" | "CURRENCY" | "ENTITY" | "ACCOUNT_TYPE";
    const result = treasuryConcentration(treasury, dimension, { asOf: new Date().toISOString().slice(0, 10) });
    const buckets = result.buckets ?? [];
    return {
      headline: result.title ?? `Treasury concentration by ${dimension}.`,
      findings: buckets.map((bucket) => ({
        label: `Concentration · ${bucket.label}`,
        value: `${bucket.sharePercent} of total`,
        kind: "INFERENCE",
        status: canonicalStatus(result.basis),
      })),
      metrics: [metric({
        code: `CONCENTRATION_${dimension}`,
        label: `Concentration by ${dimension}`,
        value: buckets.length ? `max share ${buckets.map((b) => b.sharePercent).sort().at(-1)}` : "DATA_NOT_AVAILABLE",
        status: canonicalStatus(result.basis),
        confidence: 0.8,
      })],
      narrative: result.explanation?.join(" ") ?? "",
      confidence: 0.85,
    };
  }

  async liquidityAnalysis(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    const [treasury, capital] = await Promise.all([this.loadTreasury(context), this.loadCapital(context)]);
    const asOf = new Date().toISOString().slice(0, 10);
    const result = treasuryLiquidityCoverage(
      treasury,
      capital.map((c) => ({ id: c.id, amount: c.amount, currency: c.currency, status: c.status })),
      {
        asOf,
        liquidAccountTypes: ["OPERATING", "RESERVE", "CURRENT"],
        committedStatuses: ["UNDER_REVIEW", "APPROVED", "COMMITTED"],
      },
    );
    const cash = cashPosition(treasury, { asOf });
    const unavailable = result.basis === "DATA_NOT_AVAILABLE";
    return {
      headline: result.title ?? "Treasury liquidity coverage.",
      findings: [
        {
          label: "Liquid assets",
          value: cash.baseCurrencyTotal === null ? "DATA_NOT_AVAILABLE" : String(cash.baseCurrencyTotal),
          kind: cash.baseCurrencyTotal === null ? "INFERENCE" : "INFERENCE",
          status: canonicalStatus(cash.baseCurrencyTotalBasis),
        },
        {
          label: "Liquidity coverage",
          value: unavailable || result.value === null ? "DATA_NOT_AVAILABLE" : result.value,
          kind: "INFERENCE",
          status: canonicalStatus(result.basis),
        },
      ],
      metrics: [metric({
        code: "LIQUIDITY_COVERAGE",
        label: result.title ?? "Liquidity coverage",
        value: unavailable || result.value === null ? "DATA_NOT_AVAILABLE" : result.value,
        status: canonicalStatus(result.basis),
        confidence: 0.8,
      })],
      narrative: result.explanation?.join(" ") ?? "",
      confidence: 0.8,
    };
  }

  async performanceAnalysis(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    const [treasury, capital] = await Promise.all([this.loadTreasury(context), this.loadCapital(context)]);
    const cash = cashPosition(treasury, { asOf: new Date().toISOString().slice(0, 10) });
    const committed = capital.filter((c) => c.status === "APPROVED" || c.status === "COMMITTED");
    const totalCommitted = committed.reduce((sum, c) => sum + Number(c.amount), 0);
    return {
      headline: "Performance view assembled from observed Finance OS positions.",
      findings: [
        {
          label: "Cash (base ccy)",
          value: cash.baseCurrencyTotal === null ? "DATA_NOT_AVAILABLE" : String(cash.baseCurrencyTotal),
          kind: cash.baseCurrencyTotal === null ? "INFERENCE" : "FACT",
          status: canonicalStatus(cash.baseCurrencyTotalBasis),
        },
        {
          label: "Approved/committed capital",
          value: committed.length ? String(totalCommitted) : "DATA_NOT_AVAILABLE",
          kind: "INFERENCE",
          status: committed.length ? "DERIVED" : "UNAVAILABLE",
        },
      ],
      confidence: 0.82,
    };
  }

  async workforceAnalysis(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    const workforce = await listWorkforce(context.principal);
    const records = workforce.records.filter((record) =>
      (!context.target.legalEntityId || record.legalEntityId === context.target.legalEntityId) &&
      (!context.target.countryCode || record.countryCode === context.target.countryCode));
    if (records.length === 0) {
      return {
        headline: "Workforce analysis is UNAVAILABLE: no employee master records in scope.",
        findings: [{
          label: "Headcount",
          value: "DATA_NOT_AVAILABLE",
          kind: "INFERENCE",
          status: "UNAVAILABLE",
        }],
        narrative: "An empty scope is not a headcount of zero.",
        confidence: 0.3,
      };
    }
    const active = records.filter((r) => r.status === "ACTIVE").length;
    const byStatus = new Map<string, number>();
    for (const r of records) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    const byEntity = new Map<string, number>();
    for (const r of records) byEntity.set(r.legalEntityName, (byEntity.get(r.legalEntityName) ?? 0) + 1);
    return {
      headline: "Workforce analysis from the canonical HCM employee master.",
      findings: [
        {
          label: "Headcount",
          value: String(records.length),
          kind: "FACT",
          status: "OBSERVED",
          confidence: 0.95,
        },
        {
          label: "Active headcount",
          value: String(active),
          kind: "INFERENCE",
          status: "DERIVED",
        },
        ...[...byStatus].map(([status, count]) => ({
          label: `By status · ${status}`,
          value: String(count),
          kind: "INFERENCE" as const,
          status: "DERIVED" as const,
        })),
        ...[...byEntity].map(([entity, count]) => ({
          label: `By entity · ${entity}`,
          value: String(count),
          kind: "INFERENCE" as const,
          status: "DERIVED" as const,
        })),
      ],
      metrics: [metric({
        code: "WORKFORCE_HEADCOUNT",
        label: "Headcount",
        value: String(records.length),
        status: "OBSERVED",
        confidence: 0.95,
        source: "HCM_EMPLOYEE_MASTER",
      })],
      narrative: "HCM remains the only workforce master. Turnover requires employment-event history and is reported only where it exists.",
      confidence: 0.9,
    };
  }

  async complianceAnalysis(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    const rows = await this.loadCompliance(context);
    const buckets = new Map<string, number>();
    for (const row of rows) {
      const state = row.state && row.humanConfirmed ? row.state : "NOT_ASSESSED";
      buckets.set(state, (buckets.get(state) ?? 0) + 1);
    }
    const problems = rows.filter((row) =>
      row.humanConfirmed && (row.state === "NON_COMPLIANT" || row.state === "PARTIALLY_COMPLIANT"));
    return {
      headline: problems.length
        ? `${problems.length} confirmed obligation(s) are not fully compliant.`
        : "No confirmed non-compliant obligation was retrieved.",
      findings: [...buckets].map(([state, count]) => ({
        label: `Obligations · ${state}`,
        value: String(count),
        kind: "FACT",
        status: "OBSERVED",
      })),
      metrics: [metric({
        code: "COMPLIANCE_CONFIRMED_PROBLEMS",
        label: "Confirmed non-compliance",
        value: String(problems.length),
        status: problems.length ? "OBSERVED" : "OBSERVED",
        source: "COMPLIANCE_ENGINE",
      })],
      narrative: "Unconfirmed or absent assessments remain NOT_ASSESSED; Noelia does not manufacture compliance status.",
      humanReviewRequired: problems.length > 0,
      confidence: 0.88,
    };
  }

  async riskAnalysis(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    const rows = await this.loadRisks(context);
    if (rows.length === 0) {
      return {
        headline: "Risk analysis is UNAVAILABLE: no risk register entries in scope.",
        findings: [{ label: "Risk register", value: "DATA_NOT_AVAILABLE", kind: "INFERENCE", status: "UNAVAILABLE" }],
        confidence: 0.3,
      };
    }
    const breaches = rows.filter((risk) => risk.residualLikelihood * risk.residualImpact > risk.appetiteThreshold);
    const top = [...rows]
      .sort((a, b) => (b.residualLikelihood * b.residualImpact) - (a.residualLikelihood * a.residualImpact))
      .slice(0, 8);
    return {
      headline: breaches.length
        ? `${breaches.length} risk(s) exceed enterprise appetite.`
        : "No retrieved residual score exceeds its approved appetite threshold.",
      findings: top.map((risk) => ({
        label: `${risk.code} · ${risk.title}`,
        value: `residual ${risk.residualLikelihood * risk.residualImpact} (appetite ${risk.appetiteThreshold})`,
        kind: "FACT",
        status: "OBSERVED",
        provenance: `RISK:${risk.code}`,
      })),
      risks: breaches.map((risk) => `${risk.code} residual ${risk.residualLikelihood * risk.residualImpact} exceeds appetite ${risk.appetiteThreshold}`),
      humanReviewRequired: breaches.length > 0,
      confidence: 0.84,
    };
  }

  async capitalAnalysis(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    const capital = await this.loadCapital(context);
    if (capital.length === 0) {
      return {
        headline: "Capital analysis is UNAVAILABLE: no capital requests in scope.",
        findings: [{ label: "Capital pipeline", value: "DATA_NOT_AVAILABLE", kind: "INFERENCE", status: "UNAVAILABLE" }],
        confidence: 0.3,
      };
    }
    const byStatus = new Map<string, number>();
    for (const c of capital) byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
    const total = capital.reduce((sum, c) => sum + Number(c.amount), 0);
    return {
      headline: "Capital pipeline analysis assembled.",
      findings: [...byStatus].map(([status, count]) => ({
        label: `Pipeline · ${status}`,
        value: `${count} request(s)`,
        kind: "FACT",
        status: "OBSERVED",
      })),
      metrics: [metric({
        code: "CAPITAL_PIPELINE_TOTAL",
        label: "Pipeline total",
        value: String(total),
        status: "DERIVED",
        source: "CAPITAL_REQUESTS",
      })],
      confidence: 0.88,
    };
  }

  /**
   * GOVERNANCE_ANALYSIS — control-plane posture over the canonical governance
   * substrate (policies, resolutions, strategic objectives, compliance
   * obligations). Everything is an observed count/status from scoped rows;
   * no posture is asserted when data is absent (UNAVAILABLE).
   */
  async governanceAnalysis(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    const classifications = this.visibleClassifications(context);
    const tenantPredicate = inArray(policies.tenantId, [...context.scope.tenantIds, ""]);
    const activePolicies = classifications.length === 0 ? [] : await db
      .select({ id: policies.id, code: policies.code, level: policies.level, status: policies.status, version: policies.version })
      .from(policies)
      .where(and(
        or(isNull(policies.tenantId), tenantPredicate),
        eq(policies.status, "ACTIVE"),
        inArray(policies.classification, classifications),
      ));
    const objectives = await db
      .select({ code: strategicObjectives.code, title: strategicObjectives.title, status: strategicObjectives.status, horizon: strategicObjectives.horizon })
      .from(strategicObjectives)
      .where(inArray(strategicObjectives.tenantId, context.scope.tenantIds));
    const openResolutions = await db
      .select({ reference: resolutions.reference, title: resolutions.title, status: resolutions.status, category: resolutions.category })
      .from(resolutions)
      .where(and(
        inArray(resolutions.tenantId, context.scope.tenantIds),
        inArray(resolutions.status, ["DRAFT", "TABLED", "VOTED"]),
      ));
    const today = new Date().toISOString().slice(0, 10);
    const obligations = await db
      .select({ code: complianceObligations.code, framework: complianceObligations.framework, status: complianceObligations.status, nextDueAt: complianceObligations.nextDueAt })
      .from(complianceObligations)
      .where(inArray(complianceObligations.tenantId, context.scope.tenantIds));
    const overdueObligations = obligations.filter((o) => o.nextDueAt && o.nextDueAt < today);
    const byObjectiveStatus = new Map<string, number>();
    for (const o of objectives) byObjectiveStatus.set(o.status, (byObjectiveStatus.get(o.status) ?? 0) + 1);
    const findings: NoeliaFinding[] = [
      {
        label: "Active policies in scope",
        value: String(activePolicies.length),
        kind: "FACT",
        status: activePolicies.length ? "OBSERVED" : "UNAVAILABLE",
      },
      {
        label: "Open governance resolutions",
        value: String(openResolutions.length),
        kind: "FACT",
        status: openResolutions.length ? "OBSERVED" : "UNAVAILABLE",
      },
      {
        label: "Strategic objectives",
        value: String(objectives.length),
        kind: "FACT",
        status: objectives.length ? "OBSERVED" : "UNAVAILABLE",
      },
      {
        label: "Compliance obligations",
        value: String(obligations.length),
        kind: "FACT",
        status: obligations.length ? "OBSERVED" : "UNAVAILABLE",
      },
      {
        label: "Overdue compliance obligations",
        value: String(overdueObligations.length),
        kind: "FACT",
        status: overdueObligations.length ? "OBSERVED" : "UNAVAILABLE",
      },
    ];
    for (const [status, count] of byObjectiveStatus) {
      findings.push({
        label: `Objectives · ${status}`,
        value: `${count}`,
        kind: "FACT",
        status: "OBSERVED",
      });
    }
    return {
      headline: "Governance posture assembled from the canonical control plane.",
      findings,
      risks: overdueObligations.slice(0, 10).map((o) => `Obligation ${o.code} (${o.framework}) overdue since ${o.nextDueAt}`),
      narrative: "Governance analysis reports observed control-plane state; it never creates or modifies governance authority.",
      confidence: 0.85,
      humanReviewRequired: overdueObligations.length > 0 || openResolutions.length > 0,
    };
  }

  /**
   * STRATEGIC_VARIANCE — progress of strategic objectives against their
   * governed targets (current vs target, DERIVED). Objectives are governance
   * evidence; progress creates no authority and never fabricates a target.
   */
  async strategicVariance(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    const objectives = await db
      .select({
        code: strategicObjectives.code,
        title: strategicObjectives.title,
        horizon: strategicObjectives.horizon,
        status: strategicObjectives.status,
        targetValue: strategicObjectives.targetValue,
        currentValue: strategicObjectives.currentValue,
        unit: strategicObjectives.unit,
      })
      .from(strategicObjectives)
      .where(inArray(strategicObjectives.tenantId, context.scope.tenantIds));
    if (objectives.length === 0) {
      return {
        headline: "Strategic variance is UNAVAILABLE: no objectives in scope.",
        findings: [{ label: "Strategic objectives", value: "DATA_NOT_AVAILABLE", kind: "INFERENCE", status: "UNAVAILABLE" }],
        confidence: 0.3,
      };
    }
    const findings: NoeliaFinding[] = objectives.map((o) => {
      const target = o.targetValue === null ? null : Number(o.targetValue);
      const current = o.currentValue === null ? null : Number(o.currentValue);
      const progress = target !== null && target > 0 && current !== null
        ? (current / target) * 100
        : null;
      const variance = current !== null && target !== null ? current - target : null;
      return {
        label: `${o.code} · ${o.title}`,
        value: progress !== null
          ? `${progress.toFixed(1)}% of target (${variance! >= 0 ? "ahead" : "behind"} by ${Math.abs(variance!).toFixed(0)} ${o.unit ?? ""}) · ${o.status}`
          : `target not quantified · ${o.status}`,
        kind: "FACT",
        status: progress !== null ? "DERIVED" : "UNVERIFIED",
        provenance: `STRATEGIC_OBJECTIVE:${o.code}`,
        horizon: parseHorizon(o.horizon),
      };
    });
    const offTrack = objectives.filter((o) => o.status !== "ON_TRACK");
    return {
      headline: `Strategic variance: ${objectives.length} objective(s), ${offTrack.length} not on track.`,
      findings,
      narrative: "Strategic variance is derived from governed objective targets; it is evidence for decision-making, never an authority to change the objective.",
      confidence: 0.86,
      humanReviewRequired: offTrack.length > 0,
    };
  }

  /**
   * OPPORTUNITY_DETECTION — candidate opportunities assembled ONLY from
   * observed positive signals (improving metrics, on-track objectives,
   * approved capital). Candidates are signals, not determinations; no
   * opportunity is invented.
   */
  async opportunityDetection(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    const objectives = await db
      .select({ code: strategicObjectives.code, title: strategicObjectives.title, status: strategicObjectives.status })
      .from(strategicObjectives)
      .where(inArray(strategicObjectives.tenantId, context.scope.tenantIds));
    const capital = await this.loadCapital(context);
    const treasury = await this.loadTreasury(context);
    const improvingMetrics = treasury.length > 0
      ? [metric({
          code: "SIGNAL_CASH_TREND",
          label: "Consolidated cash trend",
          value: cashPosition(treasury, { asOf: new Date().toISOString().slice(0, 10) }).baseCurrencyTotal === null
            ? "DATA_NOT_AVAILABLE"
            : String(cashPosition(treasury, { asOf: new Date().toISOString().slice(0, 10) }).baseCurrencyTotal),
          status: "OBSERVED",
          source: "TREASURY_POSITIONS",
          trend: classifyTrend(treasury.map((p) => Number(p.baseCurrencyBalance))),
        })].filter((m) => m.trend === "UP" && m.status === "OBSERVED")
      : [];
    const onTrack = objectives.filter((o) => o.status === "ON_TRACK");
    const approvedCapital = capital.filter((c) => c.status === "APPROVED");
    const findings: NoeliaFinding[] = [
      ...improvingMetrics.map((m) => ({
        label: `Improving signal · ${m.label}`,
        value: `${m.value} (trend UP)`,
        kind: "INFERENCE" as const,
        status: "DERIVED" as const,
        provenance: m.source ?? undefined,
      })),
      ...onTrack.map((o) => ({
        label: `On-track objective · ${o.code}`,
        value: o.title,
        kind: "FACT" as const,
        status: "OBSERVED" as const,
        provenance: `STRATEGIC_OBJECTIVE:${o.code}`,
      })),
      ...approvedCapital.slice(0, 5).map((c) => ({
        label: `Approved capital · ${c.code}`,
        value: c.code,
        kind: "FACT" as const,
        status: "OBSERVED" as const,
        provenance: `CAPITAL:${c.code}`,
      })),
    ];
    if (findings.length === 0) {
      return {
        headline: "Opportunity detection: no observed positive signal in scope; nothing is invented (UNAVAILABLE).",
        findings: [{ label: "Candidate opportunities", value: "NONE_OBSERVED", kind: "INFERENCE", status: "UNAVAILABLE" }],
        confidence: 0.35,
      };
    }
    return {
      headline: `${findings.length} candidate opportunity signal(s) from observed positive indicators.`,
      findings,
      narrative: "Candidates are observed signals; opportunity determination and pursuit remain accountable-human decisions (REQUIRES_AUTHORITY where action is involved).",
      confidence: 0.72,
    };
  }

  /** EARLY_WARNING — observed deterioration signals only (risk appetite breaches, overdue obligations, off-track objectives). */
  async earlyWarning(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    const risksRows = await this.loadRisks(context);
    const obligations = await db
      .select({ code: complianceObligations.code, framework: complianceObligations.framework, nextDueAt: complianceObligations.nextDueAt, status: complianceObligations.status })
      .from(complianceObligations)
      .where(inArray(complianceObligations.tenantId, context.scope.tenantIds));
    const objectives = await db
      .select({ code: strategicObjectives.code, title: strategicObjectives.title, status: strategicObjectives.status })
      .from(strategicObjectives)
      .where(inArray(strategicObjectives.tenantId, context.scope.tenantIds));
    const today = new Date().toISOString().slice(0, 10);
    const breaches = risksRows.filter((r) => (r.residualLikelihood * r.residualImpact) > r.appetiteThreshold);
    const overdue = obligations.filter((o) => o.nextDueAt && o.nextDueAt < today);
    const offTrack = objectives.filter((o) => o.status !== "ON_TRACK");
    const findings: NoeliaFinding[] = [
      ...breaches.slice(0, 10).map((r) => ({
        label: `Risk appetite breach · ${r.code}`,
        value: `residual ${r.residualLikelihood * r.residualImpact} > appetite ${r.appetiteThreshold}`,
        kind: "FACT" as const,
        status: "OBSERVED" as const,
        provenance: `RISK:${r.code}`,
      })),
      ...overdue.slice(0, 10).map((o) => ({
        label: `Overdue obligation · ${o.code}`,
        value: `${o.framework} · overdue since ${o.nextDueAt}`,
        kind: "FACT" as const,
        status: "OBSERVED" as const,
        provenance: `OBLIGATION:${o.code}`,
      })),
      ...offTrack.slice(0, 10).map((o) => ({
        label: `Off-track objective · ${o.code}`,
        value: `${o.title} (${o.status})`,
        kind: "FACT" as const,
        status: "OBSERVED" as const,
        provenance: `STRATEGIC_OBJECTIVE:${o.code}`,
      })),
    ];
    if (findings.length === 0) {
      return {
        headline: "Early warning: no deterioration signal observed in scope.",
        findings: [{ label: "Early-warning signals", value: "NONE_OBSERVED", kind: "INFERENCE", status: "OBSERVED" }],
        confidence: 0.7,
      };
    }
    return {
      headline: `${findings.length} early-warning signal(s) from observed deterioration.`,
      findings,
      risks: findings.map((f) => f.label),
      humanReviewRequired: true,
      narrative: "Early-warning signals are observed deterioration; they escalate attention but create no authority to act.",
      confidence: 0.8,
    };
  }

  async crossDomainCorrelation(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    const [treasury, capital, risksRows, workforce] = await Promise.all([
      this.loadTreasury(context),
      this.loadCapital(context),
      this.loadRisks(context),
      listWorkforce(context.principal),
    ]);
    const records = workforce.records.filter((record) =>
      (!context.target.legalEntityId || record.legalEntityId === context.target.legalEntityId) &&
      (!context.target.countryCode || record.countryCode === context.target.countryCode));
    const findings = [
      {
        label: "Treasury observations",
        value: String(treasury.length),
        kind: "FACT" as const,
        status: treasury.length ? "OBSERVED" as const : "UNAVAILABLE" as const,
      },
      {
        label: "Capital requests",
        value: String(capital.length),
        kind: "FACT" as const,
        status: capital.length ? "OBSERVED" as const : "UNAVAILABLE" as const,
      },
      {
        label: "Risk register entries",
        value: String(risksRows.length),
        kind: "FACT" as const,
        status: risksRows.length ? "OBSERVED" as const : "UNAVAILABLE" as const,
      },
      {
        label: "Workforce records",
        value: String(records.length),
        kind: "FACT" as const,
        status: records.length ? "OBSERVED" as const : "UNAVAILABLE" as const,
      },
    ];
    return {
      headline: "Cross-domain correlation view — every domain independently authorized.",
      findings,
      narrative: "Correlation describes availability, never causation. Each domain remains authoritative for its own data.",
      confidence: 0.75,
    };
  }
}
