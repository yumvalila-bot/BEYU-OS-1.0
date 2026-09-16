/**
 * BEYU Foundation OS — Noelia intelligence service (read-only + drafts).
 *
 * Noelia is the single canonical AI identity; these are Foundation-domain
 * capabilities on the canonical HIVE runtime. Every method:
 *
 *   - inherits the invoking principal's RBAC/ABAC, tenant, entity and
 *     classification scope (nothing is re-derived from input),
 *   - resolves the CANONICAL Foundation target scope (`./target-scope`) before
 *     reading a single row, and refuses outright when the boundary cannot place
 *     the principal: the same boundary the Foundation deep-link layer and the
 *     Foundation API enforce, never a tenant-wide AI view,
 *   - reads authorised rows only (resolved target tenant + classification
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
import { resolveFoundationTargetScope } from "./target-scope";

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

/**
 * Authoritative Foundation tenant for every AI read, or `null` when the
 * canonical boundary cannot place the principal.
 *
 * The AI path is a Foundation data surface like any other, so it is held to the
 * same boundary as the Foundation API and the deep-link layer: a principal whose
 * resolved scope does not contain the canonical Foundation tenant (or whose
 * grant is limited to named legal entities, where tenant-wide containment cannot
 * be proven) reads NOTHING here. Returning `null` — rather than a wider tenant
 * set, the caller's own tenant, a default tenant or public data — is the same
 * fail-closed idiom already used for an unknown clearance (`visibleClassifications`
 * yields no rows). No row is queried before this resolves.
 */
async function authorizedFoundationTenant(context: ToolInvocationContext): Promise<string | null> {
  requireCanonicalContext();
  const resolution = await resolveFoundationTargetScope(context.principal);
  return resolution.ok ? resolution.scope.tenantId : null;
}

export class BeyuNoeliaFoundationService {
  async registry(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    const tenantId = await authorizedFoundationTenant(context);
    if (!tenantId) return { findings: [] };
    const classifications = visibleClassifications(context);
    if (classifications.length === 0) return { findings: [] };
    const rows = await db
      .select()
      .from(foundations)
      .where(
        and(
          eq(foundations.tenantId, tenantId),
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
    const tenantId = await authorizedFoundationTenant(context);
    if (!tenantId) return { findings: [] };
    const [obligations, deadlines] = await Promise.all([
      db.select().from(foundationObligations).where(eq(foundationObligations.tenantId, tenantId)),
      db.select().from(foundationDeadlines).where(eq(foundationDeadlines.tenantId, tenantId)),
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
    const tenantId = await authorizedFoundationTenant(context);
    if (!tenantId) return { findings: [] };
    const rows = await db
      .select()
      .from(grants)
      .where(eq(grants.tenantId, tenantId));
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
    const tenantId = await authorizedFoundationTenant(context);
    if (!tenantId) return { findings: [] };
    const [fundRows, donationRows] = await Promise.all([
      db.select().from(funds).where(eq(funds.tenantId, tenantId)),
      db
        .select({ total: sql<string>`coalesce(sum(${donations.amount}), 0)`, count: sql<number>`count(*)::int` })
        .from(donations)
        .where(eq(donations.tenantId, tenantId)),
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

  /**
   * Draft formation assessment. Pure analysis of caller-supplied intake —
   * persists nothing and reads no authoritative Foundation row, so there is no
   * scope to constrain; the registry still enforces the tool's permission,
   * declared classification and resolved target before this runs.
   */
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

  /** Draft structure simulation. Pure analysis of caller-supplied graphs — executes nothing. */
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
