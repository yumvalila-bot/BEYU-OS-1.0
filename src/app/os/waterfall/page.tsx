import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  governanceBodies,
  legalEntities,
  resolutions,
  waterfallConfigs,
  waterfallRunLines,
  waterfallRuns,
  waterfallTiers,
} from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { can } from "@/lib/authz";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Panel, money, stateTone } from "@/components/brand";
import { WaterfallWorkbench } from "./workbench";

export const dynamic = "force-dynamic";

export default async function WaterfallPage() {
  const access = await requireAccess("finance:waterfall.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="finance:waterfall.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
  const scope = await tenantScopeIds(access.principal);
  const entityScoped = access.principal.entityScope.length > 0;
  const allowedClassifications = classificationsAtOrBelow(access.principal.clearance);
  const entities = await db
    .select()
    .from(legalEntities)
    .where(
      entityScoped
        ? and(
            inArray(legalEntities.tenantId, scope),
            inArray(legalEntities.id, access.principal.entityScope),
            inArray(legalEntities.classification, allowedClassifications),
          )
        : and(
            inArray(legalEntities.tenantId, scope),
            inArray(legalEntities.classification, allowedClassifications),
          ),
    );
  const entityIds = entities.map((entity) => entity.id);
  // Waterfall configurations have no independent classification field; the
  // referenced legal entity is therefore the mandatory clearance boundary.
  const configs = await db
    .select()
    .from(waterfallConfigs)
    .where(
      and(
        inArray(waterfallConfigs.tenantId, scope),
        inArray(waterfallConfigs.legalEntityId, entityIds),
      ),
    );
  const configIds = configs.map((config) => config.id);
  const [tiers, runs, bodyRows] = await Promise.all([
    configIds.length > 0
      ? db
          .select()
          .from(waterfallTiers)
          .where(inArray(waterfallTiers.configId, configIds))
          .orderBy(waterfallTiers.sequence)
      : Promise.resolve([]),
    configIds.length > 0
      ? db
          .select()
          .from(waterfallRuns)
          .where(
            and(
              inArray(waterfallRuns.tenantId, scope),
              inArray(waterfallRuns.configId, configIds),
            ),
          )
          .orderBy(desc(waterfallRuns.executedAt))
          .limit(10)
      : Promise.resolve([]),
    db
      .select({ id: governanceBodies.id })
      .from(governanceBodies)
      .where(
        entityScoped
          ? and(
              inArray(governanceBodies.tenantId, scope),
              inArray(governanceBodies.legalEntityId, access.principal.entityScope),
            )
          : inArray(governanceBodies.tenantId, scope),
      ),
  ]);
  const lines = runs[0]
    ? await db
        .select()
        .from(waterfallRunLines)
        .where(eq(waterfallRunLines.runId, runs[0].id))
        .orderBy(waterfallRunLines.sequence)
    : [];
  const resolutionIds = configs.flatMap((config) =>
    config.approvedByResolutionId ? [config.approvedByResolutionId] : [],
  );
  const bodyIds = bodyRows.map((body) => body.id);
  const resolutionRows =
    resolutionIds.length > 0 && bodyIds.length > 0
      ? await db
          .select()
          .from(resolutions)
          .where(
            and(
              inArray(resolutions.tenantId, scope),
              inArray(resolutions.id, resolutionIds),
              inArray(resolutions.bodyId, bodyIds),
              inArray(resolutions.classification, allowedClassifications),
            ),
          )
      : [];

  const canSimulate = can(access.principal, "finance:waterfall.simulate").allowed;
  const canCommit = can(access.principal, "finance:waterfall.commit").allowed;

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Finance OS · waterfall cashflow engine</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Configurable, explainable distribution waterfall</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          Revenue → taxes → operating costs → debt service → reserves → required distributions → capital
          allocation → investments → reinvestment → owner / beneficiary distributions. Every calculation is
          deterministic, checksum-stamped, explainable and auditable.
        </p>
      </header>

      {configs.map((c) => {
        const configTiers = tiers.filter((t) => t.configId === c.id);
        const approval = resolutionRows.find((r) => r.id === c.approvedByResolutionId);
        return (
          <Panel
            key={c.id}
            kicker={`${c.code} · v${c.version}`}
            title={c.name}
            action={
              <div className="flex items-center gap-2">
                <Badge tone={stateTone(c.status)}>{c.status}</Badge>
                <Badge tone="navy">{c.jurisdictionCode}</Badge>
              </div>
            }
          >
            <div className="flex flex-wrap items-center gap-3 text-[11.5px] beyu-muted">
              <span>entity {entities.find((e) => e.id === c.legalEntityId)?.legalName}</span>
              <span>· {c.transactionType}</span>
              <span>· effective {c.effectiveFrom}</span>
              <span>· approved by {approval ? `${approval.reference} (${approval.status})` : "no resolution"}</span>
            </div>
            {c.notes && <p className="mt-2 text-[12px]">{c.notes}</p>}

            <div className="mt-4 overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>#</th><th>Tier</th><th>Type</th><th>Rate / amount</th><th>Beneficiary</th><th>Legal basis</th><th>Mandatory</th></tr></thead>
                <tbody>
                  {configTiers.map((t) => (
                    <tr key={t.id}>
                      <td className="tabular-nums">{t.sequence}</td>
                      <td className="font-medium">{t.name}<div className="font-mono text-[10.5px] beyu-muted">{t.code}</div></td>
                      <td className="text-[11.5px]">{t.tierType}</td>
                      <td className="tabular-nums text-[11.5px]">
                        {t.rate ? `${(Number(t.rate) * 100).toFixed(2)}%` : t.fixedAmount ? money(t.fixedAmount, c.currency) : t.minAmount ? `floor ${money(t.minAmount, c.currency)}` : "residual"}
                      </td>
                      <td><Badge tone="navy">{t.beneficiaryType}</Badge></td>
                      <td className="max-w-sm text-[11px] beyu-muted">{t.legalBasis ?? "—"}</td>
                      <td>{t.mandatory ? <Badge tone="gold">MANDATORY</Badge> : <span className="text-[11px] beyu-muted">discretionary</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5">
              <WaterfallWorkbench
                configId={c.id}
                currency={c.currency}
                canSimulate={canSimulate}
                canCommit={canCommit}
                tiers={configTiers.map((t) => ({ code: t.code, name: t.name, rate: t.rate ? Number(t.rate) : null }))}
              />
            </div>
          </Panel>
        );
      })}

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel kicker="Run history" title="Executed & simulated runs">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Period</th><th>Gross</th><th>Allocated</th><th>Residual</th><th>Status</th><th>Checksum</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.period}<div className="text-[11px] beyu-muted">{r.scenario} · {r.executedBy}</div></td>
                    <td className="tabular-nums">{money(r.grossAmount, r.currency)}</td>
                    <td className="tabular-nums">{money(r.totalAllocated, r.currency)}</td>
                    <td className="tabular-nums">{money(r.residual, r.currency)}</td>
                    <td><Badge tone={stateTone(r.status)}>{r.status}</Badge></td>
                    <td className="font-mono text-[10.5px] beyu-muted">{r.checksum.slice(0, 16)}…</td>
                  </tr>
                ))}
                {runs.length === 0 && <tr><td colSpan={6}><EmptyState message="No runs recorded." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Explainability" title={runs[0] ? `Committed allocation — ${runs[0].period}` : "Explainability"}>
          {runs[0] ? (
            <>
              <div className="overflow-x-auto">
                <table className="beyu-table">
                  <thead><tr><th>#</th><th>Tier</th><th>Basis</th><th>Allocated</th><th>Remaining</th><th>Formula</th></tr></thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id}>
                        <td className="tabular-nums">{l.sequence}</td>
                        <td className="font-medium">{l.tierName}</td>
                        <td className="tabular-nums text-[11.5px]">{money(l.basisAmount, runs[0].currency)}</td>
                        <td className="tabular-nums font-semibold">{money(l.allocatedAmount, runs[0].currency)}</td>
                        <td className="tabular-nums text-[11.5px]">{money(l.remainingAfter, runs[0].currency)}</td>
                        <td className="max-w-xs text-[11px] beyu-muted">{l.formula}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                <div className="beyu-kicker beyu-muted">Engine narrative</div>
                <ul className="mt-1 space-y-1 text-[11.5px]">
                  {(runs[0].explanation ?? []).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <EmptyState message="No committed run to explain." />
          )}
        </Panel>
      </div>
    </div>
  );  });
}
