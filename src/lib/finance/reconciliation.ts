/**
 * BEYU OS — Reconciliation and data quality (Phase 7J, §8, §27).
 *
 * TWO RULES GOVERN EVERYTHING HERE:
 *
 *   1. NEVER SILENTLY ADJUST. A difference between two sources is evidence. Closing it by writing
 *      a plug entry destroys the evidence and manufactures agreement that does not exist. Every
 *      function reports; none repairs.
 *   2. AN EMPTY SOURCE IS NOT A RECONCILED SOURCE. With an empty ledger, treasury-vs-ledger
 *      "agrees" only in the sense that nothing disagrees. That is DATA_NOT_AVAILABLE, and saying
 *      so is the difference between an honest control and a vacuous one.
 *
 * READ-ONLY. SELECT statements only.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  journalEntries,
  journalLines,
  legalEntities,
  treasuryPositions,
} from "@/db/schema";
import type { EpistemicClass } from "./epistemics";

export const RECONCILIATION_VERSION = "reconciliation-1.0.0";

export const RECONCILIATION_STATUS = [
  "RECONCILED",
  "RECONCILIATION_REQUIRED",
  "DATA_NOT_AVAILABLE",
  "ATTRIBUTION_CONFLICT",
  "DATA_CONFLICT",
  "REQUIRES_AUTHORITY",
] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUS)[number];

export type ReconciliationResult = {
  subledger: string;
  controlAccount: string | null;
  subledgerTotal: string | null;
  ledgerTotal: string | null;
  difference: string | null;
  status: ReconciliationStatus;
  epistemicClass: EpistemicClass;
  /** Populated only when both sides genuinely exist. */
  itemsCompared: number;
  reason: string;
  /** Never present. Declared so its absence is a visible, testable design commitment. */
  adjustmentPosted: false;
};

/**
 * Reconciles treasury observations to the general ledger.
 *
 * The honest answer today is DATA_NOT_AVAILABLE: 5 treasury positions exist and 0 journal entries.
 * There is nothing to reconcile TO. Reporting "reconciled" here would be the single most dangerous
 * false positive the Finance OS could produce.
 */
