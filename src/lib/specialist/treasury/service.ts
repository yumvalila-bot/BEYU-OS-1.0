/**
 * BEYU OS — Treasury Intelligence governed service (Phase 7F).
 *
 * Every operation runs through the Phase 7B specialist platform: no bespoke RBAC, tenant
 * isolation, entity scoping, audit or capability logic lives here.
 *
 * READ-ONLY BY CONSTRUCTION. SELECT statements only. This module defines no tables, writes no
 * balance, and settles, transfers and approves nothing. `treasury_positions` remains the sole
 * source of treasury truth.
 *
 * CLEARANCE ENFORCEMENT — THE ONE CONTROL THIS MODULE ADDS.
 *
 * `treasury_positions.classification` is the ABAC security classification consumed by `can()`,
 * and the seeded reserve position TRS_T4 is HIGHLY_RESTRICTED while GROUP_CFO and AUDITOR hold
 * only RESTRICTED clearance. No previous specialist filtered on it, so a RESTRICTED-clearance
 * caller could read a HIGHLY_RESTRICTED balance through analysis. That is a genuine leak of the
 * most sensitive position in the system, so this service filters by clearance in the SQL
 * predicate and reports how many positions were withheld — a total that silently omits rows
 * without saying so is worse than a refusal.
 *
 * ON ATTRIBUTION. Scoping follows the tenant a position CLAIMS, never the tenant that owns its
 * legal entity. Following ownership would silently repair the known seeded defect and destroy the
 * evidence of it. Divergence is reported as GOVERNANCE_REVIEW_REQUIRED.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { capitalRequests, legalEntities, treasuryPositions } from "@/db/schema";
import { classificationRank, type Classification } from "@/lib/constants";
import { runSpecialist, type SpecialistContext, type SpecialistResult } from "../platform";
import {
  TREASURY_VERSION,
  attributionConsistency,
  cashPosition,
  liquidityCoverage,
  maturityProfile,
  treasuryConcentration,
  treasuryDataQuality,
  treasuryScenario,
} from "./engines";
import type {
  AttributionConsistency,
  CashPosition,
  MaturityProfile,
  TreasuryBucket,
  TreasuryDataQuality,
  TreasuryPositionView,
  TreasuryReport,
  TreasuryResult,
  TreasuryScenarioAdjustment,
  TreasuryThreshold,
} from "./model";

const MAX_ROWS = 5000;

function isoDate(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return "";
}

const CLASSIFICATIONS: Classification[] = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
  "HIGHLY_RESTRICTED",
];

/**
 * Classifications a principal at the given clearance may read.
 *
 * FAILS CLOSED ON AN UNRECOGNISED CLEARANCE. Found by hostile test: `classificationRank()` returns
 * `CLASSIFICATION_ORDER.length` for an unknown string — a value HIGHER than HIGHLY_RESTRICTED — so
 * comparing ranks directly would let a forged or corrupted clearance such as "SUPER_ADMIN" read
 * everything. That helper is safe in its original call site (it ranks the DATA classification,
 * where erring high denies access) but inverts to a privilege escalation when applied to the
 * PRINCIPAL's clearance. The clearance is therefore matched against the known set first, and an
 * unrecognised value yields no visibility at all.
 */
function visibleClassifications(clearance: Classification): Classification[] {
  if (!CLASSIFICATIONS.includes(clearance)) return [];
  return CLASSIFICATIONS.filter((c) => classificationRank(c) <= classificationRank(clearance));
}

/**
 * Loads treasury positions for the validated scope.
 *
 * Tenant, entity AND clearance are all applied in the SQL predicate. Post-filtering in application
 * code would still have pulled restricted balances into memory, and a control that depends on
 * remembering to filter later is a control waiting to fail.
 *
 * Returns the withheld count so callers can state that a figure is partial.
 */
