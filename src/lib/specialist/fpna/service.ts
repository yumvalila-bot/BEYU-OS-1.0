/**
 * BEYU OS — FP&A governed service layer (Phase 7C).
 *
 * Every operation runs through the Phase 7B specialist platform, so RBAC, tenant isolation,
 * entity scope, capability gating, provenance and audit emission are enforced by the SAME code
 * path as every other specialist. This module adds no security logic of its own — that was the
 * entire point of building the platform.
 *
 * THE ACTUALS RULE (§4). FP&A is a CONSUMER of financial truth, never a second source of it.
 * There is exactly one ledger, written only by the Phase 7A posting engine. When the accounting
 * substrate does not yet exist — which is the case today, with 0 ledger accounts and 0 journal
 * entries — the adapter returns DATA_NOT_AVAILABLE with a reason. It does not estimate, infer,
 * back-fill or fabricate a single figure.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { journalEntries, journalLines, treasuryPositions } from "@/db/schema";
import { runSpecialist, type SpecialistContext, type SpecialistResult } from "../platform";
import { forecast as runForecast, type ForecastOutput, type Observation } from "../forecasting";
import {
  FPNA_VERSION,
  assessDataQuality,
  buildManagementReport,
  calculateVariance,
  compareScenarios,
  deriveRiskSignals,
  type ScenarioComparison,
  type VarianceInput,
} from "./engines";
import type {
  Assumption,
  DataQualityIssue,
  FpnaObservation,
  ManagementReport,
  RiskSignal,
  Scenario,
  VarianceResult,
} from "./model";

export type ActualsResult = {
  state: "AVAILABLE" | "DATA_NOT_AVAILABLE" | "REQUIRES_AUTHORITY";
  reason: string;
  /** Empty whenever state is not AVAILABLE. Never populated with estimates. */
  observations: FpnaObservation[];
  /** What must happen before actuals become available. */
  blockedBy: string[];
};

/**
 * READ-ONLY actuals adapter over the canonical Finance OS substrate.
 *
 * Reads `journal_lines` joined to `journal_entries` — the single authoritative ledger. Creates no
 * storage of its own. Returns DATA_NOT_AVAILABLE when the ledger is empty rather than inventing
 * figures, which is the only honest answer while P1/P5/P6/P7 remain unratified.
 */
