/**
 * BEYU Foundation OS — Noelia intelligence service (read-only + drafts).
 *
 * Noelia is the single canonical AI identity; these are Foundation-domain
 * capabilities on the canonical HIVE runtime. Every method:
 *
 *   - inherits the invoking principal's RBAC/ABAC, tenant, entity and
 *     classification scope (nothing is re-derived from input),
 *   - reads authorised rows only (finite tenant predicates + classification
 *     ceilings), and
 *   - NEVER persists, approves, transfers, posts or restructures anything.
 *
 * Draft/analysis methods run the pure engines WITHOUT writing: their output
 * is a proposal a human must review and submit through governed APIs.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import {
  donations,
  foundationDeadlines,
  foundationObligations,
  foundations,
  funds,
  grants,
} from "@/db/schema";
import { CLASSIFICATION_ORDER, classificationRank, isKnownClassification } from "@/lib/constants";
import type { NoeliaToolOutput, ToolInvocationContext } from "@/lib/noelia/types";
import { deadlineHealth } from "./deadlines";
import { assessFormation, type FormationIntake } from "./formation";
import { simulateStructureChange, type StructureGraph } from "./structure";
import { FORMATION_DISCLAIMER } from "./formation";

function requireCanonicalContext(): void {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Foundation Noelia services require canonical transaction-scoped tenant context");
  }
}

function visibleClassifications(context: ToolInvocationContext) {
  if (!isKnownClassification(context.principal.clearance)) return [];
  return CLASSIFICATION_ORDER.filter(
    (c) => classificationRank(c) <= classificationRank(context.principal.clearance),
  );
}

export class BeyuNoeliaFoundationService {
  async registry(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const classifications = visibleClassifications(context);
    if (classifications.length === 0) return { findings: [] };
    const rows = await db
      .select()
      .from(foundations)
      .where(
        and(
          inArray(foundations.tenantId, context.scope.tenantIds),
          inArray(foundations.classification, classifications),
        ),
      );
    const byStatus = new Map<string, number>();
    for (const r of rows) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    return {
      findings: [
        { label: "Foundations in scope", value: String(rows.length), kind: "FACT" },
        ...[...byStatus.entries()].map(([status, count]) => ({
          label: `Status ${status}`,
          value: String(count),
          kind: "FACT" as const,
        })),
      ],
      sources: [{ kind: "TABLE", ref: "foundations", label: "Foundation Registry", authority: "FOUNDATION_OS" }],
    };
  }

  async compliancePosture(context: ToolInvocationContext, todayIso = new Date().toISOString().slice(0, 10)): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const [obligations, deadlines] = await Promise.all([
      db.select().from(foundationObligations).where(inArray(foundationObligations.tenantId, context.scope.tenantIds)),
      db.select().from(foundationDeadlines).where(inArray(foundationDeadlines.tenantId, context.scope.tenantIds)),
    ]);
    const open = deadlines.filter((d) => !["COMPLETED", "VERIFIED", "WAIVED"].includes(d.status));
    const overdue = open.filter((d) => d.status === "OVERDUE" || deadlineHealth(d.dueDate, todayIso) === "OVERDUE");
    const dueToday = open.filter((d) => deadlineHealth(d.dueDate, todayIso) === "DUE_TODAY");
    const atRisk = open.filter((d) => deadlineHealth(d.dueDate, todayIso) === "AT_RISK");
    const deteriorating = overdue.map((d) => `Deadline ${d.id} (${d.dueDate}) is OVERDUE`);
    return {
      findings: [
        { label: "Obligations", value: String(obligations.length), kind: "FACT" },
        { label: "Open deadlines", value: String(open.length), kind: "FACT" },
        { label: "Overdue", value: String(overdue.length), kind: "FACT" },
        { label: "Due today", value: String(dueToday.length), kind: "FACT" },
        { label: "At risk (≤14d)", value: String(atRisk.length), kind: "FACT" },
      ],
      deteriorating: deteriorating.slice(0, 20),
      managementAttentionRequired:
        overdue.length > 0 ? [`${overdue.length} overdue foundation deadline(s) require immediate owner action`] : [],
      humanReviewRequired: overdue.length > 0,
      sources: [
        { kind: "TABLE", ref: "foundation_obligations", label: "Foundation compliance registry", authority: "FOUNDATION_OS" },
        { kind: "TABLE", ref: "foundation_deadlines", label: "Foundation deadlines", authority: "FOUNDATION_OS" },
      ],
    };
  }

  async grantPipeline(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const rows = await db
      .select()
      .from(grants)
      .where(inArray(grants.tenantId, context.scope.tenantIds));
    const byStatus = new Map<string, { count: number; amount: number }>();
    for (const g of rows) {
      const slot = byStatus.get(g.status) ?? { count: 0, amount: 0 };
      slot.count += 1;
      slot.amount += Number(g.amount);
      byStatus.set(g.status, slot);
    }
    return {
      findings: [...byStatus.entries()].map(([status, v]) => ({
        label: `Grants ${status}`,
        value: `${v.count} · ${v.amount.toFixed(2)}`,
        kind: "FACT" as const,
      })),
      requiresHumanDecision:
        (byStatus.get("APPROVAL")?.count ?? 0) > 0
          ? [`${byStatus.get("APPROVAL")!.count} grant(s) await human approval — Noelia cannot approve grants`] : [],
      sources: [{ kind: "TABLE", ref: "grants", label: "Grant register", authority: "FOUNDATION_OS" }],
    };
  }

  async fundPosition(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const [fundRows, donationRows] = await Promise.all([
      db.select().from(funds).where(inArray(funds.tenantId, context.scope.tenantIds)),
      db
        .select({ total: sql<string>`coalesce(sum(${donations.amount}), 0)`, count: sql<number>`count(*)::int` })
        .from(donations)
        .where(inArray(donations.tenantId, context.scope.tenantIds)),
    ]);
    const balance = fundRows.reduce((a, f) => a + Number(f.balance), 0);
    const committed = fundRows.reduce((a, f) => a + Number(f.committed), 0);
    return {
      findings: [
        { label: "Funds", value: String(fundRows.length), kind: "FACT" },
        { label: "Fund balance", value: balance.toFixed(2), kind: "FACT" },
        { label: "Fund committed", value: committed.toFixed(2), kind: "FACT" },
        { label: "Donations recorded", value: String(donationRows[0]?.count ?? 0), kind: "FACT" },
        { label: "Donations total", value: String(donationRows[0]?.total ?? 0), kind: "FACT" },
      ],
      sources: [
        { kind: "TABLE", ref: "funds", label: "Fund register", authority: "FOUNDATION_OS" },
        { kind: "TABLE", ref: "donations", label: "Donations", authority: "FOUNDATION_OS" },
      ],
    };
  }

  /** Draft formation assessment. Pure analysis — persists nothing. */
  async draftFormationAssessment(
    context: ToolInvocationContext,
    intake: FormationIntake,
  ): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    void context;
    const assessment = assessFormation(intake);
    return {
      headline: `Formation readiness: ${assessment.readiness}`,
      narrative: assessment.summary,
      findings: assessment.options.map((o) => ({ label: o.vehicle, value: `${o.suitability} — ${o.rationale}`, kind: "INFERENCE" as const })),
      risks: assessment.risks,
      whatIsMissing: assessment.openQuestions,
      requiresHumanDecision: ["Qualified jurisdiction counsel must review and approve before formation proceeds"],
      limitations: [FORMATION_DISCLAIMER],
      humanReviewRequired: true,
      sources: [{ kind: "ENGINE", ref: "foundation.formation.assess", label: "Formation assessment engine", authority: "FOUNDATION_OS" }],
    };
  }

  /** Draft structure simulation. Pure analysis — executes nothing. */
  async draftStructureSimulation(
    context: ToolInvocationContext,
    input: { question: string; before: StructureGraph; after: StructureGraph },
  ): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    void context;
    const result = simulateStructureChange(input.question, input.before, input.after);
    return {
      headline: `Simulation: ${result.impacts.length} impact(s) across ${new Set(result.impacts.map((i) => i.dimension)).size} dimension(s)`,
      findings: result.impacts.map((i) => ({ label: `${i.dimension} [${i.severity}]`, value: i.finding, kind: "INFERENCE" as const })),
      requiresHumanDecision: result.requiredApprovals,
      limitations: ["Simulations never execute structural changes. Every change requires its own governed approval and implementation tasks."],
      humanReviewRequired: true,
      sources: [{ kind: "ENGINE", ref: "foundation.structure.simulate", label: "Structure simulator", authority: "FOUNDATION_OS" }],
    };
  }
}
