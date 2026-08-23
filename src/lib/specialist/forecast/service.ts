/**
 * BEYU OS — Forecasting, Scenario & Cross-Specialist governed service (Phase 7H).
 *
 * Every operation runs through the Phase 7B platform. No bespoke RBAC, tenant isolation, entity
 * scoping, audit or capability logic lives here.
 *
 * READ-ONLY BY CONSTRUCTION. SELECT statements only. No table is defined, no forecast is persisted
 * and no migration is added. Because nothing is stored, no historical forecast can be overwritten
 * — §11 immutability achieved by building less, not more.
 *
 * THE HONEST HEADLINE. BEYU has NO ledger history: `journal_entries` is empty, treasury holds a
 * single as_of date, compliance a single period. `forecastFromLedger` therefore returns
 * DATA_NOT_AVAILABLE with zero observations. That is the correct answer, and the engines remain
 * fully exercisable by a caller supplying governed observations, so the rails are real and ready
 * the moment history exists.
 *
 * CLEARANCE. Treasury positions carry an ABAC classification and one seeded position is
 * HIGHLY_RESTRICTED. Composition filters by clearance in SQL and reports `withheldRecordCount`,
 * carrying forward the Phase 7F fix — including its fail-closed whitelist, because
 * `classificationRank()` returns a value HIGHER than HIGHLY_RESTRICTED for an unknown string.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  capitalRequests,
  complianceObligations,
  journalEntries,
  journalLines,
  risks,
  treasuryPositions,
} from "@/db/schema";
import { classificationRank, type Classification } from "@/lib/constants";
import { runSpecialist, type SpecialistContext, type SpecialistResult } from "../platform";
import {
  FORECAST_ENGINE_VERSION,
  assessForecastQuality,
  compareScenarios,
  composeSources,
  policyBlockedConcepts,
  project,
  reconcileForecast,
  selectEffectiveAssumptions,
  sensitivityAnalysis,
  stressTest,
} from "./engines";
import type {
  ComposedView,
  ForecastAssumption,
  ForecastComparison,
  ForecastObservation,
  ForecastResult,
  ForecastScenario,
  PolicyBlockedConcept,
  ProjectionMethod,
  SensitivityResult,
  SourceContribution,
} from "./model";

const MAX_ROWS = 5000;

const CLASSIFICATIONS: Classification[] = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
  "HIGHLY_RESTRICTED",
];

/** Classifications a principal may read. FAILS CLOSED on an unrecognised clearance. */
function visibleClassifications(clearance: Classification): Classification[] {
  if (!CLASSIFICATIONS.includes(clearance)) return [];
  return CLASSIFICATIONS.filter((c) => classificationRank(c) <= classificationRank(clearance));
}

function assertAsOf(asOf: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error("asOf must be an ISO date (YYYY-MM-DD).");
  }
}

/**
 * Reads observed history from the canonical ledger.
 *
 * This is the ONLY path from stored truth into a forecast, and it reads the ledger — never a
 * specialist's derived output. Feeding one specialist's estimate into another's forecast would
 * launder an opinion into an input.
 */
