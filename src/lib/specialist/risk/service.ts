/**
 * BEYU OS — Financial Risk Intelligence governed service (Phase 7D).
 *
 * Every operation runs through the Phase 7B specialist platform. This module contains NO bespoke
 * RBAC, tenant isolation, entity scoping, audit or capability logic — that was the point of
 * building the platform, and duplicating it here would create a second security boundary that
 * could drift.
 *
 * READ-ONLY BY CONSTRUCTION. This module issues SELECT statements only. It writes nothing to
 * financial tables, defines no tables of its own, and holds no balances. The canonical sources
 * remain `treasury_positions` and `capital_requests`; risk analysis is a lens over them, never a
 * copy of them.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { capitalRequests, legalEntities, policies, treasuryPositions } from "@/db/schema";
import { runSpecialist, type SpecialistContext, type SpecialistResult } from "../platform";
import {
  RISK_VERSION,
  authorityRisk,
  capitalExposure,
  concentration,
  counterpartyExposure,
  currencyExposure,
  dataQualityRisk,
  liquidityCoverage,
  scenarioRisk,
  thresholdAssessment,
  treasuryExposure,
  type CapitalObservation,
  type TreasuryObservation,
} from "./engines";
import type { RiskResult, RiskThreshold, ScenarioAdjustment } from "./model";

/**
 * Loads treasury positions within the validated scope.
 *
 * Tenant AND entity are filtered in the SQL predicate, not in application code after the fact:
 * a scope leak that only post-filters would still have pulled other tenants' balances into memory.
 */
async function loadTreasury(
  tenantId: string,
  legalEntityId: string | null,
): Promise<TreasuryObservation[]> {
  const conditions = [eq(treasuryPositions.tenantId, tenantId)];
  if (legalEntityId) conditions.push(eq(treasuryPositions.legalEntityId, legalEntityId));

  const rows = await db
    .select({
      id: treasuryPositions.id,
      tenantId: treasuryPositions.tenantId,
      legalEntityId: treasuryPositions.legalEntityId,
      currency: treasuryPositions.currency,
      institution: treasuryPositions.institution,
      accountType: treasuryPositions.accountType,
      balance: treasuryPositions.balance,
      baseCurrencyBalance: treasuryPositions.baseCurrencyBalance,
      asOf: treasuryPositions.asOf,
    })
    .from(treasuryPositions)
    .where(and(...conditions))
    .limit(5000);

  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    legalEntityId: r.legalEntityId,
    currency: r.currency,
    institution: r.institution ?? "",
    accountType: r.accountType,
    balance: String(r.balance),
    baseCurrencyBalance: String(r.baseCurrencyBalance),
    asOf: r.asOf ? new Date(r.asOf as unknown as string).toISOString().slice(0, 10) : "",
  }));
}

/** Loads capital requests within the validated scope, optionally narrowed to one entity. */
async function loadCapital(tenantId: string, legalEntityId: string | null): Promise<CapitalObservation[]> {
  const conditions = [eq(capitalRequests.tenantId, tenantId)];
  if (legalEntityId) conditions.push(eq(capitalRequests.legalEntityId, legalEntityId));

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
    .where(and(...conditions))
    .limit(5000);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    tenantId: r.tenantId,
    legalEntityId: r.legalEntityId,
    status: r.status,
    amount: String(r.amount),
    currency: r.currency,
    sectorCode: r.sectorCode,
  }));
}

export type RiskProfile = {
  asOf: string;
  results: RiskResult[];
  /** Every distinct policy/authority dependency surfaced by the profile. */
  policyDependencies: string[];
  authorityDependencies: string[];
};

/**
 * Full read-only risk profile for the validated scope.
 *
 * Declares no capability: it reads existing governed data and writes nothing, so gating it would
 * block legitimate risk oversight without protecting anything. Execution capabilities remain
 * locked elsewhere.
 */
