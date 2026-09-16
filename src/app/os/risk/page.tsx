import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { controls, risks } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { classificationRank } from "@/lib/constants";
import Link from "next/link";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

const HEAT = (score: number, appetite: number) =>
  score > appetite ? "red" : score > appetite * 0.7 ? "amber" : "green";

/**
 * Risk — the enterprise risk engine as a first-class shared capability.
 *
 * The register and control library already exist (assurance.risks /
 * assurance.controls) and are also summarised on the Assurance overview. This
 * focused surface presents the risk domain itself under its canonical
 * capability (risk:register.read) with the same tenant scope and clearance
 * ceiling the assurance surface applies — nothing here widens who can read
 * what.
 */
export default async function RiskPage() {
  const access = await requireAccess("risk:register.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="risk:register.read" />;
  return withTenantDatabaseContext(access.principal, async () => {

    const scope = await tenantScopeIds(access.principal);
    const [riskRows, controlRows] = await Promise.all([
      db.select().from(risks).where(inArray(risks.tenantId, scope)),
      db.select().from(controls).where(inArray(controls.tenantId, scope)),
    ]);

    const visibleRisks = riskRows.filter(
      (r) => classificationRank(r.classification) <= classificationRank(access.principal.clearance),
    );
    const breaches = visibleRisks.filter((r) => r.residualLikelihood * r.residualImpact > r.appetiteThreshold);
    const suppressed = riskRows.length - visibleRisks.length;
    const byCategory = new Map<string, number>();
    for (const r of visibleRisks) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Risk · shared capability</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Enterprise risk register</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Identification → assessment → treatment → monitoring. Residual scores are measured against
            the approved appetite; a breach is an engineering signal for human governance, never an
            automated decision.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Risks in register" value={String(visibleRisks.length)} sub={suppressed > 0 ? `${suppressed} suppressed above your clearance` : "in your clearance"} />
          <Metric label="Above appetite" value={String(breaches.length)} sub="residual score over threshold" tone={breaches.length > 0 ? "gold" : "navy"} />
          <Metric label="Controls" value={String(controlRows.length)} sub={`${controlRows.filter((c) => c.effectiveness === "EFFECTIVE").length} assessed effective`} />
          <Metric label="Categories" value={String(byCategory.size)} sub={[...byCategory.entries()].slice(0, 3).map(([c, n]) => `${c}:${n}`).join(" · ") || "—"} />
        </div>

        <Panel kicker="Risk register" title="Inherent vs residual — appetite-gated">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr><th>Code</th><th>Risk</th><th>Category</th><th>Inherent</th><th>Residual</th><th>Appetite</th><th>Treatment</th><th>Status</th><th>Next review</th></tr>
              </thead>
              <tbody>
                {visibleRisks.map((r) => {
                  const inherent = r.inherentLikelihood * r.inherentImpact;
                  const residual = r.residualLikelihood * r.residualImpact;
                  return (
                    <tr key={r.id}>
                      <td className="font-mono text-[11.5px]">{r.code}</td>
                      <td>
                        <div className="font-medium">{r.title}</div>
                        <div className="max-w-md text-[11.5px] beyu-muted">{r.description}</div>
                        {r.mitigationPlan && <div className="mt-1 max-w-md text-[11px] beyu-muted">Mitigation: {r.mitigationPlan}</div>}
                      </td>
                      <td><Badge tone="navy">{r.category}</Badge></td>
                      <td className="tabular-nums">{inherent}</td>
                      <td><Badge tone={HEAT(residual, r.appetiteThreshold)}>{residual}</Badge></td>
                      <td className="tabular-nums">{r.appetiteThreshold}</td>
                      <td className="text-[11.5px]">{r.treatment}</td>
                      <td><Badge tone={stateTone(r.status)}>{r.status}</Badge></td>
                      <td className="text-[11.5px] beyu-muted">{r.nextReviewAt ?? "—"}</td>
                    </tr>
                  );
                })}
                {visibleRisks.length === 0 && <tr><td colSpan={9}><EmptyState message="No risks visible at your clearance level." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Control library" title="Preventive · detective · corrective">
          <div className="grid gap-2 lg:grid-cols-2">
            {controlRows.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-3 rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                <div>
                  <div className="text-[12px] font-medium">{c.title}</div>
                  <div className="text-[11px] beyu-muted">{c.code} · {c.controlType} · {c.automation} · {c.frameworks.join(", ")}</div>
                </div>
                <Badge tone={stateTone(c.effectiveness)}>{c.effectiveness}</Badge>
              </div>
            ))}
          </div>
          {controlRows.length === 0 && <EmptyState message="No controls recorded in your scope." />}
          <p className="mt-3 text-[11.5px] beyu-muted">
            Anomaly intelligence and continuity/DR evidence sit in the{" "}
            <Link href="/os/assurance" className="font-semibold text-[#b08d1c]">Assurance overview</Link>.
          </p>
        </Panel>
      </div>
    );
  });
}