async function loadPositions(
  tenantId: string,
  legalEntityId: string | null,
  clearance: Classification,
): Promise<{ positions: TreasuryPositionView[]; withheld: number }> {
  const allowed = visibleClassifications(clearance);

  const scopeConditions = [eq(treasuryPositions.tenantId, tenantId)];
  if (legalEntityId) scopeConditions.push(eq(treasuryPositions.legalEntityId, legalEntityId));

  // Count everything in scope regardless of clearance, so withholding is visible and honest.
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(treasuryPositions)
    .where(and(...scopeConditions));

  // Explicit short-circuit: an unrecognised clearance grants nothing. Relying on inArray with an
  // empty list would depend on driver-specific SQL generation for a security decision.
  const rows =
    allowed.length === 0
      ? []
      : await db
          .select()
          .from(treasuryPositions)
          .where(and(...scopeConditions, inArray(treasuryPositions.classification, allowed)))
          .limit(MAX_ROWS);

  const positions = rows
    .map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      legalEntityId: r.legalEntityId,
      institution: r.institution ?? "",
      accountLabel: r.accountLabel ?? "",
      accountType: r.accountType,
      currency: r.currency,
      balance: String(r.balance),
      baseCurrencyBalance: String(r.baseCurrencyBalance),
      asOf: isoDate(r.asOf),
      securityClassification: r.classification,
      basis: "OBSERVED" as const,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return { positions, withheld: Number(total) - positions.length };
}

async function loadCommitments(
  tenantId: string,
  legalEntityId: string | null,
): Promise<Array<{ id: string; amount: string; currency: string; status: string }>> {
  const conditions = [eq(capitalRequests.tenantId, tenantId)];
  if (legalEntityId) conditions.push(eq(capitalRequests.legalEntityId, legalEntityId));

  const rows = await db
    .select({
      id: capitalRequests.id,
      amount: capitalRequests.amount,
      currency: capitalRequests.currency,
      status: capitalRequests.status,
    })
    .from(capitalRequests)
    .where(and(...conditions))
    .limit(MAX_ROWS);

  return rows.map((r) => ({ id: r.id, amount: String(r.amount), currency: r.currency, status: r.status }));
}

/** Entity ownership, used ONLY to detect attribution divergence — never to widen scope. */
async function loadEntityOwners(): Promise<Record<string, string>> {
  const rows = await db.select({ id: legalEntities.id, tenantId: legalEntities.tenantId }).from(legalEntities);
  return Object.fromEntries(rows.map((e) => [e.id, e.tenantId]));
}

function assertAsOf(asOf: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error("asOf must be an ISO date (YYYY-MM-DD).");
  }
}

function withheldNote(withheld: number): string[] {
  return withheld > 0
    ? [
        `${withheld} position(s) in scope were withheld because their security classification ` +
          "exceeds your clearance. Every figure here is therefore PARTIAL.",
      ]
    : [];
}

type BaseOptions = { asOf?: string };

