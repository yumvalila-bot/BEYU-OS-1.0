/**
 * BEYU OS — FOUNDATION VISUALIZATION ADAPTER (shared capability → Foundation).
 *
 * BEYU Foundation is a strategic sister nonprofit linked to the control plane —
 * NOT a Sector LLC and NOT a duplicate Sector OS. Its adapter is scoped
 * accordingly: structures, grants, funds and compliance obligations, consumed
 * "where appropriate, subject to its own governance and scope" (§2/§17).
 *
 * Authorization reuses the canonical Foundation boundary:
 *   • a Foundation read grant (FOUNDATION_OS_READ_PERMISSIONS), AND
 *   • the BEYU-FOUNDATION tenant inside the principal's resolved scope
 *     (the same target-scope rule the Foundation API boundary and deep-link
 *     layer enforce — holding foundation:* in one tenant is NOT access to
 *     Foundation data in another), AND
 *   • `foundationScopeIds()` scoping inside every query (defence in depth),
 *     AND PostgreSQL RLS as the final boundary.
 *
 * Safeguarding records are NEVER visualization material through this adapter
 * (HIGHLY_RESTRICTED, person-centered). No beneficiary-level data is mapped.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { classificationsAtOrBelow, type Classification } from "@/lib/constants";
import { foundationScopeIds } from "@/lib/foundation/service";
import { assertSectorAccess } from "../authorization";
import { observed, unavailable } from "../provenance";
import { mapStatusToStage } from "../engines/lifecycle";
import { mapSeverity } from "../engines/risk";
import { emptyDataset, rowVisible, type AdapterDataset, type AdapterDescriptor, type AdapterRequest, type SectorVisualizationAdapter } from "./types";

const SYSTEM_OF_RECORD = "foundations, grants, funds, foundation_obligations, foundation_deadlines (Foundation OS)";

export const foundationAdapterDescriptor: AdapterDescriptor = {
  sector: "FOUNDATION",
  status: "IMPLEMENTED",
  suppliedDimensions: ["1D", "2D", "4D", "5D", "7D", "8D"],
  mappedCapabilities: [
    "foundation register & structures (2D, org/legal structure)",
    "grants: amounts, budgets, timelines, status, risk rating (4D/5D/7D/8D)",
    "funds: balances & committed amounts (5D)",
    "obligations & deadlines (8D compliance state)",
  ],
  notImplemented: [
    "safeguarding visualization — by design: HIGHLY_RESTRICTED person-centered data is never visualization material here",
    "beneficiary-level mapping — by design",
    "impact-metric dashboards (PLANNED)",
  ],
  systemOfRecord: SYSTEM_OF_RECORD,
};



export const foundationAdapter: SectorVisualizationAdapter = {
  sector: "FOUNDATION",
  describe: () => foundationAdapterDescriptor,

  async collect(principal: Principal, request: AdapterRequest): Promise<AdapterDataset> {
    const access = await assertSectorAccess(principal, "FOUNDATION");
    if (!access.allowed) return emptyDataset("FOUNDATION", SYSTEM_OF_RECORD, access.reason);

    const allowed = classificationsAtOrBelow(principal.clearance) as Classification[];
    if (allowed.length === 0) return emptyDataset("FOUNDATION", SYSTEM_OF_RECORD, "Principal clearance does not admit any classification.");

    const scope = await foundationScopeIds(principal);
    if (scope.length === 0) return emptyDataset("FOUNDATION", SYSTEM_OF_RECORD, "No Foundation tenant inside the principal's resolved scope.");

    const limit = Math.min(Math.max(request.limit ?? 100, 1), 300);
    const wants = new Set(request.dimensions);

    const objects: AdapterDataset["objects"] = [];
    const time: AdapterDataset["time"] = [];
    const quantities: AdapterDataset["quantities"] = [];
    const lifecycle: AdapterDataset["lifecycle"] = [];
    const risk: AdapterDataset["risk"] = [];

    const foundationWhere = request.subjectId
      ? and(inArray(s.foundations.tenantId, scope), eq(s.foundations.id, request.subjectId))
      : inArray(s.foundations.tenantId, scope);
    const foundations = (await db.select().from(s.foundations).where(foundationWhere).limit(limit)).filter((f) => rowVisible(f.classification, allowed));
    const foundationIds = foundations.map((f) => f.id);
    const classificationOf = new Map(foundations.map((f) => [f.id, f.classification as Classification]));

    for (const f of foundations) {
      objects.push({
        id: f.id,
        label: `${f.code} — ${f.legalName}`,
        layerId: "foundation-register",
        classification: f.classification as Classification,
        geometry: null,
        dimensionValues: {
          "1D": observed(f.status),
          "2D": observed(f.geographicScope ?? "unscoped"),
          "7D": observed(f.status),
        },
        accessibleText: `Foundation ${f.code} ${f.legalName}, vehicle ${f.legalVehicle}, jurisdiction ${f.countryCode}, status ${f.status}, mission scope ${f.geographicScope ?? "unknown"}.`,
        timeAnchor: f.foundingDate ?? null,
        sourceRef: `foundations:${f.id}`,
        status: f.status,
      });
      const stage = mapStatusToStage(f.status);
      if (stage) lifecycle.push({ subjectKey: f.id, stage, at: f.statusChangedAt?.toISOString() ?? null, sourceStatus: f.status, source: "foundations" });
    }

    if (foundationIds.length === 0) return { ...emptyDataset("FOUNDATION", SYSTEM_OF_RECORD), status: "OK" };

    /* Grants — 4D/5D/7D/8D. Grants/funds carry no own classification column;
     * they inherit the parent foundation's ceiling (fail-closed). */
    if (wants.has("4D") || wants.has("5D") || wants.has("7D") || wants.has("8D")) {
      const grants = await db
        .select()
        .from(s.grants)
        .where(and(inArray(s.grants.foundationId, foundationIds), inArray(s.grants.tenantId, scope)))
        .limit(limit * 4);
      for (const g of grants) {
        const classification = classificationOf.get(g.foundationId);
        if (!classification || !rowVisible(classification, allowed)) continue; // parent withheld → child withheld
        if (g.startDate) time.push({ at: g.startDate, label: `Grant ${g.code} starts`, source: "grants", kind: g.startDate > new Date().toISOString().slice(0, 10) ? "PLANNED" : "OCCURRED", ref: g.id });
        if (g.endDate) time.push({ at: g.endDate, label: `Grant ${g.code} ends`, source: "grants", kind: "PLANNED", ref: g.id });
        quantities.push({
          subjectKey: g.foundationId,
          kind: "BUDGET",
          amount: g.budget !== null && g.budget !== undefined ? observed(String(g.budget), g.currency) : g.amount !== null ? observed(String(g.amount), g.currency) : unavailable(),
          currency: g.currency ?? null,
          at: g.startDate ?? null,
          label: `Grant ${g.code} ${g.title}`.slice(0, 120),
        });
        const stage = mapStatusToStage(g.status);
        if (stage) lifecycle.push({ subjectKey: g.id, stage, at: g.startDate ?? null, sourceStatus: g.status, source: "grants" });
        if (g.riskRating) {
          risk.push({
            subjectKey: g.foundationId,
            kind: "RISK_REGISTER_ENTRY",
            severity: mapSeverity(g.riskRating),
            label: `Grant ${g.code} risk rating ${g.riskRating}`,
            at: g.updatedAt.toISOString(),
            state: g.status === "CLOSED" ? "CLOSED" : "OPEN",
          });
        }
      }
      const funds = await db
        .select()
        .from(s.funds)
        .where(and(inArray(s.funds.foundationId, foundationIds), inArray(s.funds.tenantId, scope)))
        .limit(limit * 2);
      for (const f of funds) {
        const classification = classificationOf.get(f.foundationId);
        if (!classification || !rowVisible(classification, allowed)) continue;
        quantities.push({ subjectKey: f.foundationId, kind: "BUDGET", amount: f.balance !== null && f.balance !== undefined ? observed(String(f.balance), f.currency) : unavailable(), currency: f.currency ?? null, label: `Fund ${f.code} balance` });
        quantities.push({ subjectKey: f.foundationId, kind: "COMMITTED", amount: f.committed !== null && f.committed !== undefined ? observed(String(f.committed), f.currency) : unavailable(), currency: f.currency ?? null, label: `Fund ${f.code} committed` });
      }
    }

    /* Obligations & deadlines — 8D compliance state. */
    if (wants.has("8D")) {
      const deadlines = await db
        .select()
        .from(s.foundationDeadlines)
        .where(and(inArray(s.foundationDeadlines.foundationId, foundationIds), inArray(s.foundationDeadlines.tenantId, scope)))
        .limit(limit * 4);
      for (const d of deadlines) {
        const classification = classificationOf.get(d.foundationId);
        if (!classification || !rowVisible(classification, allowed)) continue;
        const status = d.status ?? "UNKNOWN";
        risk.push({
          subjectKey: d.foundationId,
          kind: "COMPLIANCE_STATE",
          severity: unavailable(),
          label: `Deadline ${d.periodLabel ?? d.id}: ${status}`,
          at: d.dueDate ?? null,
          state: status === "COMPLETED" || status === "CLOSED" ? "CLOSED" : status === "MISSED" ? "OPEN" : "UNKNOWN",
        });
      }
    }

    return { sector: "FOUNDATION", status: "OK", objects, time, quantities, performance: [], lifecycle, risk, relationships: [], systemOfRecord: SYSTEM_OF_RECORD };
  },
};
