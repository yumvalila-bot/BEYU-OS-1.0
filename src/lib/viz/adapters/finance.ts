/**
 * BEYU OS — FINANCE OS VISUALIZATION ADAPTER (shared capability → Sector OS).
 *
 * ══════════════ FINANCE BOUNDARY — THE HARD RULE (§11/§37) ══════════════
 * Financial visualization is READ-GOVERNED. This adapter:
 *   • reuses the EXISTING authorized Finance read path — the governed
 *     reporting engine's `trialBalance()` (src/lib/finance/reporting.ts) and
 *     the chart-of-accounts/period registers — instead of querying ledgers
 *     with new ad-hoc SQL;
 *   • NEVER imports the posting engine, the waterfall engine or any journal
 *     writer (enforced by tests/viz/regression.test.ts);
 *   • creates NO authorization to post: CAP_POSTING remains LOCKED. No
 *     visualization feature may post journals, alter balances, bypass
 *     approvals/Finance authorization/RLS/policy — and none can, because the
 *     only Finance code reachable from this module is read-only reporting;
 *   • preserves Finance's own epistemic honesty: a trial balance with no
 *     lines yields UNAVAILABLE totals (never 0.00), mixed currencies are
 *     flagged, and DERIVED aggregates stay DERIVED.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Mapped Finance capabilities (§17-FINANCE): financial structure (chart of
 * accounts, 2D diagram), authorized transaction analytics (trial balance,
 * 5D), periods (4D timeline), account relationships (2D), dashboards (1D/2D).
 * Treasury structures/capital flows are declared PLANNED (their read services
 * exist but no governed viz mapping is implemented yet — not claimed here).
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { classificationsAtOrBelow } from "@/lib/constants";
import { trialBalance } from "@/lib/finance/reporting";
import { assertSectorAccess } from "../authorization";
import { derived, observed, unavailable } from "../provenance";
import type { TwinRelationship } from "../digital-twin";
import { emptyDataset, type AdapterDataset, type AdapterDescriptor, type AdapterRequest, type SectorVisualizationAdapter } from "./types";

const SYSTEM_OF_RECORD = "ledger_accounts, financial_periods, journal_entries/journal_lines via the governed Finance reporting engine (Finance OS)";

/** Finance route classification floor (src/lib/api.ts): finance:* responses
 * imply RESTRICTED. Financial viz objects therefore carry RESTRICTED and only
 * principals at-or-above that ceiling ever see them. */
const FINANCE_OBJECT_CLASSIFICATION = "RESTRICTED" as const;

export const financeAdapterDescriptor: AdapterDescriptor = {
  sector: "FINANCE",
  status: "IMPLEMENTED",
  suppliedDimensions: ["1D", "2D", "4D", "5D"],
  mappedCapabilities: [
    "chart of accounts structure (2D diagram, parent/child relationships)",
    "authorized transaction analytics via the governed trial balance (5D, DERIVED, read-only)",
    "financial periods OPEN/CLOSING/CLOSED/LOCKED (4D timeline, 7D state)",
    "financial dashboards (1D indicators: totals, balance verdict, limitations)",
  ],
  notImplemented: [
    "treasury structure visualization (PLANNED — read services exist, no governed viz mapping yet)",
    "capital-flow animation",
    "scenario modeling surfaces (waterfall simulation remains a Finance OS capability; visualization never simulates money)",
    "ANY write/posting path — by constitutional design, not by omission",
  ],
  systemOfRecord: SYSTEM_OF_RECORD,
};