export async function assessRiskProfile(
  context: SpecialistContext,
  options: {
    asOf?: string;
    /** Which treasury account types the caller treats as liquid. Not ratified; recorded as an assumption. */
    liquidAccountTypes?: string[];
    /** Which capital statuses the caller treats as committed. Not ratified; recorded as an assumption. */
    committedStatuses?: string[];
    /** Governed thresholds, if any exist. Absent by default — severity then stays REQUIRES_POLICY. */
    thresholds?: Record<string, RiskThreshold>;
  } = {},
): Promise<SpecialistResult<RiskProfile>> {
  return runSpecialist<RiskProfile>(
    {
      specialist: "FINANCIAL_RISK",
      operation: "ASSESS_PROFILE",
      kind: "ANALYSIS",
      permission: "finance:treasury.read",
      version: RISK_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
        throw new Error("asOf must be an ISO date (YYYY-MM-DD).");
      }

      const positions = await loadTreasury(scope.tenantId, scope.legalEntityId);
      const requests = await loadCapital(scope.tenantId, scope.legalEntityId);
      const thresholds = options.thresholds ?? {};

      // Entity ownership, so the data-quality engine can detect records attributed to one tenant
      // while pointing at another tenant's legal entity.
      const entityRows = await db
        .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
        .from(legalEntities);
      const entityTenants = Object.fromEntries(entityRows.map((e) => [e.id, e.tenantId]));

      const results: RiskResult[] = [
        counterpartyExposure(positions, { asOf, threshold: thresholds.COUNTERPARTY }),
        currencyExposure(positions, { asOf, threshold: thresholds.CURRENCY }),
        treasuryExposure(positions, { asOf, threshold: thresholds.TREASURY }),
        capitalExposure(requests, { asOf, threshold: thresholds.CAPITAL_SECTOR, dimension: "SECTOR" }),
        capitalExposure(requests, { asOf, threshold: thresholds.CAPITAL_ENTITY, dimension: "ENTITY" }),
        liquidityCoverage(positions, requests, {
          asOf,
          liquidAccountTypes: options.liquidAccountTypes ?? [],
          committedStatuses: options.committedStatuses ?? [],
          threshold: thresholds.LIQUIDITY,
        }),
        dataQualityRisk(positions, requests, { asOf, staleAfterDays: 365, entityTenants }),
      ];

      const policyDependencies = [...new Set(results.flatMap((r) => r.policyDependencies))].sort();
      const authorityDependencies = [...new Set(results.flatMap((r) => r.authorityDependencies))].sort();

      return {
        data: { asOf, results, policyDependencies, authorityDependencies },
        explanation: [
          `Assessed ${results.length} risk measure(s) over ${positions.length} treasury position(s) and ${requests.length} capital request(s).`,
          `${results.filter((r) => r.severity === "REQUIRES_POLICY").length} measure(s) could not be assigned a severity: no ratified risk appetite exists.`,
          `${results.filter((r) => r.basis === "DATA_NOT_AVAILABLE").length} measure(s) returned DATA_NOT_AVAILABLE rather than a fabricated zero.`,
          "All values are OBSERVED or DERIVED from canonical sources. Risk analysis writes nothing.",
        ],
        provenance: {
          sources: [
            ...positions.map((p) => ({ type: "TREASURY_POSITION", id: p.id })),
            ...requests.map((r) => ({ type: "CAPITAL_REQUEST", id: r.id })),
          ],
          assumptions: [...new Set(results.flatMap((r) => r.assumptions))],
          blockedBy: policyDependencies.filter((d) => /^P\d+$/.test(d)),
        },
      };
    },
  );
}

/** Read-only concentration on a single dimension. */
export async function assessConcentration(
  context: SpecialistContext,
  dimension: "COUNTERPARTY" | "CURRENCY" | "TREASURY_ACCOUNT_TYPE" | "CAPITAL_SECTOR" | "CAPITAL_ENTITY",
  options: { asOf?: string; threshold?: RiskThreshold } = {},
): Promise<SpecialistResult<RiskResult>> {
  return runSpecialist<RiskResult>(
    {
      specialist: "FINANCIAL_RISK",
      operation: "ASSESS_CONCENTRATION",
      kind: "ANALYSIS",
      permission: "finance:treasury.read",
      version: RISK_VERSION,
      riskClass: "LOW",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      let result: RiskResult;

      if (dimension === "CAPITAL_SECTOR" || dimension === "CAPITAL_ENTITY") {
        const requests = await loadCapital(scope.tenantId, scope.legalEntityId);
        result = capitalExposure(requests, {
          asOf,
          threshold: options.threshold,
          dimension: dimension === "CAPITAL_SECTOR" ? "SECTOR" : "ENTITY",
        });
      } else {
        const positions = await loadTreasury(scope.tenantId, scope.legalEntityId);
        result =
          dimension === "COUNTERPARTY"
            ? counterpartyExposure(positions, { asOf, threshold: options.threshold })
            : dimension === "CURRENCY"
              ? currencyExposure(positions, { asOf, threshold: options.threshold })
              : treasuryExposure(positions, { asOf, threshold: options.threshold });
      }

      return {
        data: result,
        explanation: result.explanation,
        provenance: {
          sources: result.sources.map((s) => ({ type: s.type, id: s.id })),
          assumptions: result.assumptions,
          blockedBy: result.policyDependencies.filter((d) => /^P\d+$/.test(d)),
        },
      };
    },
  );
}