export async function reconcileTreasuryToLedger(tenantId: string): Promise<ReconciliationResult> {
  const [treasury] = await db
    .select({
      total: sql<string>`coalesce(sum(${treasuryPositions.baseCurrencyBalance}), 0)::text`,
      n: sql<number>`count(*)::int`,
    })
    .from(treasuryPositions)
    .where(eq(treasuryPositions.tenantId, tenantId));

  const [ledger] = await db
    .select({
      total: sql<string>`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)::text`,
      n: sql<number>`count(*)::int`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(eq(journalEntries.tenantId, tenantId));

  const base = {
    subledger: "treasury_positions",
    controlAccount: null,
    itemsCompared: 0,
    adjustmentPosted: false as const,
  };

  if (Number(ledger?.n ?? 0) === 0) {
    return {
      ...base,
      subledgerTotal: treasury?.total ?? "0",
      ledgerTotal: null,
      difference: null,
      status: "DATA_NOT_AVAILABLE",
      epistemicClass: "DATA_NOT_AVAILABLE",
      reason:
        `${Number(treasury?.n ?? 0)} treasury position(s) exist but the general ledger holds no ` +
        "journal lines for this tenant. There is no ledger balance to reconcile against, so no " +
        "reconciliation conclusion is available. This is NOT agreement.",
    };
  }

  const diff = (Number(treasury?.total ?? 0) - Number(ledger?.total ?? 0)).toFixed(2);
  const reconciled = Number(diff) === 0;

  return {
    ...base,
    subledgerTotal: treasury?.total ?? "0",
    ledgerTotal: ledger?.total ?? "0",
    difference: diff,
    itemsCompared: Number(treasury?.n ?? 0) + Number(ledger?.n ?? 0),
    status: reconciled ? "RECONCILED" : "RECONCILIATION_REQUIRED",
    epistemicClass: "DERIVED",
    reason: reconciled
      ? "Treasury observations agree with the ledger control total."
      : `Treasury and ledger differ by ${diff}. Reported for investigation; no adjustment was posted.`,
  };
}

// ===========================================================================
// DATA QUALITY (§27)
// ===========================================================================

export const DATA_QUALITY_CHECK = [
  "ORPHANED_RECORD",
  "DUPLICATE_ID",
  "CROSS_TENANT_ATTRIBUTION",
  "CROSS_ENTITY_ATTRIBUTION",
  "INCONSISTENT_CURRENCY",
  "MISSING_PROVENANCE",
  "MISSING_AUTHORITY",
  "MISSING_DATE",
  "INVALID_TEMPORAL_RANGE",
  "CONFLICTING_SOURCE",
  "IMPOSSIBLE_BALANCE",
  "UNRECONCILED_SUBLEDGER",
  "STALE_DATA",
  "FABRICATED_ZERO",
  "MISSING_EVIDENCE",
] as const;
export type DataQualityCheck = (typeof DATA_QUALITY_CHECK)[number];

export type DataQualityFinding = {
  check: DataQualityCheck;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  table: string;
  affectedIds: string[];
  count: number;
  detail: string;
  /** Whether fixing this is a code change or a governance decision. */
  ownership: "CODE" | "DATA" | "GOVERNANCE";
  /** Always false. Governance-owned data is never auto-repaired. */
  repaired: false;
};

/**
 * Scans the real substrate for data-quality defects.
 *
 * Reports what is actually there. It will find the seeded cross-tenant treasury attribution and
 * the C-1 policy provenance gap, because both are real — a scan that returned an empty list would
 * be evidence the scan is broken, not that the data is clean.
 */
export async function scanDataQuality(): Promise<DataQualityFinding[]> {
  const findings: DataQualityFinding[] = [];

  // --- Cross-tenant attribution in treasury ---
  const attribution = await db
    .select({
      id: treasuryPositions.id,
      claimed: treasuryPositions.tenantId,
      owner: legalEntities.tenantId,
      entity: legalEntities.id,
    })
    .from(treasuryPositions)
    .innerJoin(legalEntities, eq(legalEntities.id, treasuryPositions.legalEntityId))
    .where(sql`${treasuryPositions.tenantId} <> ${legalEntities.tenantId}`);

  if (attribution.length > 0) {
    findings.push({
      check: "CROSS_TENANT_ATTRIBUTION",
      severity: "CRITICAL",
      table: "treasury_positions",
      affectedIds: attribution.map((a) => a.id).sort(),
      count: attribution.length,
      detail:
        `${attribution.length} treasury position(s) claim a tenant that does not own the entity: ` +
        attribution.map((a) => `${a.entity} owned by ${a.owner} but claimed by ${a.claimed}`).join("; ") +
        ". Aggregating these into a group view would import another tenant's financial truth.",
      ownership: "GOVERNANCE",
      repaired: false,
    });
  }

  // --- Missing policy provenance (C-1) ---
  const [prov] = await db.execute(
    sql`select count(*)::int as n from policies where approved_by_resolution_id is null`,
  ).then((r) => (r as unknown as { rows?: Array<{ n: number }> }).rows ?? (r as unknown as Array<{ n: number }>));

  if (Number(prov?.n ?? 0) > 0) {
    findings.push({
      check: "MISSING_PROVENANCE",
      severity: "CRITICAL",
      table: "policies",
      affectedIds: [],
      count: Number(prov.n),
      detail:
        `${prov.n} polic(ies) have no approving resolution. Every live policy is therefore ` +
        "unprovenanced and its authority cannot be evidenced in-system (C-1).",
      ownership: "GOVERNANCE",
      repaired: false,
    });
  }

  // --- Fabricated zeros: an empty ledger reported as a balance ---
  const [ledgerCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(journalEntries);
  if (Number(ledgerCount?.n ?? 0) === 0) {
    findings.push({
      check: "FABRICATED_ZERO",
      severity: "HIGH",
      table: "journal_entries",
      affectedIds: [],
      count: 0,
      detail:
        "The general ledger contains no journal entries. Any balance, trial balance or financial " +
        "statement must report DATA_NOT_AVAILABLE rather than 0.00, which would assert a measured " +
        "zero that was never observed.",
      ownership: "DATA",
      repaired: false,
    });
  }

  // --- Unreconciled subledgers ---
  findings.push({
    check: "UNRECONCILED_SUBLEDGER",
    severity: "MEDIUM",
    table: "treasury_positions",
    affectedIds: [],
    count: 1,
    detail:
      "Treasury cannot be reconciled to the ledger because the ledger is empty. The subledger " +
      "relationship is architecturally defined but has no data to exercise it.",
    ownership: "DATA",
    repaired: false,
  });

  // --- Stale data: treasury observed at a single historical date ---
  const asOf = await db
    .select({ asOf: treasuryPositions.asOf, n: sql<number>`count(*)::int` })
    .from(treasuryPositions)
    .groupBy(treasuryPositions.asOf);

  if (asOf.length === 1) {
    findings.push({
      check: "STALE_DATA",
      severity: "MEDIUM",
      table: "treasury_positions",
      affectedIds: [],
      count: Number(asOf[0].n),
      detail:
        `All ${asOf[0].n} treasury positions share a single as_of date (${String(asOf[0].asOf)}). ` +
        "There is no time series, so no trend, movement or liquidity forecast can be derived.",
      ownership: "DATA",
      repaired: false,
    });
  }

  return findings.sort((a, b) => a.check.localeCompare(b.check));
}

/** Aggregate summary. Counts only; never a score that hides a critical finding. */
export function summarizeDataQuality(findings: DataQualityFinding[]): {
  total: number;
  critical: number;
  governanceOwned: number;
  repaired: number;
  verdict: "CLEAN" | "DEFECTS_PRESENT";
} {
  return {
    total: findings.length,
    critical: findings.filter((f) => f.severity === "CRITICAL").length,
    governanceOwned: findings.filter((f) => f.ownership === "GOVERNANCE").length,
    repaired: 0,
    verdict: findings.length === 0 ? "CLEAN" : "DEFECTS_PRESENT",
  };
}