async function loadLedgerHistory(
  tenantId: string,
  legalEntityId: string | null,
  seriesCode: string,
): Promise<ForecastObservation[]> {
  const conditions = [eq(journalEntries.tenantId, tenantId)];
  if (legalEntityId) conditions.push(eq(journalEntries.legalEntityId, legalEntityId));

  const rows = await db
    .select({
      id: journalEntries.id,
      postedAt: journalEntries.postedAt,
      currency: journalEntries.currency,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(journalEntries)
    .innerJoin(journalLines, eq(journalLines.entryId, journalEntries.id))
    .where(and(...conditions))
    .limit(MAX_ROWS);

  return rows.map((r) => ({
    seriesCode,
    periodDate:
      r.postedAt instanceof Date
        ? r.postedAt.toISOString().slice(0, 10)
        : String(r.postedAt).slice(0, 10),
    value: String(r.debit ?? r.credit ?? "0.00"),
    currency: r.currency,
    basis: "OBSERVED" as const,
    sourceType: "JOURNAL_LINE",
    sourceId: r.id,
  }));
}

type BaseOptions = { asOf?: string };

/**
 * Projects a series from CALLER-SUPPLIED governed observations.
 *
 * Declares no capability: it writes nothing and creates no binding instruction. The capabilities
 * that would turn a projection into a commitment are registered LOCKED and unreachable from here.
 */
export async function projectSeries(
  context: SpecialistContext,
  input: {
    seriesCode: string;
    observations: ForecastObservation[];
    method: ProjectionMethod;
    horizon: number;
    scenario?: ForecastScenario;
    window?: number;
  },
  options: BaseOptions = {},
): Promise<SpecialistResult<ForecastResult>> {
  return runSpecialist<ForecastResult>(
    {
      specialist: "FORECASTING",
      operation: "PROJECT_SERIES",
      kind: "ANALYSIS",
      permission: "finance:ledger.read",
      version: FORECAST_ENGINE_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);

      // Scenario ownership is bound to the validated scope: a caller cannot attribute a scenario
      // to another tenant or entity.
      if (input.scenario) {
        if (input.scenario.tenantId !== scope.tenantId) {
          throw new Error("Scenario tenant does not match the validated scope.");
        }
        for (const a of input.scenario.assumptions) {
          if (a.tenantId !== scope.tenantId) {
            throw new Error(`Assumption ${a.assumptionId} is attributed to a different tenant.`);
          }
        }
      }

      const result = project({
        seriesCode: input.seriesCode,
        observations: input.observations,
        method: input.method,
        horizon: input.horizon,
        asOf,
        scenario: input.scenario,
        window: input.window,
        actorUserId: scope.principal.userId,
        tenantId: scope.tenantId,
        legalEntityId: scope.legalEntityId,
      });

      return {
        data: result,
        explanation: [
          ...result.explanation,
          `Epistemic basis: ${result.basis}. A forecast is never an actual.`,
        ],
        provenance: {
          sources: input.observations.map((o) => ({ type: o.sourceType, id: o.sourceId })),
          assumptions: result.appliedAssumptions.map(
            (a) => `${a.assumptionId} (${a.owner}, from ${a.effectiveFrom}): ${a.rationale}`,
          ),
          blockedBy: result.policyDependencies.filter((d) => /^P\d+$/.test(d)),
        },
      };
    },
  );
}

/**
 * Attempts a forecast from the canonical ledger.
 *
 * With an empty ledger this returns DATA_NOT_AVAILABLE and zero observations. That result is the
 * deliverable: it proves the path is wired to real truth and refuses to invent history.
 */
export async function forecastFromLedger(
  context: SpecialistContext,
  input: { seriesCode: string; method: ProjectionMethod; horizon: number },
  options: BaseOptions = {},
): Promise<SpecialistResult<ForecastResult>> {
  return runSpecialist<ForecastResult>(
    {
      specialist: "FORECASTING",
      operation: "FORECAST_FROM_LEDGER",
      kind: "ANALYSIS",
      permission: "finance:ledger.read",
      version: FORECAST_ENGINE_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);

      const observations = await loadLedgerHistory(scope.tenantId, scope.legalEntityId, input.seriesCode);
      const result = project({
        seriesCode: input.seriesCode,
        observations,
        method: input.method,
        horizon: input.horizon,
        asOf,
        actorUserId: scope.principal.userId,
        tenantId: scope.tenantId,
        legalEntityId: scope.legalEntityId,
      });

      return {
        data: result,
        explanation: [
          ...result.explanation,
          observations.length === 0
            ? "The canonical ledger holds no entries for this scope. No history means no forecast — not a forecast of zero."
            : `${observations.length} observation(s) read from the canonical ledger.`,
        ],
        provenance: {
          sources: observations.map((o) => ({ type: o.sourceType, id: o.sourceId })),
          assumptions: [],
          blockedBy: result.policyDependencies.filter((d) => /^P\d+$/.test(d)),
        },
      };
    },
  );
}

/** Sensitivity analysis over a caller-supplied scenario. */
export async function analyzeSensitivity(
  context: SpecialistContext,
  input: {
    seriesCode: string;
    observations: ForecastObservation[];
    method: ProjectionMethod;
    horizon: number;
    scenario: ForecastScenario;
    shiftPercent: number;
  },
  options: BaseOptions = {},
): Promise<SpecialistResult<SensitivityResult>> {
  return runSpecialist<SensitivityResult>(
    {
      specialist: "FORECASTING",
      operation: "ANALYZE_SENSITIVITY",
      kind: "SIMULATION",
      permission: "finance:ledger.read",
      version: FORECAST_ENGINE_VERSION,
      riskClass: "LOW",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);
      if (input.scenario.tenantId !== scope.tenantId) {
        throw new Error("Scenario tenant does not match the validated scope.");
      }

      const result = sensitivityAnalysis(
        {
          seriesCode: input.seriesCode,
          observations: input.observations,
          method: input.method,
          horizon: input.horizon,
          asOf,
          scenario: input.scenario,
          actorUserId: scope.principal.userId,
          tenantId: scope.tenantId,
          legalEntityId: scope.legalEntityId,
        },
        input.shiftPercent,
      );

      return {
        data: result,
        explanation: result.explanation,
        provenance: {
          sources: input.observations.map((o) => ({ type: o.sourceType, id: o.sourceId })),
          assumptions: input.scenario.assumptions.map((a) => `${a.assumptionId}: ${a.rationale}`),
          blockedBy: [],
        },
      };
    },
  );
}

