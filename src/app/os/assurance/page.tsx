import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  anomalySignals,
  complianceAssessments,
  complianceObligations,
  continuityPlans,
  controls,
  legalMatters,
  risks,
} from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { can } from "@/lib/authz";
import { Badge, Denied, EmptyState, Metric, Panel, money, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

const HEAT = (score: number, appetite: number) =>
  score > appetite ? "red" : score > appetite * 0.7 ? "amber" : "green";

export default async function AssurancePage() {
  const access = await requireAccess("risk:register.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="risk:register.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
  const scope = await tenantScopeIds(access.principal); const tenantId = access.principal.tenantId;

  const [riskRows, controlRows, obligationRows, assessmentRows, legalRows, anomalyRows, bcpRows] = await Promise.all([
    db.select().from(risks).where(inArray(risks.tenantId, scope)),
    db.select().from(controls).where(inArray(controls.tenantId, scope)),
    db.select().from(complianceObligations).where(inArray(complianceObligations.tenantId, scope)),
    db.select().from(complianceAssessments).where(inArray(complianceAssessments.tenantId, scope)),
    db.select().from(legalMatters).where(inArray(legalMatters.tenantId, scope)),
    db.select().from(anomalySignals).where(inArray(anomalySignals.tenantId, scope)),
    db.select().from(continuityPlans),
  ]);

  const canLegal = can(access.principal, "legal:matter.read").allowed;
  const visibleRisks = riskRows.filter((r) => {
    const rank = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"];
    return rank.indexOf(r.classification) <= rank.indexOf(access.principal.clearance);
  });
  const breaches = visibleRisks.filter((r) => r.residualLikelihood * r.residualImpact > r.appetiteThreshold);
  const stateCount = (s: string) => assessmentRows.filter((a) => a.state === s).length;

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Risk · compliance · legal</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Enterprise assurance</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          One risk engine, one control library, one compliance engine. Compliance states are explicit —
          the system never infers compliance and never claims certification.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Risks in register" value={String(visibleRisks.length)} sub={`${breaches.length} above appetite`} />
        <Metric label="Controls" value={String(controlRows.length)} sub={`${controlRows.filter((c) => c.effectiveness === "EFFECTIVE").length} effective`} />
        <Metric label="Obligations" value={String(obligationRows.length)} sub={`${new Set(obligationRows.map((o) => o.framework)).size} frameworks`} />
        <Metric label="Open anomaly signals" value={String(anomalyRows.filter((a) => a.status === "OPEN").length)} sub="evidence + confidence attached" tone="gold" />
      </div>

      <Panel kicker="Enterprise risk register" title="Identification → assessment → treatment → monitoring">
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
                    <td><div className="font-medium">{r.title}</div><div className="max-w-md text-[11.5px] beyu-muted">{r.description}</div>
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
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel kicker="Compliance engine" title="Obligations, assessments & remediation">
          <div className="mb-3 flex flex-wrap gap-2">
            {["COMPLIANT", "PARTIALLY_COMPLIANT", "NON_COMPLIANT", "NOT_ASSESSED", "REQUIRES_HUMAN_REVIEW"].map((s) => (
              <Badge key={s} tone={stateTone(s)}>{s}: {stateCount(s)}</Badge>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Framework</th><th>Obligation</th><th>Jurisdiction</th><th>Due</th><th>State</th><th>Remediation</th></tr></thead>
              <tbody>
                {obligationRows.map((o) => {
                  const a = assessmentRows.find((x) => x.obligationId === o.id);
                  return (
                    <tr key={o.id}>
                      <td><Badge tone="navy">{o.framework}</Badge></td>
                      <td><div className="font-medium">{o.title}</div><div className="font-mono text-[10.5px] beyu-muted">{o.reference}</div></td>
                      <td className="text-[11.5px]">{o.jurisdictionCode}</td>
                      <td className="text-[11.5px] beyu-muted">{o.nextDueAt ?? "—"}</td>
                      <td><Badge tone={stateTone(a?.state ?? "NOT_ASSESSED")}>{a?.state ?? "NOT_ASSESSED"}</Badge>
                        {a?.aiAssisted && <div className="mt-1 text-[10px] beyu-muted">AI-assisted · human {a.humanConfirmed ? "confirmed" : "pending"}</div>}
                      </td>
                      <td className="max-w-xs text-[11.5px] beyu-muted">{a?.remediationPlan ?? "—"}{a?.remediationDueAt ? ` (due ${a.remediationDueAt})` : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel kicker="Control library" title="Preventive · detective · corrective">
            <div className="space-y-2">
              {controlRows.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3 border-b border-[color:var(--beyu-line)] pb-2 last:border-none">
                  <div>
                    <div className="text-[12px] font-medium">{c.title}</div>
                    <div className="text-[11px] beyu-muted">{c.code} · {c.controlType} · {c.automation} · {c.frameworks.join(", ")}</div>
                  </div>
                  <Badge tone={stateTone(c.effectiveness)}>{c.effectiveness}</Badge>
                </div>
              ))}
            </div>
          </Panel>

          <Panel kicker="Fraud & anomaly intelligence" title="Signals with evidence and confidence">
            <div className="space-y-2">
              {anomalyRows.map((a) => (
                <div key={a.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium">{a.signalType}</span>
                    <Badge tone={a.severity === "HIGH" ? "red" : "amber"}>{a.severity} · {(Number(a.confidence) * 100).toFixed(0)}%</Badge>
                  </div>
                  <div className="mt-1 text-[11px] beyu-muted">{a.detector} · {a.subjectType} {a.subjectId} · owner {a.assignedRole}</div>
                  <pre className="mt-1 overflow-x-auto rounded bg-[color:var(--beyu-line)]/40 px-2 py-1 text-[10.5px]">{JSON.stringify(a.evidence)}</pre>
                </div>
              ))}
              {anomalyRows.length === 0 && <EmptyState message="No anomaly signals." />}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel kicker="Legal & liability" title="Matters, obligations and exposure">
          {canLegal ? (
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Matter</th><th>Type</th><th>Counterparty</th><th>Exposure</th><th>Deadline</th><th>Status</th></tr></thead>
                <tbody>
                  {legalRows.map((l) => (
                    <tr key={l.id}>
                      <td><div className="font-medium">{l.title}</div><div className="max-w-md text-[11px] beyu-muted">{l.obligationSummary}</div></td>
                      <td><Badge tone="navy">{l.matterType}</Badge></td>
                      <td className="text-[11.5px]">{l.counterparty ?? "—"}</td>
                      <td className="tabular-nums text-[11.5px]">{l.exposureAmount ? money(l.exposureAmount, l.currency) : "—"}</td>
                      <td className="text-[11.5px] beyu-muted">{l.keyDeadline ?? "—"}</td>
                      <td><Badge tone={stateTone(l.status)}>{l.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="legal:matter.read is not granted to your roles." />
          )}
          <p className="mt-3 text-[11px] beyu-muted">
            No AI-generated legal conclusion is binding without authorised human legal governance.
          </p>
        </Panel>

        <Panel kicker="Continuity & disaster recovery" title="RPO / RTO objectives and test evidence">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Plan</th><th>Scenario</th><th>RPO</th><th>RTO</th><th>Last test</th><th>Next due</th></tr></thead>
              <tbody>
                {bcpRows.map((b) => (
                  <tr key={b.id}>
                    <td><div className="font-medium">{b.code}</div><div className="text-[11px] beyu-muted">{b.scope}</div></td>
                    <td className="text-[11.5px]">{b.scenario}<div className="beyu-muted">{b.strategy}</div></td>
                    <td className="tabular-nums text-[11.5px]">{b.rpoMinutes}m</td>
                    <td className="tabular-nums text-[11.5px]">{b.rtoMinutes}m</td>
                    <td className="text-[11.5px]">{b.lastTestedAt}<div className="beyu-muted">{b.lastTestOutcome}</div></td>
                    <td className="text-[11.5px] beyu-muted">{b.nextTestDue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] beyu-muted">
            A backup that has never been restored successfully is not treated as reliable.
          </p>
        </Panel>
      </div>
    </div>
  );  });
}