/** Read-only governance/authority risk. Observes the registries; never alters them. */
export async function assessAuthorityRisk(
  context: SpecialistContext,
): Promise<SpecialistResult<RiskResult>> {
  return runSpecialist<RiskResult>(
    {
      specialist: "FINANCIAL_RISK",
      operation: "ASSESS_AUTHORITY_RISK",
      kind: "ANALYSIS",
      permission: "governance:policy.read",
      version: RISK_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const pending = (
        (await db.execute(sql`
          select decision_id from governance_decision_registry
          where status = 'PENDING' order by decision_id
        `)) as unknown as { rows: Array<{ decision_id: string }> }
      ).rows.map((r) => r.decision_id);

      const locked = (
        (await db.execute(sql`
          select capability_code from governance_capability_registry
          where activation_status = 'LOCKED' order by capability_code
        `)) as unknown as { rows: Array<{ capability_code: string }> }
      ).rows.map((r) => r.capability_code);

      const policyRows = await db
        .select({ id: policies.id, approvedBy: policies.approvedByResolutionId })
        .from(policies)
        .where(eq(policies.status, "ACTIVE"));

      const result = authorityRisk({
        pendingDecisions: pending,
        lockedCapabilities: locked,
        policiesWithoutProvenance: policyRows.filter((p) => !p.approvedBy).length,
        totalPolicies: policyRows.length,
      });

      return {
        data: result,
        explanation: [
          ...result.explanation,
          `Scope: tenant ${scope.tenantId}. Registry state is global and read without modification.`,
        ],
        provenance: {
          sources: policyRows.map((p) => ({ type: "POLICY", id: p.id })),
          assumptions: [],
          blockedBy: pending.filter((d) => /^P\d+$/.test(d)),
        },
      };
    },
  );
}

/** Read-only scenario risk. Hypothetical only; production data is never touched. */
export async function simulateRiskScenario(
  context: SpecialistContext,
  scenarioCode: string,
  adjustments: ScenarioAdjustment[],
  options: { asOf?: string } = {},
): Promise<SpecialistResult<RiskResult>> {
  return runSpecialist<RiskResult>(
    {
      specialist: "FINANCIAL_RISK",
      operation: "SIMULATE_SCENARIO",
      kind: "SIMULATION",
      permission: "finance:treasury.read",
      version: RISK_VERSION,
      riskClass: "LOW",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      const positions = await loadTreasury(scope.tenantId, scope.legalEntityId);
      const result = scenarioRisk(positions, adjustments, { asOf, scenarioCode });

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

/** Applies a governed threshold to an already-measured value. */
export async function assessThreshold(
  context: SpecialistContext,
  measured: { code: string; value: string | null; unit: RiskResult["unit"] },
  threshold: RiskThreshold | undefined,
  options: { asOf?: string } = {},
): Promise<SpecialistResult<RiskResult>> {
  return runSpecialist<RiskResult>(
    {
      specialist: "FINANCIAL_RISK",
      operation: "ASSESS_THRESHOLD",
      kind: "ANALYSIS",
      permission: "finance:treasury.read",
      version: RISK_VERSION,
      riskClass: "LOW",
    },
    context,
    async () => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      const result = thresholdAssessment(measured, threshold, asOf);
      return {
        data: result,
        explanation: result.explanation,
        provenance: { sources: [], assumptions: result.assumptions, blockedBy: [] },
      };
    },
  );
}

export { concentration };