export async function readActuals(
  context: SpecialistContext,
  options: { fromDate?: string; toDate?: string; limit?: number } = {},
): Promise<SpecialistResult<ActualsResult>> {
  return runSpecialist<ActualsResult>(
    {
      specialist: "FPNA",
      operation: "READ_ACTUALS",
      kind: "READ",
      permission: "finance:ledger.read",
      version: FPNA_VERSION,
      riskClass: "LOW",
    },
    context,
    async (scope) => {
      const limit = Math.min(options.limit ?? 1000, 5000);

      const conditions = [eq(journalEntries.tenantId, scope.tenantId)];
      if (scope.legalEntityId) {
        conditions.push(eq(journalEntries.legalEntityId, scope.legalEntityId));
      }

      const rows = await db
        .select({
          entryId: journalEntries.id,
          accountId: journalLines.accountId,
          debit: journalLines.debit,
          credit: journalLines.credit,
          currency: journalEntries.currency,
          postedAt: journalEntries.postedAt,
          reference: journalEntries.reference,
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .where(and(...conditions))
        .limit(limit);

      if (rows.length === 0) {
        // The honest answer. No estimate, no back-fill, no zero-as-fact.
        return {
          data: {
            state: "DATA_NOT_AVAILABLE",
            reason:
              "The general ledger contains no posted entries. Actual financial figures cannot be " +
              "reported until the accounting substrate is ratified (P1, P5, P6, P7) and populated " +
              "through the governed posting engine.",
            observations: [],
            blockedBy: ["P1", "P5", "P6", "P7"],
          },
          explanation: [
            "Queried the canonical ledger for this tenant and entity scope; zero posted lines exist.",
            "FP&A does not maintain a second source of financial truth and will not estimate actuals.",
          ],
          provenance: { sources: [], assumptions: [], blockedBy: ["P1", "P5", "P6", "P7"] },
        };
      }

      const observations: FpnaObservation[] = rows.map((r) => ({
        seriesCode: r.accountId,
        periodDate: new Date(r.postedAt as unknown as string).toISOString().slice(0, 10),
        // Net movement per line. Sign convention follows debit-positive.
        value: (Number(r.debit) - Number(r.credit)).toFixed(2),
        currency: r.currency,
        basis: "OBSERVED",
        provenance: {
          tenantId: scope.tenantId,
          legalEntityId: scope.legalEntityId,
          sourceType: "JOURNAL_LINE",
          sourceId: r.entryId,
          version: FPNA_VERSION,
          createdBy: scope.principal.userId,
          createdAt: new Date().toISOString(),
          auditReference: scope.traceId,
        },
      }));

      return {
        data: {
          state: "AVAILABLE",
          reason: `${observations.length} posted line(s) read from the canonical ledger.`,
          observations,
          blockedBy: [],
        },
        explanation: [
          `Read ${observations.length} journal line(s) from the canonical ledger within tenant and entity scope.`,
          "Values are OBSERVED facts sourced directly from posted entries; FP&A stores no copy.",
        ],
        provenance: {
          sources: rows.slice(0, 50).map((r) => ({ type: "JOURNAL_ENTRY", id: r.entryId })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/**
 * Treasury position snapshot. Distinct from ledger actuals: these are real, seeded balances, and
 * they are NOT accounting figures. Labelled explicitly so nobody mistakes a bank balance for a
 * recognised ledger position.
 */
export async function readTreasuryPositions(
  context: SpecialistContext,
): Promise<SpecialistResult<{ positions: Array<{ id: string; currency: string; balance: string }>; note: string }>> {
  return runSpecialist(
    {
      specialist: "FPNA",
      operation: "READ_TREASURY",
      kind: "READ",
      permission: "finance:treasury.read",
      version: FPNA_VERSION,
      riskClass: "LOW",
    },
    context,
    async (scope) => {
      const rows = await db
        .select({
          id: treasuryPositions.id,
          currency: treasuryPositions.currency,
          balance: treasuryPositions.balance,
        })
        .from(treasuryPositions)
        .where(eq(treasuryPositions.tenantId, scope.tenantId))
        .limit(500);

      return {
        data: {
          positions: rows.map((r) => ({ id: r.id, currency: r.currency, balance: String(r.balance) })),
          note:
            "Treasury positions are operational balances, not recognised accounting figures. " +
            "They must not be presented as ledger actuals.",
        },
        explanation: [
          `Read ${rows.length} treasury position(s) within tenant scope.`,
          "These are operational balances. Accounting recognition of them requires P1 and is unratified.",
        ],
        provenance: {
          sources: rows.map((r) => ({ type: "TREASURY_POSITION", id: r.id })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Governed forecast. Delegates to the Phase 7B forecasting module; no logic is duplicated. */
export async function fpnaForecast(
  context: SpecialistContext,
  request: {
    seriesCode: string;
    observations: Observation[];
    horizon: number;
    method: "NAIVE_LAST" | "MOVING_AVERAGE" | "LINEAR_TREND";
    scenario?: string;
    assumptions?: string[];
    window?: number;
  },
): Promise<SpecialistResult<ForecastOutput>> {
  return runForecast(context, request);
}

/** Governed variance analysis. */
export async function analyseVariance(
  context: SpecialistContext,
  inputs: VarianceInput[],
): Promise<SpecialistResult<{ variances: VarianceResult[]; riskSignals: RiskSignal[] }>> {
  return runSpecialist(
    {
      specialist: "FPNA",
      operation: "ANALYSE_VARIANCE",
      kind: "ANALYSIS",
      permission: "finance:ledger.read",
      version: FPNA_VERSION,
      riskClass: "LOW",
    },
    context,
    async () => {
      const variances = inputs.map(calculateVariance);
      const riskSignals = deriveRiskSignals({ variances });

      return {
        data: { variances, riskSignals },
        explanation: [
          `Computed ${variances.length} variance(s).`,
          `${variances.filter((v) => v.materiality === "REQUIRES_POLICY").length} could not be assessed for materiality: no ratified threshold exists (P3).`,
          "Each variance records the epistemic basis of both sides, so a projection is never reported as a fact.",
        ],
        provenance: {
          sources: inputs.map((i) => ({ type: "VARIANCE_INPUT", id: `${i.seriesCode}@${i.periodDate}` })),
          assumptions: [],
          blockedBy: variances.some((v) => v.materiality === "REQUIRES_POLICY") ? ["P3"] : [],
        },
      };
    },
  );
}

/** Governed scenario comparison. Simulation only; mutates nothing. */
export async function compareScenariosGoverned(
  context: SpecialistContext,
  left: Scenario,
  right: Scenario,
): Promise<SpecialistResult<ScenarioComparison>> {
  return runSpecialist(
    {
      specialist: "FPNA",
      operation: "COMPARE_SCENARIOS",
      kind: "SIMULATION",
      permission: "finance:ledger.read",
      version: FPNA_VERSION,
      riskClass: "LOW",
    },
    context,
    async (scope) => {
      // Scenario isolation: a scenario from another tenant must never enter the comparison.
      for (const scenario of [left, right]) {
        if (scenario.provenance.tenantId !== scope.tenantId) {
          throw new Error("SCOPE");
        }
      }
      const comparison = compareScenarios(left, right);
      return {
        data: comparison,
        explanation: [
          `Compared ${left.scenarioCode} against ${right.scenarioCode} across ${comparison.driverDeltas.length} driver(s).`,
          "Scenario output is hypothetical and writes nothing to financial truth.",
        ],
        provenance: {
          sources: [
            { type: "SCENARIO", id: left.scenarioCode },
            { type: "SCENARIO", id: right.scenarioCode },
          ],
          assumptions: [...left.assumptions, ...right.assumptions].map((a) => a.statement),
          blockedBy: [],
        },
      };
    },
  );
}

/** Governed management report. Composes the read-only pieces; authorises nothing. */
export async function generateManagementReport(
  context: SpecialistContext,
  input: {
    reportCode: string;
    periodLabel: string;
    variances?: VarianceResult[];
    scenarios?: Scenario[];
    comparison?: ScenarioComparison;
    assumptions?: Assumption[];
    observations?: FpnaObservation[];
    forecastSummary?: string[];
  },
): Promise<SpecialistResult<ManagementReport>> {
  return runSpecialist<ManagementReport>(
    {
      specialist: "FPNA",
      operation: "MANAGEMENT_REPORT",
      kind: "ANALYSIS",
      permission: "finance:ledger.read",
      version: FPNA_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      // Re-read actuals through the canonical adapter so the report can never be poisoned by a
      // caller-supplied "actual".
      const actuals = await readActuals({ ...context, traceId: `${context.traceId}-act` });

      const dataQuality: DataQualityIssue[] =
        input.observations && input.observations.length > 0
          ? assessDataQuality(input.observations)
          : [];

      const riskSignals = deriveRiskSignals({
        variances: input.variances ?? [],
        dataQuality,
        scenarios: input.scenarios ?? [],
      });

      const report = buildManagementReport({
        reportCode: input.reportCode,
        periodLabel: input.periodLabel,
        actualsState: { state: actuals.data.state, reason: actuals.data.reason },
        variances: input.variances ?? [],
        scenarios: input.scenarios ?? [],
        comparison: input.comparison,
        dataQuality,
        riskSignals,
        assumptions: input.assumptions ?? [],
        forecastSummary: input.forecastSummary,
      });

      return {
        data: report,
        explanation: [
          `Generated report ${report.reportCode} with ${report.sections.length} section(s).`,
          `Actuals state: ${actuals.data.state}. Sections are classified FACT / FORECAST / ASSUMPTION / SCENARIO / RECOMMENDATION.`,
          "No recommendation in this report can execute; each terminates at RECOMMENDATION or REQUIRES_AUTHORITY.",
        ],
        provenance: {
          sources: [
            { type: "ACTUALS_ADAPTER", id: scope.traceId },
            ...(input.scenarios ?? []).map((s) => ({ type: "SCENARIO", id: s.scenarioCode })),
          ],
          assumptions: (input.assumptions ?? []).map((a) => a.statement),
          blockedBy: actuals.data.blockedBy,
        },
      };
    },
  );
}

/** Read-only KPI summary derived from whatever is genuinely available. */
export async function readKpis(
  context: SpecialistContext,
): Promise<SpecialistResult<{ kpis: Array<{ code: string; value: string | null; state: string; note: string }> }>> {
  return runSpecialist(
    {
      specialist: "FPNA",
      operation: "READ_KPIS",
      kind: "READ",
      permission: "finance:ledger.read",
      version: FPNA_VERSION,
      riskClass: "LOW",
    },
    context,
    async (scope) => {
      const ledgerCount = (
        (await db.execute(sql`
          select count(*)::int n from journal_entries where tenant_id = ${scope.tenantId}
        `)) as unknown as { rows: Array<{ n: number }> }
      ).rows[0].n;

      const kpis = [
        {
          code: "LEDGER_ENTRY_COUNT",
          value: String(ledgerCount),
          state: "AVAILABLE",
          note: "Structural count of posted entries. Not a financial measure.",
        },
        {
          code: "NET_INCOME",
          value: null,
          state: "REQUIRES_AUTHORITY",
          note: "Requires a ratified recognition basis (P1) and chart of accounts (P6).",
        },
        {
          code: "EBITDA",
          value: null,
          state: "REQUIRES_AUTHORITY",
          note: "Requires ratified measurement and classification (P1, P2, P6).",
        },
        {
          code: "WORKING_CAPITAL",
          value: null,
          state: "REQUIRES_AUTHORITY",
          note: "Requires a ratified chart of accounts (P6) to classify current items.",
        },
      ];

      return {
        data: { kpis },
        explanation: [
          "KPIs requiring an accounting definition are reported as REQUIRES_AUTHORITY rather than computed from an assumed definition.",
          "Only structurally derivable measures carry a value today.",
        ],
        provenance: { sources: [], assumptions: [], blockedBy: ["P1", "P2", "P6"] },
      };
    },
  );
}