export const financeAdapter: SectorVisualizationAdapter = {
  sector: "FINANCE",
  describe: () => financeAdapterDescriptor,

  async collect(principal: Principal, request: AdapterRequest): Promise<AdapterDataset> {
    // DATA AUTHORIZATION: an authorized Finance read path is required
    // independently of the viz capability. Without it: NOT_AVAILABLE.
    const access = await assertSectorAccess(principal, "FINANCE");
    if (!access.allowed) return emptyDataset("FINANCE", SYSTEM_OF_RECORD, access.reason);

    const allowed = classificationsAtOrBelow(principal.clearance);
    // Finance responses imply RESTRICTED; a lower clearance admits nothing.
    if (!allowed.includes(FINANCE_OBJECT_CLASSIFICATION)) {
      return emptyDataset("FINANCE", SYSTEM_OF_RECORD, "Finance visualization requires RESTRICTED clearance (the finance capability classification floor).");
    }

    const tenantId = principal.tenantId;
    const limit = Math.min(Math.max(request.limit ?? 200, 1), 500);
    const wants = new Set(request.dimensions);

    const objects: AdapterDataset["objects"] = [];
    const time: AdapterDataset["time"] = [];
    const quantities: AdapterDataset["quantities"] = [];
    const relationships: TwinRelationship[] = [];

    /* Chart of accounts — 2D structure diagram (reference data, no amounts). */
    const accounts = await db
      .select()
      .from(s.ledgerAccounts)
      .where(eq(s.ledgerAccounts.tenantId, tenantId))
      .limit(limit * 4);
    for (const a of accounts) {
      objects.push({
        id: a.id,
        label: `${a.code} — ${a.name}`,
        layerId: "finance-accounts",
        classification: FINANCE_OBJECT_CLASSIFICATION,
        geometry: null,
        dimensionValues: {
          "1D": observed(a.accountType),
          "2D": observed(a.ifrsCategory ?? a.accountType),
        },
        accessibleText: `Ledger account ${a.code} ${a.name}, type ${a.accountType}, IFRS category ${a.ifrsCategory ?? "unspecified"}, ${a.active ? "active" : "inactive"}.`,
        timeAnchor: null,
        sourceRef: `ledger_accounts:${a.id}`,
        status: a.active ? "ACTIVE" : "INACTIVE",
      });
      if (a.parentAccountId) {
        relationships.push({ to: a.parentAccountId, relation: "CHILD_OF_ACCOUNT", status: "OBSERVED" });
      }
    }

    /* Financial periods — 4D timeline + lifecycle state. Periods are
     * entity-scoped (no tenant column), so they are explicitly joined to the
     * tenant's legal entities — RLS remains the final boundary on top. */
    if (wants.has("4D") || wants.has("7D")) {
      const entityRows = await db
        .select({ id: s.legalEntities.id })
        .from(s.legalEntities)
        .where(eq(s.legalEntities.tenantId, tenantId));
      const entityIds = entityRows.map((e) => e.id);
      const periods = entityIds.length === 0 ? [] : await db
        .select({
          id: s.financialPeriods.id,
          entityId: s.financialPeriods.legalEntityId,
          code: s.financialPeriods.code,
          startsOn: s.financialPeriods.startsOn,
          endsOn: s.financialPeriods.endsOn,
          status: s.financialPeriods.status,
          closedAt: s.financialPeriods.closedAt,
        })
        .from(s.financialPeriods)
        .where(and(inArray(s.financialPeriods.legalEntityId, entityIds)))
        .limit(limit * 2);
      for (const p of periods) {
        time.push({ at: p.startsOn, label: `Period ${p.code} opens`, source: "financial_periods", kind: "OCCURRED", ref: p.id });
        time.push({ at: p.endsOn, label: `Period ${p.code} ends`, source: "financial_periods", kind: p.status === "OPEN" || p.status === "CLOSING" ? "PLANNED" : "OCCURRED", ref: p.id });
        if (p.closedAt) time.push({ at: p.closedAt.toISOString(), label: `Period ${p.code} closed`, source: "financial_periods", kind: "OCCURRED", ref: p.id });
        objects.push({
          id: p.id,
          label: `Period ${p.code}`,
          layerId: "finance-periods",
          classification: FINANCE_OBJECT_CLASSIFICATION,
          geometry: null,
          dimensionValues: { "4D": observed(`${p.startsOn} → ${p.endsOn}`), "7D": observed(p.status) },
          accessibleText: `Financial period ${p.code} for entity ${p.entityId}: ${p.startsOn} to ${p.endsOn}, status ${p.status}.`,
          timeAnchor: p.startsOn,
          sourceRef: `financial_periods:${p.id}`,
          status: p.status,
        });
      }
    }

    /* Trial balance — the ONLY money surface: the existing governed read. */
    if (wants.has("5D") || wants.has("1D")) {
      const asOf = new Date().toISOString().slice(0, 10);
      const report = await trialBalance({ tenantId, legalEntityId: request.subjectId ?? null, asOf });
      for (const line of report.lines.slice(0, limit)) {
        quantities.push({
          subjectKey: line.accountCode ?? line.caption,
          kind: "ACTUAL",
          // Trial-balance lines are DERIVED aggregates of POSTED entries —
          // the reporting engine's own epistemic class is preserved.
          amount: line.balance !== null && line.balance !== undefined ? { value: String(line.balance), status: "DERIVED", unit: line.currency ?? null, observedAt: report.asOf } : unavailable(),
          currency: line.currency ?? null,
          at: report.asOf,
          label: `${line.accountCode ?? "?"} ${line.caption}`,
        });
      }
      objects.push({
        id: `trial-balance:${tenantId}:${asOf}`,
        label: `Trial balance ${asOf}`,
        layerId: "finance-trial-balance",
        classification: FINANCE_OBJECT_CLASSIFICATION,
        geometry: null,
        dimensionValues: {
          "5D":
            report.totalDebits !== null && report.totalCredits !== null
              ? derived(`debits ${report.totalDebits} / credits ${report.totalCredits}`, report.reportingCurrency)
              : unavailable(),
          "1D": observed(report.overallClass),
        },
        accessibleText: `Trial balance as of ${asOf}: ${report.lines.length} account line(s); overall epistemic class ${report.overallClass}; balanced ${report.balanced === null ? "UNKNOWN" : String(report.balanced)}; assurance ${report.assurance}; limitations: ${report.limitations.join(" ") || "none"}. READ-GOVERNED — CAP_POSTING remains LOCKED; visualization never posts.`,
        timeAnchor: asOf,
        sourceRef: `finance_reporting:trial_balance:${asOf}`,
        status: report.overallClass,
      });
    }

    return {
      sector: "FINANCE",
      status: "OK",
      objects,
      time,
      quantities,
      performance: [],
      lifecycle: [],
      risk: [],
      relationships,
      systemOfRecord: SYSTEM_OF_RECORD,
    };
  },
};