/** Raw position inventory for the validated scope. */
export async function readPositions(
  context: SpecialistContext,
  options: BaseOptions = {},
): Promise<SpecialistResult<{ positions: TreasuryPositionView[]; withheldPositionCount: number }>> {
  return runSpecialist(
    {
      specialist: "TREASURY",
      operation: "READ_POSITIONS",
      kind: "READ",
      permission: "finance:treasury.read",
      version: TREASURY_VERSION,
      riskClass: "LOW",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);
      const { positions, withheld } = await loadPositions(
        scope.tenantId,
        scope.legalEntityId,
        scope.principal.clearance,
      );

      return {
        data: { positions, withheldPositionCount: withheld },
        explanation: [
          `${positions.length} position(s) readable at your clearance.`,
          ...withheldNote(withheld),
          "Positions are reported exactly as recorded. Nothing is created, amended or converted.",
        ],
        provenance: {
          sources: positions.map((p) => ({ type: "TREASURY_POSITION", id: p.id })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Cash position, aggregated per currency with a flagged group total. */
export async function analyzeCash(
  context: SpecialistContext,
  options: BaseOptions = {},
): Promise<SpecialistResult<CashPosition & { withheldPositionCount: number }>> {
  return runSpecialist(
    {
      specialist: "TREASURY",
      operation: "ANALYZE_CASH",
      kind: "ANALYSIS",
      permission: "finance:treasury.read",
      version: TREASURY_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);
      const { positions, withheld } = await loadPositions(scope.tenantId, scope.legalEntityId, scope.principal.clearance);
      const cash = cashPosition(positions, { asOf });

      return {
        data: { ...cash, withheldPositionCount: withheld },
        explanation: [...cash.explanation, ...withheldNote(withheld)],
        provenance: {
          sources: positions.map((p) => ({ type: "TREASURY_POSITION", id: p.id })),
          assumptions: ["base_currency_balance carries an unverified FX restatement (P4)."],
          blockedBy: ["P4"],
        },
      };
    },
  );
}

/** Concentration on one treasury dimension. */
export async function analyzeConcentration(
  context: SpecialistContext,
  dimension: "COUNTERPARTY" | "CURRENCY" | "ENTITY" | "ACCOUNT_TYPE",
  options: BaseOptions & { threshold?: TreasuryThreshold } = {},
): Promise<SpecialistResult<TreasuryResult & { buckets: TreasuryBucket[]; withheldPositionCount: number }>> {
  return runSpecialist(
    {
      specialist: "TREASURY",
      operation: "ANALYZE_CONCENTRATION",
      kind: "ANALYSIS",
      permission: "finance:treasury.read",
      version: TREASURY_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);
      const { positions, withheld } = await loadPositions(scope.tenantId, scope.legalEntityId, scope.principal.clearance);
      const result = treasuryConcentration(positions, dimension, { asOf, threshold: options.threshold });

      return {
        data: { ...result, withheldPositionCount: withheld },
        explanation: [...result.explanation, ...withheldNote(withheld)],
        provenance: {
          sources: result.sources.map((s) => ({ type: s.type, id: s.id })),
          assumptions: result.assumptions,
          blockedBy: result.policyDependencies.filter((d) => /^P\d+$/.test(d)),
        },
      };
    },
  );
}

/** Liquidity coverage against committed capital. */
export async function analyzeLiquidity(
  context: SpecialistContext,
  options: BaseOptions & {
    liquidAccountTypes?: string[];
    committedStatuses?: string[];
    threshold?: TreasuryThreshold;
  } = {},
): Promise<SpecialistResult<TreasuryResult & { withheldPositionCount: number }>> {
  return runSpecialist(
    {
      specialist: "TREASURY",
      operation: "ANALYZE_LIQUIDITY",
      kind: "ANALYSIS",
      permission: "finance:treasury.read",
      version: TREASURY_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);
      const { positions, withheld } = await loadPositions(scope.tenantId, scope.legalEntityId, scope.principal.clearance);
      const commitments = await loadCommitments(scope.tenantId, scope.legalEntityId);

      const result = liquidityCoverage(positions, commitments, {
        asOf,
        liquidAccountTypes: options.liquidAccountTypes ?? [],
        committedStatuses: options.committedStatuses ?? [],
        threshold: options.threshold,
      });

      return {
        data: { ...result, withheldPositionCount: withheld },
        explanation: [...result.explanation, ...withheldNote(withheld)],
        provenance: {
          sources: result.sources.map((s) => ({ type: s.type, id: s.id })),
          assumptions: result.assumptions,
          blockedBy: result.policyDependencies.filter((d) => /^P\d+$/.test(d)),
        },
      };
    },
  );
}

/** Maturity profile. Structurally impossible on this substrate; returns a documented refusal. */
export async function analyzeMaturity(
  context: SpecialistContext,
  options: BaseOptions = {},
): Promise<SpecialistResult<MaturityProfile>> {
  return runSpecialist<MaturityProfile>(
    {
      specialist: "TREASURY",
      operation: "ANALYZE_MATURITY",
      kind: "ANALYSIS",
      permission: "finance:treasury.read",
      version: TREASURY_VERSION,
      riskClass: "LOW",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);
      const { positions } = await loadPositions(scope.tenantId, scope.legalEntityId, scope.principal.clearance);
      const profile = maturityProfile(positions);

      return {
        data: profile,
        explanation: profile.explanation,
        provenance: {
          sources: positions.map((p) => ({ type: "TREASURY_POSITION", id: p.id })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Treasury data quality, including FX-restatement verification and attribution divergence. */
export async function assessTreasuryDataQuality(
  context: SpecialistContext,
  options: BaseOptions & { staleAfterDays?: number } = {},
): Promise<SpecialistResult<TreasuryDataQuality & { attribution: AttributionConsistency[] }>> {
  return runSpecialist(
    {
      specialist: "TREASURY",
      operation: "ASSESS_DATA_QUALITY",
      kind: "ANALYSIS",
      permission: "finance:treasury.read",
      version: TREASURY_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);
      const { positions } = await loadPositions(scope.tenantId, scope.legalEntityId, scope.principal.clearance);
      const entityOwners = await loadEntityOwners();

      const quality = treasuryDataQuality(positions, {
        asOf,
        entityOwners,
        staleAfterDays: options.staleAfterDays,
      });
      const attribution = attributionConsistency(positions, entityOwners);

      return {
        data: { ...quality, attribution },
        explanation: [
          ...quality.explanation,
          `${attribution.filter((a) => !a.consistent).length} position(s) show tenant/entity attribution divergence, ` +
            "surfaced for governance review and deliberately not corrected.",
        ],
        provenance: {
          sources: positions.map((p) => ({ type: "TREASURY_POSITION", id: p.id })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Hypothetical scenario. Never mutates source truth. */
export async function runTreasuryScenario(
  context: SpecialistContext,
  scenarioCode: string,
  adjustments: TreasuryScenarioAdjustment[],
  options: BaseOptions = {},
): Promise<SpecialistResult<TreasuryResult & { buckets: TreasuryBucket[] }>> {
  return runSpecialist(
    {
      specialist: "TREASURY",
      operation: "RUN_SCENARIO",
      kind: "SIMULATION",
      permission: "finance:treasury.read",
      version: TREASURY_VERSION,
      riskClass: "LOW",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);
      const { positions } = await loadPositions(scope.tenantId, scope.legalEntityId, scope.principal.clearance);
      const result = treasuryScenario(positions, adjustments, { asOf, scenarioCode });

      return {
        data: result,
        explanation: result.explanation,
        provenance: {
          sources: result.sources.map((s) => ({ type: s.type, id: s.id })),
          assumptions: result.assumptions,
          blockedBy: [],
        },
      };
    },
  );
}

/** Consolidated treasury report. */
export async function generateTreasuryReport(
  context: SpecialistContext,
  options: BaseOptions & {
    liquidAccountTypes?: string[];
    committedStatuses?: string[];
    staleAfterDays?: number;
  } = {},
): Promise<SpecialistResult<TreasuryReport>> {
  return runSpecialist<TreasuryReport>(
    {
      specialist: "TREASURY",
      operation: "GENERATE_REPORT",
      kind: "ANALYSIS",
      permission: "finance:treasury.read",
      version: TREASURY_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);

      const { positions, withheld } = await loadPositions(scope.tenantId, scope.legalEntityId, scope.principal.clearance);
      const entityOwners = await loadEntityOwners();

      const cash = cashPosition(positions, { asOf });
      const concentrations = (["COUNTERPARTY", "CURRENCY", "ENTITY", "ACCOUNT_TYPE"] as const).map((d) =>
        treasuryConcentration(positions, d, { asOf }),
      );
      const quality = treasuryDataQuality(positions, { asOf, entityOwners, staleAfterDays: options.staleAfterDays });
      const attribution = attributionConsistency(positions, entityOwners);
      const maturity = maturityProfile(positions);

      const policyDependencies = [
        ...new Set([...concentrations.flatMap((c) => c.policyDependencies), "P4"]),
      ].sort();

      return {
        data: {
          asOf,
          tenantId: scope.tenantId,
          legalEntityId: scope.legalEntityId,
          cash,
          concentration: concentrations,
          dataQuality: quality,
          attribution,
          maturity,
          policyDependencies,
          authorityDependencies: [],
          withheldPositionCount: withheld,
          explanation: [
            `Treasury report at ${asOf} over ${positions.length} readable position(s).`,
            ...withheldNote(withheld),
          ],
        },
        explanation: [
          `Treasury report at ${asOf} over ${positions.length} readable position(s).`,
          ...withheldNote(withheld),
          `${concentrations.filter((c) => c.severity === "REQUIRES_POLICY").length} of ${concentrations.length} concentration measures could not be graded: no treasury limit is ratified.`,
          "Maturity and available-vs-restricted cash are DATA_NOT_AVAILABLE; the substrate holds neither.",
          "This report is intelligence. It authorises no settlement, transfer, allocation or approval.",
        ],
        provenance: {
          sources: positions.map((p) => ({ type: "TREASURY_POSITION", id: p.id })),
          assumptions: ["base_currency_balance carries an unverified FX restatement (P4)."],
          blockedBy: ["P4"],
        },
      };
    },
  );
}