/** Compares several scenarios. Never nominates a preferred one. */
export async function compareForecastScenarios(
  context: SpecialistContext,
  input: {
    seriesCode: string;
    observations: ForecastObservation[];
    method: ProjectionMethod;
    horizon: number;
    scenarios: ForecastScenario[];
  },
  options: BaseOptions = {},
): Promise<SpecialistResult<ForecastComparison>> {
  return runSpecialist<ForecastComparison>(
    {
      specialist: "FORECASTING",
      operation: "COMPARE_SCENARIOS",
      kind: "SIMULATION",
      permission: "finance:ledger.read",
      version: FORECAST_ENGINE_VERSION,
      riskClass: "LOW",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);
      for (const s of input.scenarios) {
        if (s.tenantId !== scope.tenantId) {
          throw new Error(`Scenario ${s.scenarioCode} is attributed to a different tenant.`);
        }
      }

      const result = compareScenarios(
        {
          seriesCode: input.seriesCode,
          observations: input.observations,
          method: input.method,
          horizon: input.horizon,
          asOf,
          actorUserId: scope.principal.userId,
          tenantId: scope.tenantId,
          legalEntityId: scope.legalEntityId,
        },
        input.scenarios,
      );

      return {
        data: result,
        explanation: result.explanation,
        provenance: {
          sources: input.observations.map((o) => ({ type: o.sourceType, id: o.sourceId })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Stress test as an explicit, attributed scenario. */
export async function runStressTest(
  context: SpecialistContext,
  input: {
    seriesCode: string;
    observations: ForecastObservation[];
    method: ProjectionMethod;
    horizon: number;
    stressCode: string;
    multiplier: number;
    rationale: string;
  },
  options: BaseOptions = {},
): Promise<SpecialistResult<ForecastResult>> {
  return runSpecialist<ForecastResult>(
    {
      specialist: "FORECASTING",
      operation: "RUN_STRESS_TEST",
      kind: "SIMULATION",
      permission: "finance:ledger.read",
      version: FORECAST_ENGINE_VERSION,
      riskClass: "LOW",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);

      const result = stressTest(
        {
          seriesCode: input.seriesCode,
          observations: input.observations,
          method: input.method,
          horizon: input.horizon,
          asOf,
          actorUserId: scope.principal.userId,
          tenantId: scope.tenantId,
          legalEntityId: scope.legalEntityId,
        },
        {
          code: input.stressCode,
          multiplier: input.multiplier,
          // Ownership is the authenticated principal, never a caller-supplied string.
          owner: scope.principal.userId,
          rationale: input.rationale,
          asOf,
        },
      );

      return {
        data: result,
        explanation: [...result.explanation, "A stress test is a SCENARIO, not a prediction."],
        provenance: {
          sources: input.observations.map((o) => ({ type: o.sourceType, id: o.sourceId })),
          assumptions: result.appliedAssumptions.map((a) => `${a.assumptionId}: ${a.rationale}`),
          blockedBy: [],
        },
      };
    },
  );
}

/** Reconciles a prior forecast against observed actuals. */
export async function reconcile(
  context: SpecialistContext,
  input: { forecast: ForecastResult; actuals: ForecastObservation[] },
): Promise<SpecialistResult<ReturnType<typeof reconcileForecast>>> {
  return runSpecialist(
    {
      specialist: "FORECASTING",
      operation: "RECONCILE_FORECAST",
      kind: "ANALYSIS",
      permission: "finance:ledger.read",
      version: FORECAST_ENGINE_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async () => {
      const result = reconcileForecast(input.forecast, input.actuals);
      return {
        data: result,
        explanation: result.explanation,
        provenance: {
          sources: input.actuals.map((a) => ({ type: a.sourceType, id: a.sourceId })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/**
 * Cross-specialist composed view (§8).
 *
 * Reads each specialist's CANONICAL SOURCE directly rather than calling the specialist services.
 * Two reasons: calling them would emit a cascade of audit records for one user action, and it
 * would let one specialist's derived opinion enter another's input. Each contribution keeps its
 * own provenance and basis; nothing is flattened.
 */
export async function composeCrossSpecialistView(
  context: SpecialistContext,
  options: BaseOptions & { sources?: Array<"TREASURY" | "RISK" | "COMPLIANCE" | "FPNA"> } = {},
): Promise<SpecialistResult<ComposedView>> {
  return runSpecialist<ComposedView>(
    {
      specialist: "FORECASTING",
      operation: "COMPOSE_CROSS_SPECIALIST",
      kind: "ANALYSIS",
      permission: "finance:ledger.read",
      version: FORECAST_ENGINE_VERSION,
      riskClass: "HIGH",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);

      const requested = options.sources ?? ["TREASURY", "RISK", "COMPLIANCE", "FPNA"];
      const contributions: SourceContribution[] = [];
      let withheld = 0;

      // --- TREASURY: requires its own permission AND clearance filtering ---
      if (requested.includes("TREASURY")) {
        if (!scope.principal.permissions.has("finance:treasury.read")) {
          contributions.push({
            source: "TREASURY", available: false, basis: "DATA_NOT_AVAILABLE", provenance: [], summary: {},
            explanation: ["Treasury data requires finance:treasury.read, which this principal does not hold."],
          });
        } else {
          const allowed = visibleClassifications(scope.principal.clearance);
          const scopeConds = [eq(treasuryPositions.tenantId, scope.tenantId)];
          if (scope.legalEntityId) scopeConds.push(eq(treasuryPositions.legalEntityId, scope.legalEntityId));

          const [{ total }] = await db
            .select({ total: sql<number>`count(*)::int` })
            .from(treasuryPositions)
            .where(and(...scopeConds));

          const rows = allowed.length === 0
            ? []
            : await db
                .select()
                .from(treasuryPositions)
                .where(and(...scopeConds, inArray(treasuryPositions.classification, allowed)))
                .limit(MAX_ROWS);

          withheld += Number(total) - rows.length;
          contributions.push({
            source: "TREASURY",
            available: rows.length > 0,
            basis: rows.length > 0 ? "OBSERVED" : "DATA_NOT_AVAILABLE",
            provenance: rows.map((r) => ({ type: "TREASURY_POSITION", id: r.id })),
            summary: {
              positionCount: rows.length,
              distinctCurrencies: new Set(rows.map((r) => r.currency)).size,
              distinctInstitutions: new Set(rows.map((r) => r.institution)).size,
            },
            explanation: [
              `${rows.length} treasury position(s) readable at your clearance.`,
              "Balances carry an unverified FX restatement (P4) and are not aggregated here.",
            ],
          });
        }
      }

      // --- RISK ---
      if (requested.includes("RISK")) {
        if (!scope.principal.permissions.has("risk:register.read")) {
          contributions.push({
            source: "RISK", available: false, basis: "DATA_NOT_AVAILABLE", provenance: [], summary: {},
            explanation: ["Risk data requires risk:register.read, which this principal does not hold."],
          });
        } else {
          const conds = [eq(risks.tenantId, scope.tenantId)];
          if (scope.legalEntityId) conds.push(eq(risks.legalEntityId, scope.legalEntityId));
          const rows = await db.select().from(risks).where(and(...conds)).limit(MAX_ROWS);
          contributions.push({
            source: "RISK",
            available: rows.length > 0,
            basis: rows.length > 0 ? "OBSERVED" : "DATA_NOT_AVAILABLE",
            provenance: rows.map((r) => ({ type: "RISK", id: r.id })),
            summary: {
              riskCount: rows.length,
              escalatedCount: rows.filter((r) => r.escalated).length,
              aboveAppetiteCount: rows.filter((r) => r.residualLikelihood * r.residualImpact > r.appetiteThreshold).length,
            },
            explanation: [`${rows.length} risk(s) read from the existing register; no second register is created.`],
          });
        }
      }

      // --- COMPLIANCE ---
      if (requested.includes("COMPLIANCE")) {
        if (!scope.principal.permissions.has("compliance:obligation.read")) {
          contributions.push({
            source: "COMPLIANCE", available: false, basis: "DATA_NOT_AVAILABLE", provenance: [], summary: {},
            explanation: ["Compliance data requires compliance:obligation.read, which this principal does not hold."],
          });
        } else {
          const conds = [eq(complianceObligations.tenantId, scope.tenantId)];
          if (scope.legalEntityId) conds.push(eq(complianceObligations.legalEntityId, scope.legalEntityId));
          const rows = await db.select().from(complianceObligations).where(and(...conds)).limit(MAX_ROWS);
          contributions.push({
            source: "COMPLIANCE",
            available: rows.length > 0,
            basis: rows.length > 0 ? "OBSERVED" : "DATA_NOT_AVAILABLE",
            provenance: rows.map((r) => ({ type: "COMPLIANCE_OBLIGATION", id: r.id })),
            summary: {
              obligationCount: rows.length,
              distinctJurisdictions: new Set(rows.map((r) => r.jurisdictionCode)).size,
            },
            explanation: [`${rows.length} obligation(s). Compliance state is read from the governed register, never computed here.`],
          });
        }
      }

      // --- FP&A: the canonical ledger, which is empty ---
      if (requested.includes("FPNA")) {
        const conds = [eq(capitalRequests.tenantId, scope.tenantId)];
        if (scope.legalEntityId) conds.push(eq(capitalRequests.legalEntityId, scope.legalEntityId));
        const capital = await db.select().from(capitalRequests).where(and(...conds)).limit(MAX_ROWS);
        const [{ entries }] = await db
          .select({ entries: sql<number>`count(*)::int` })
          .from(journalEntries)
          .where(eq(journalEntries.tenantId, scope.tenantId));

        contributions.push({
          source: "FPNA",
          available: Number(entries) > 0,
          basis: Number(entries) > 0 ? "OBSERVED" : "DATA_NOT_AVAILABLE",
          provenance: capital.map((c) => ({ type: "CAPITAL_REQUEST", id: c.id })),
          summary: { ledgerEntryCount: Number(entries), capitalRequestCount: capital.length },
          explanation: [
            Number(entries) === 0
              ? "The canonical ledger is empty, so no actuals exist. This is DATA_NOT_AVAILABLE, not zero."
              : `${entries} ledger entry/entries available.`,
          ],
        });
      }

      const view = composeSources({
        asOf,
        tenantId: scope.tenantId,
        legalEntityId: scope.legalEntityId,
        contributions,
        withheldRecordCount: withheld,
      });

      return {
        data: view,
        explanation: [
          ...view.explanation,
          withheld > 0
            ? `${withheld} record(s) withheld by clearance; this view is PARTIAL.`
            : "No records were withheld by clearance.",
          "Each source keeps its own provenance and basis. No synthetic combined truth is produced.",
        ],
        provenance: {
          sources: contributions.flatMap((c) => c.provenance),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** The accounting concepts a forecast cannot compute without ratified policy (§6). */
export async function reportPolicyBoundary(
  context: SpecialistContext,
): Promise<SpecialistResult<{ blocked: PolicyBlockedConcept[] }>> {
  return runSpecialist(
    {
      specialist: "FORECASTING",
      operation: "REPORT_POLICY_BOUNDARY",
      kind: "READ",
      permission: "finance:ledger.read",
      version: FORECAST_ENGINE_VERSION,
      riskClass: "LOW",
    },
    context,
    async () => ({
      data: { blocked: policyBlockedConcepts() },
      explanation: [
        "These concepts are conventionally expected of a forecasting module and are deliberately NOT computed.",
        "Each requires a ratified measurement or recognition basis. Choosing a conventional definition " +
          "silently would be inventing accounting policy.",
      ],
      provenance: { sources: [], assumptions: [], blockedBy: ["P1", "P2", "P3", "P4", "P5"] },
    }),
  );
}

/** Forecast input quality, exposed independently so a caller can check before projecting. */
export async function assessQuality(
  context: SpecialistContext,
  input: { observations: ForecastObservation[]; method: ProjectionMethod },
): Promise<SpecialistResult<ReturnType<typeof assessForecastQuality>>> {
  return runSpecialist(
    {
      specialist: "FORECASTING",
      operation: "ASSESS_QUALITY",
      kind: "READ",
      permission: "finance:ledger.read",
      version: FORECAST_ENGINE_VERSION,
      riskClass: "LOW",
    },
    context,
    async () => {
      const quality = assessForecastQuality(input.observations, input.method);
      return {
        data: quality,
        explanation: quality.explanation,
        provenance: {
          sources: input.observations.map((o) => ({ type: o.sourceType, id: o.sourceId })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

export { selectEffectiveAssumptions };
export type { ForecastAssumption, ForecastObservation, ForecastScenario };
