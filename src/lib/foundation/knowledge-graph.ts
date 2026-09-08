/**
 * BEYU Foundation OS — knowledge graph (derived, read-only).
 *
 * The graph is computed from authoritative tables at query time — there is no
 * parallel graph store to drift. Nodes and edges inherit the tenant scope and
 * classification of their source rows; Noelia and the decision engine consume
 * only the authorised subgraph (see noelia-service.ts).
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { filterByClearance, type Principal } from "@/lib/authz";

export type GraphNode = {
  kind: string;
  id: string;
  label: string;
  classification?: string | null;
};

export type GraphEdge = {
  from: string;
  to: string;
  relation: string;
};

export type FoundationGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

function nodeKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

export async function buildFoundationGraph(principal: Principal, foundationId: string): Promise<FoundationGraph> {
  const scope = await tenantScopeIds(principal);
  const [foundation] = await db
    .select()
    .from(s.foundations)
    .where(and(eq(s.foundations.id, foundationId), inArray(s.foundations.tenantId, scope)))
    .limit(1);
  if (!foundation) throw new Error("Foundation not found in your authorised scope");

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const push = (kind: string, id: string, label: string, classification?: string | null) => {
    nodes.push({ kind, id: nodeKey(kind, id), label, classification: classification ?? "CONFIDENTIAL" });
  };
  const link = (fromKind: string, fromId: string, toKind: string, toId: string, relation: string) => {
    edges.push({ from: nodeKey(fromKind, fromId), to: nodeKey(toKind, toId), relation });
  };

  push("FOUNDATION", foundation.id, foundation.legalName, foundation.classification);
  if (foundation.legalEntityId) {
    push("LEGAL_ENTITY", foundation.legalEntityId, foundation.legalEntityId, "CONFIDENTIAL");
    link("FOUNDATION", foundation.id, "LEGAL_ENTITY", foundation.legalEntityId, "OPERATES_AS");
  }

  const inFoundation = <T>(table: T) => table as T;
  void inFoundation;

  const [fundRows, donorRows, donationRows, grantRows, granteeRows, programRows, projectRows, obligationRows, deadlineRows, riskRows, meetingRows, assetRows, investmentRows, safeguardRows, metricRows, assignmentRows] =
    await Promise.all([
      db.select().from(s.funds).where(and(eq(s.funds.foundationId, foundation.id), inArray(s.funds.tenantId, scope))),
      db.select().from(s.donors).where(inArray(s.donors.tenantId, scope)),
      db.select().from(s.donations).where(and(eq(s.donations.foundationId, foundation.id), inArray(s.donations.tenantId, scope))),
      db.select().from(s.grants).where(and(eq(s.grants.foundationId, foundation.id), inArray(s.grants.tenantId, scope))),
      db.select().from(s.grantees).where(inArray(s.grantees.tenantId, scope)),
      db.select().from(s.foundationPrograms).where(inArray(s.foundationPrograms.tenantId, scope)),
      db.select().from(s.foundationProjects).where(and(eq(s.foundationProjects.foundationId, foundation.id), inArray(s.foundationProjects.tenantId, scope))),
      db.select().from(s.foundationObligations).where(and(eq(s.foundationObligations.foundationId, foundation.id), inArray(s.foundationObligations.tenantId, scope))),
      db.select().from(s.foundationDeadlines).where(and(eq(s.foundationDeadlines.foundationId, foundation.id), inArray(s.foundationDeadlines.tenantId, scope))),
      db.select().from(s.risks).where(inArray(s.risks.tenantId, scope)),
      db.select().from(s.foundationMeetings).where(and(eq(s.foundationMeetings.foundationId, foundation.id), inArray(s.foundationMeetings.tenantId, scope))),
      db.select().from(s.foundationAssets).where(and(eq(s.foundationAssets.foundationId, foundation.id), inArray(s.foundationAssets.tenantId, scope))),
      db.select().from(s.foundationInvestments).where(and(eq(s.foundationInvestments.foundationId, foundation.id), inArray(s.foundationInvestments.tenantId, scope))),
      db.select().from(s.safeguardingCases).where(and(eq(s.safeguardingCases.foundationId, foundation.id), inArray(s.safeguardingCases.tenantId, scope))),
      db.select().from(s.foundationImpactMetrics).where(inArray(s.foundationImpactMetrics.tenantId, scope)),
      db.select().from(s.foundationWorkforceAssignments).where(and(eq(s.foundationWorkforceAssignments.foundationId, foundation.id), inArray(s.foundationWorkforceAssignments.tenantId, scope))),
    ]);

  for (const f of fundRows) {
    push("FUND", f.id, f.name, "CONFIDENTIAL");
    link("FOUNDATION", foundation.id, "FUND", f.id, "HOLDS");
  }
  const donorById = new Map(donorRows.map((d) => [d.id, d]));
  for (const d of donationRows) {
    push("DONATION", d.id, `${d.code} ${d.amount} ${d.currency}`, "RESTRICTED");
    link("FOUNDATION", foundation.id, "DONATION", d.id, "RECEIVED");
    const donor = donorById.get(d.donorId);
    if (donor) {
      push("DONOR", donor.id, donor.displayName, donor.classification);
      link("DONOR", donor.id, "DONATION", d.id, "GAVE");
    }
    if (d.fundId) link("DONATION", d.id, "FUND", d.fundId, "CAPITALISED");
  }
  const granteeById = new Map(granteeRows.map((g) => [g.id, g]));
  for (const g of grantRows) {
    push("GRANT", g.id, g.title, "CONFIDENTIAL");
    link("FOUNDATION", foundation.id, "GRANT", g.id, "AWARDS");
    if (g.fundId) link("FUND", g.fundId, "GRANT", g.id, "FUNDS");
    if (g.programId) link("GRANT", g.id, "PROGRAM", g.programId, "SERVES");
    const grantee = g.granteeId ? granteeById.get(g.granteeId) : undefined;
    if (grantee) {
      push("GRANTEE", grantee.id, grantee.displayName, grantee.classification);
      link("GRANT", g.id, "GRANTEE", grantee.id, "AWARDED_TO");
    }
  }
  for (const p of programRows) {
    push("PROGRAM", p.id, p.name, "CONFIDENTIAL");
    link("FOUNDATION", foundation.id, "PROGRAM", p.id, "OPERATES");
  }
  for (const p of projectRows) {
    push("PROJECT", p.id, p.name, "CONFIDENTIAL");
    link("PROGRAM", p.programId, "PROJECT", p.id, "CONTAINS");
  }
  for (const o of obligationRows) {
    push("OBLIGATION", o.id, o.requirement, "CONFIDENTIAL");
    link("FOUNDATION", foundation.id, "OBLIGATION", o.id, "OWES");
  }
  for (const d of deadlineRows) {
    push("DEADLINE", d.id, `${d.dueDate} ${d.status}`, "CONFIDENTIAL");
    link("OBLIGATION", d.obligationId, "DEADLINE", d.id, "DUE");
  }
  for (const r of riskRows.filter((x) => x.sectorCode === "FOUNDATION")) {
    push("RISK", r.id, r.title, r.classification);
    link("FOUNDATION", foundation.id, "RISK", r.id, "EXPOSED_TO");
  }
  for (const m of meetingRows) {
    push("MEETING", m.id, m.title, "CONFIDENTIAL");
    link("FOUNDATION", foundation.id, "MEETING", m.id, "GOVERNS_THROUGH");
  }
  for (const a of assetRows) {
    push("ASSET", a.id, a.name, "CONFIDENTIAL");
    link("FOUNDATION", foundation.id, "ASSET", a.id, "OWNS");
  }
  for (const i of investmentRows) {
    push("INVESTMENT", i.id, i.instrument, "CONFIDENTIAL");
    link("FOUNDATION", foundation.id, "INVESTMENT", i.id, "HOLDS_POSITION");
  }
  for (const c of safeguardRows) {
    push("SAFEGUARDING_CASE", c.id, `${c.code} ${c.status}`, c.classification);
    link("FOUNDATION", foundation.id, "SAFEGUARDING_CASE", c.id, "PROTECTS_THROUGH");
  }
  for (const m of metricRows) {
    push("IMPACT_METRIC", m.id, m.name, "CONFIDENTIAL");
    if (m.programId) link("PROGRAM", m.programId, "IMPACT_METRIC", m.id, "MEASURED_BY");
  }
  for (const a of assignmentRows) {
    push("ASSIGNMENT", a.id, `${a.roleTitle} (${a.assignmentType})`, "CONFIDENTIAL");
    link("FOUNDATION", foundation.id, "ASSIGNMENT", a.id, "STAFFED_BY");
  }

  // ABAC: strip nodes above the principal's clearance, then edges dangling
  // off removed nodes. Noelia consumes this authorised subgraph only.
  const visible = filterByClearance(principal, nodes);
  const visibleIds = new Set(visible.map((n) => n.id));
  return { nodes: visible, edges: edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to)) };
}
