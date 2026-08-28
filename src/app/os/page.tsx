import Link from "next/link";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  aiDecisions,
  capitalRequests,
  complianceAssessments,
  employees,
  legalEntities,
  resolutions,
  risks,
  sectorMetrics,
  strategicObjectives,
  tasks,
  treasuryPositions,
  waterfallRunLines,
  waterfallRuns,
} from "@/db/schema";
import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { can } from "@/lib/authz";
import { Badge, EmptyState, Metric, Panel, money, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function ControlCentre() {
  const principal = await requirePrincipal();
  return withTenantDatabaseContext(principal, async () => {
  const scope = await tenantScopeIds(principal);
  const tenantId = principal.tenantId;

  /**
   * Dashboard capability gates.
   *
   * WHY THIS EXISTS
   *   This page used to be tenant-scoped but NOT capability-scoped: it read
   *   treasury, capital, waterfall, risk, compliance, workforce, governance and
   *   AI data for any authenticated principal, and only the treasury metric
   *   honoured a permission. A principal explicitly DENIED /os/governance
   *   (no `governance:resolution.read`) or /os/assurance (no
   *   `risk:register.read`) could still read recent resolutions and
   *   above-appetite risks here — the module-level RBAC was bypassed by the
   *   dashboard that summarises the same data. The header even claimed every
   *   figure was "filtered to your granted permissions", which was untrue.
   *
   *   Each gate below is the SAME capability the corresponding module page
   *   passes to `requireAccess()`, evaluated with the SAME `can()` primitive, so
   *   the dashboard can never show what the module would deny. Ungranted data is
   *   not fetched at all, so it cannot reach the rendered HTML or the RSC
   *   payload.
   */
  const caps = {
    treasury: can(principal, "finance:treasury.read").allowed,
    capital: can(principal, "finance:capital.read").allowed,
    waterfall: can(principal, "finance:waterfall.read").allowed,
    risk: can(principal, "risk:register.read").allowed,
    compliance: can(principal, "compliance:obligation.read").allowed,
    workforce: can(principal, "hcm:employee.read").allowed,
    entities: can(principal, "organization:entity.read").allowed,
    governance: can(principal, "governance:resolution.read").allowed,
    aiReview: can(principal, "ai:decision.review").allowed,
    dashboard: can(principal, "platform:dashboard.read").allowed,
  };

  /** Run a query only when the capability is granted; otherwise a safe empty. */
  const gated = <T,>(allowed: boolean, query: Promise<T>, fallback: T): Promise<T> =>
    allowed ? query : Promise.resolve(fallback);

  const [[liquidity], pipeline, riskRows, complianceRows, [headcount], sectorRows, objectives, pendingResolutions, openTasks, [aiPending], lastRun] =
    await Promise.all([
      gated(
        caps.treasury,
        db
          .select({ total: sql<string>`coalesce(sum(${treasuryPositions.baseCurrencyBalance}),0)`, n: sql<number>`count(*)` })
          .from(treasuryPositions)
          .where(inArray(treasuryPositions.tenantId, scope)),
        [{ total: "0", n: 0 }],
      ),
      gated(
        caps.capital,
        db
          .select({ status: capitalRequests.status, total: sql<string>`coalesce(sum(${capitalRequests.amount}),0)`, n: sql<number>`count(*)` })
          .from(capitalRequests)
          .where(inArray(capitalRequests.tenantId, scope))
          .groupBy(capitalRequests.status),
        [],
      ),
      gated(caps.risk, db.select().from(risks).where(inArray(risks.tenantId, scope)), []),
      gated(
        caps.compliance,
        db
          .select({ state: complianceAssessments.state, n: sql<number>`count(*)` })
          .from(complianceAssessments)
          .where(inArray(complianceAssessments.tenantId, scope))
          .groupBy(complianceAssessments.state),
        [],
      ),
      gated(
        caps.workforce,
        db
          .select({ n: sql<number>`count(*)`, active: sql<number>`count(*) filter (where ${employees.status} = 'ACTIVE')` })
          .from(employees)
          .where(inArray(employees.tenantId, scope)),
        [{ n: 0, active: 0 }],
      ),
      gated(
        caps.dashboard,
        db.select().from(sectorMetrics).where(and(inArray(sectorMetrics.tenantId, scope), eq(sectorMetrics.metricCode, "REVENUE_YTD_USD"))),
        [],
      ),
      gated(caps.dashboard, db.select().from(strategicObjectives).where(inArray(strategicObjectives.tenantId, scope)), []),
      gated(
        caps.governance,
        db.select().from(resolutions).where(inArray(resolutions.tenantId, scope)).orderBy(desc(resolutions.createdAt)).limit(5),
        [],
      ),
      gated(
        caps.dashboard,
        db.select().from(tasks).where(and(inArray(tasks.tenantId, scope), sql`${tasks.status} <> 'DONE'`)).orderBy(tasks.dueAt).limit(6),
        [],
      ),
      gated(
        caps.aiReview,
        db
          .select({ n: sql<number>`count(*)` })
          .from(aiDecisions)
          .where(and(inArray(aiDecisions.tenantId, scope), eq(aiDecisions.humanReviewRequired, true), isNull(aiDecisions.reviewedBy))),
        [{ n: 0 }],
      ),
      gated(
        caps.waterfall,
        db.select().from(waterfallRuns).where(inArray(waterfallRuns.tenantId, scope)).orderBy(desc(waterfallRuns.executedAt)).limit(1),
        [],
      ),
    ]);

  const runLines = lastRun[0]
    ? await db.select().from(waterfallRunLines).where(eq(waterfallRunLines.runId, lastRun[0].id)).orderBy(waterfallRunLines.sequence)
    : [];

  const entityCount = caps.entities
    ? await db
        .select({ n: sql<number>`count(*)` })
        .from(legalEntities)
        .where(inArray(legalEntities.tenantId, scope))
        .then((r) => Number(r[0]?.n ?? 0))
    : 0;

  const breaches = riskRows.filter((r) => r.residualLikelihood * r.residualImpact > r.appetiteThreshold);
  const assessed = complianceRows.reduce((a, r) => a + Number(r.n), 0);
  const compliant = Number(complianceRows.find((r) => r.state === "COMPLIANT")?.n ?? 0);
  const revenue = sectorRows.reduce((a, r) => a + Number(r.value), 0);
  const pipelineTotal = pipeline.reduce((a, r) => a + Number(r.total), 0);

  const canFinance = caps.treasury;
  const maxAlloc = Math.max(1, ...runLines.map((l) => Number(l.allocatedAmount)));

  /** Shown in place of a figure the principal's grants do not cover. */
  const restricted = (capability: string) => ({ value: "Restricted", sub: `${capability} not granted` });

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Executive control centre</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Enterprise status — {principal.tenantCode}</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          Every figure below resolves to a declared source of truth and is filtered to your granted
          permissions, tenant and clearance ({principal.clearance}).
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Consolidated liquidity · Finance OS"
          {...(canFinance
            ? { value: money(liquidity?.total, "USD"), sub: `${liquidity?.n ?? 0} treasury positions` }
            : restricted("finance:treasury.read"))}
          tone="gold"
        />
        <Metric
          label="Sector revenue YTD · Sector OSs"
          {...(caps.dashboard
            ? { value: money(revenue, "USD"), sub: `${sectorRows.length} sectors reporting` }
            : restricted("platform:dashboard.read"))}
        />
        <Metric
          label="Risks above appetite · Risk engine"
          {...(caps.risk
            ? { value: String(breaches.length), sub: `${riskRows.length} risks in register` }
            : restricted("risk:register.read"))}
        />
        <Metric
          label="Compliance rate · Compliance engine"
          {...(caps.compliance
            ? {
                value: assessed ? `${Math.round((compliant / assessed) * 100)}%` : "Not assessed",
                sub: `${compliant}/${assessed} obligations compliant`,
              }
            : restricted("compliance:obligation.read"))}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Active workforce · HCM"
          {...(caps.workforce
            ? { value: `${headcount?.active ?? 0}`, sub: `${headcount?.n ?? 0} employee master records` }
            : restricted("hcm:employee.read"))}
        />
        <Metric
          label="Capital pipeline · Finance OS"
          {...(caps.capital
            ? { value: money(pipelineTotal, "USD"), sub: pipeline.map((p) => `${p.status}:${p.n}`).join(" · ") || "none" }
            : restricted("finance:capital.read"))}
        />
        <Metric
          label="Legal entities · Corporate structure"
          {...(caps.entities
            ? { value: String(entityCount), sub: "effective-dated, ownership mapped" }
            : restricted("organization:entity.read"))}
        />
        <Metric
          label="AI awaiting human review · HIVE"
          {...(caps.aiReview
            ? { value: String(aiPending?.n ?? 0), sub: "Noelia never self-approves" }
            : restricted("ai:decision.review"))}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        {caps.waterfall && (
        <Panel kicker="Finance OS · waterfall" title={lastRun[0] ? `Latest distribution — ${lastRun[0].period}` : "Waterfall"}
          action={<Link href="/os/waterfall" className="text-[11.5px] font-semibold text-[#b08d1c]">Open engine →</Link>}>
          {lastRun[0] ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[11.5px] beyu-muted">
                <Badge tone={stateTone(lastRun[0].status)}>{lastRun[0].status}</Badge>
                <span>gross {money(lastRun[0].grossAmount, lastRun[0].currency)}</span>
                <span>· engine {lastRun[0].engineVersion}</span>
                <span>· checksum {lastRun[0].checksum.slice(0, 12)}…</span>
              </div>
              <div className="space-y-2">
                {runLines.map((l) => (
                  <div key={l.id} className="grid grid-cols-[150px_1fr_120px] items-center gap-3">
                    <div className="text-[12px] font-medium">{l.tierName}</div>
                    <div className="h-2.5 rounded-full bg-[color:var(--beyu-line)]">
                      <div
                        className="h-2.5 rounded-full bg-gradient-to-r from-[#0b1d3a] to-[#d4af37]"
                        style={{ width: `${Math.max(2, (Number(l.allocatedAmount) / maxAlloc) * 100)}%` }}
                      />
                    </div>
                    <div className="text-right text-[12px] font-semibold tabular-nums">{money(l.allocatedAmount, lastRun[0].currency)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState message="No waterfall run recorded for this tenant." />
          )}
        </Panel>
        )}

        {caps.dashboard && (
        <Panel kicker="Strategy" title="Objectives & execution">
          <div className="space-y-3">
            {objectives.map((o) => {
              const target = Number(o.targetValue ?? 0);
              const current = Number(o.currentValue ?? 0);
              const pct = target ? Math.min(100, Math.round((current / target) * 100)) : 0;
              return (
                <div key={o.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-medium">{o.code} · {o.title}</span>
                    <Badge tone={stateTone(o.status)}>{o.status}</Badge>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-[color:var(--beyu-line)]">
                    <div className="h-2 rounded-full bg-[#4c6f4e]" style={{ width: `${Math.max(3, pct)}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] beyu-muted">
                    {current.toLocaleString()} / {target.toLocaleString()} {o.unit}
                  </div>
                </div>
              );
            })}
            {objectives.length === 0 && <EmptyState message="No strategic objectives registered." />}
          </div>
        </Panel>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {caps.governance && (
        <Panel kicker="Governance" title="Recent decisions" action={<Link href="/os/governance" className="text-[11.5px] font-semibold text-[#b08d1c]">All →</Link>}>
          <div className="space-y-3">
            {pendingResolutions.map((r) => (
              <div key={r.id} className="border-b border-[color:var(--beyu-line)] pb-2 last:border-none last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold">{r.reference}</span>
                  <Badge tone={stateTone(r.status)}>{r.status}</Badge>
                </div>
                <div className="mt-0.5 text-[12px]">{r.title}</div>
                <div className="mt-1 text-[11px] beyu-muted">
                  quorum {r.quorumMet ? "met" : "not met"} · {r.votesFor}/{r.votesAgainst}/{r.votesAbstain} · {r.category}
                </div>
              </div>
            ))}
            {pendingResolutions.length === 0 && <EmptyState message="No resolutions visible at your clearance." />}
          </div>
        </Panel>
        )}

        {caps.risk && (
        <Panel kicker="Risk" title="Above appetite" action={<Link href="/os/assurance" className="text-[11.5px] font-semibold text-[#b08d1c]">Register →</Link>}>
          <div className="space-y-3">
            {breaches.map((r) => (
              <div key={r.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold">{r.code}</span>
                  <Badge tone="red">{r.residualLikelihood * r.residualImpact} / appetite {r.appetiteThreshold}</Badge>
                </div>
                <div className="mt-0.5 text-[12px]">{r.title}</div>
                <div className="mt-0.5 text-[11px] beyu-muted">{r.category} · {r.treatment}</div>
              </div>
            ))}
            {breaches.length === 0 && <EmptyState message="All residual risk scores are within appetite." />}
          </div>
        </Panel>
        )}

        {caps.dashboard && (
        <Panel kicker="Operations" title="Pending approvals & tasks">
          <div className="space-y-3">
            {openTasks.map((t) => (
              <div key={t.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium">{t.title}</span>
                  <Badge tone={t.priority === "HIGH" ? "red" : "slate"}>{t.priority}</Badge>
                </div>
                <div className="mt-0.5 text-[11px] beyu-muted">
                  {t.assigneeRole} · due {t.dueAt ? new Date(t.dueAt).toISOString().slice(0, 10) : "—"} · {t.status}
                </div>
              </div>
            ))}
            {openTasks.length === 0 && <EmptyState message="No open tasks." />}
          </div>
        </Panel>
        )}
      </div>

      {caps.dashboard && (
      <Panel kicker="Sector OSs" title="Operational performance (governed, non-authoritative snapshots)">
        <div className="grid gap-3 sm:grid-cols-3">
          {sectorRows.map((sm) => (
            <div key={sm.id} className="rounded-lg border border-[color:var(--beyu-line)] px-4 py-3">
              <div className="beyu-kicker beyu-muted">{sm.sectorCode} OS</div>
              <div className="mt-1 text-[18px] font-semibold">{money(sm.value, "USD")}</div>
              <div className="mt-0.5 text-[11px] beyu-muted">source: {sm.sourceSystem} · period {sm.period}</div>
            </div>
          ))}
          {sectorRows.length === 0 && <EmptyState message="No sector metrics ingested." />}
        </div>
      </Panel>
      )}
    </div>
  );  });
}
