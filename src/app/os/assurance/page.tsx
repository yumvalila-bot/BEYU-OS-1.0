import { and, inArray } from "drizzle-orm";
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
import { Badge, Denied, EmptyState, Metric, Panel, money, stateTone } from "@/components/brand";
import { can } from "@/lib/authz";
import { classificationsAtOrBelow } from "@/lib/constants";
import { requirePrincipal } from "@/lib/guard";
import { hasGlobalGovernanceScope, tenantScopeIds, withTenantDatabaseContext } from "@/lib/tenant-scope";

export const dynamic = "force-dynamic";

const HEAT = (score: number, appetite: number) =>
  score > appetite ? "red" : score > appetite * 0.7 ? "amber" : "green";

/**
 * Combined Risk & Compliance surface with strict section partitioning.
 * Holding one read grant never permits the other domain to be queried. Legal is
 * an optional third section under its own permission. The focused /risk,
 * /compliance and /legal routes remain available and independently guarded.
 */
export default async function AssurancePage() {
  const principal = await requirePrincipal();
  const canRisk = can(principal, "risk:register.read").allowed;
  const canCompliance = can(principal, "compliance:obligation.read").allowed;
  const canLegal = can(principal, "legal:matter.read").allowed;

  if (!canRisk && !canCompliance) {
    return (
      <Denied
        reason="Neither enterprise-risk nor compliance-obligation read access is active for this principal."
        capability="risk:register.read OR compliance:obligation.read"
      />
    );
  }

  return withTenantDatabaseContext(principal, async () => {
    const scope = await tenantScopeIds(principal);
    const entityScoped = principal.entityScope.length > 0;
    const globalGovernanceScope = hasGlobalGovernanceScope(principal);
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);
    const riskPredicate = entityScoped
      ? and(
          inArray(risks.tenantId, scope),
          inArray(risks.legalEntityId, principal.entityScope),
          inArray(risks.classification, allowedClassifications),
        )
      : and(
          inArray(risks.tenantId, scope),
          inArray(risks.classification, allowedClassifications),
        );
    const obligationPredicate = entityScoped
      ? and(
          inArray(complianceObligations.tenantId, scope),
          inArray(complianceObligations.legalEntityId, principal.entityScope),
        )
      : inArray(complianceObligations.tenantId, scope);
    const legalPredicate = entityScoped
      ? and(
          inArray(legalMatters.tenantId, scope),
          inArray(legalMatters.legalEntityId, principal.entityScope),
          inArray(legalMatters.classification, allowedClassifications),
        )
      : and(
          inArray(legalMatters.tenantId, scope),
          inArray(legalMatters.classification, allowedClassifications),
        );

    const riskRows = canRisk ? await db.select().from(risks).where(riskPredicate) : [];
    const riskIds = riskRows.map((risk) => risk.id);
    const controlRows = canRisk
      ? entityScoped
        ? riskIds.length > 0
          ? await db
              .select()
              .from(controls)
              .where(and(inArray(controls.tenantId, scope), inArray(controls.riskId, riskIds)))
          : []
        : await db.select().from(controls).where(inArray(controls.tenantId, scope))
      : [];
    const obligationRows = canCompliance
      ? await db.select().from(complianceObligations).where(obligationPredicate)
      : [];
    const obligationIds = obligationRows.map((obligation) => obligation.id);
    const assessmentRows =
      canCompliance && obligationIds.length > 0
        ? await db
            .select()
            .from(complianceAssessments)
            .where(
              and(
                inArray(complianceAssessments.tenantId, scope),
                inArray(complianceAssessments.obligationId, obligationIds),
              ),
            )
        : [];
    const legalRows = canLegal ? await db.select().from(legalMatters).where(legalPredicate) : [];
    // Anomaly signals and continuity plans have no legal-entity key. An
    // entity-limited principal cannot prove containment, so these reads fail
    // closed rather than falling back to tenant-wide visibility.
    const anomalyRows =
      canRisk && !entityScoped
        ? await db.select().from(anomalySignals).where(inArray(anomalySignals.tenantId, scope))
        : [];
    const bcpRows =
      canRisk && !entityScoped && globalGovernanceScope
        ? await db.select().from(continuityPlans)
        : [];

    const visibleRisks = riskRows;
    const visibleLegal = legalRows;
    const breaches = visibleRisks.filter(
      (risk) => risk.residualLikelihood * risk.residualImpact > risk.appetiteThreshold,
    );
    const stateCount = (state: string) =>
      assessmentRows.filter((assessment) => assessment.state === state).length;

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Shared capability · risk &amp; compliance</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Risk, compliance and enterprise assurance</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            One risk engine, one control library and one compliance engine. Every section is independently
            permission-gated; compliance states are explicit, evidence-bearing and never presented as a
            fabricated certification.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Risks in register"
            value={canRisk ? String(visibleRisks.length) : "Restricted"}
            sub={canRisk ? `${breaches.length} above appetite` : "risk:register.read not granted"}
          />
          <Metric
            label="Controls"
            value={canRisk ? String(controlRows.length) : "Restricted"}
            sub={canRisk ? `${controlRows.filter((control) => control.effectiveness === "EFFECTIVE").length} effective` : "not queried"}
          />
          <Metric
            label="Compliance obligations"
            value={canCompliance ? String(obligationRows.length) : "Restricted"}
            sub={canCompliance ? `${new Set(obligationRows.map((obligation) => obligation.framework)).size} frameworks` : "compliance:obligation.read not granted"}
          />
          <Metric
            label="Open anomaly signals"
            value={canRisk && !entityScoped ? String(anomalyRows.filter((signal) => signal.status === "OPEN").length) : "Restricted"}
            sub={entityScoped ? "no entity key; tenant-wide read refused" : canRisk ? "evidence and confidence attached" : "not queried"}
            tone="gold"
          />
        </div>

        <Panel kicker="Enterprise risk register" title="Identification → assessment → treatment → monitoring">
          {canRisk ? (
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr><th>Code</th><th>Risk</th><th>Category</th><th>Inherent</th><th>Residual</th><th>Appetite</th><th>Treatment</th><th>Status</th><th>Next review</th></tr>
                </thead>
                <tbody>
                  {visibleRisks.map((risk) => {
                    const inherent = risk.inherentLikelihood * risk.inherentImpact;
                    const residual = risk.residualLikelihood * risk.residualImpact;
                    return (
                      <tr key={risk.id}>
                        <td className="font-mono text-[11.5px]">{risk.code}</td>
                        <td>
                          <div className="font-medium">{risk.title}</div>
                          <div className="max-w-md text-[11.5px] beyu-muted">{risk.description}</div>
                          {risk.mitigationPlan && <div className="mt-1 max-w-md text-[11px] beyu-muted">Mitigation: {risk.mitigationPlan}</div>}
                        </td>
                        <td><Badge tone="navy">{risk.category}</Badge></td>
                        <td className="tabular-nums">{inherent}</td>
                        <td><Badge tone={HEAT(residual, risk.appetiteThreshold)}>{residual}</Badge></td>
                        <td className="tabular-nums">{risk.appetiteThreshold}</td>
                        <td className="text-[11.5px]">{risk.treatment}</td>
                        <td><Badge tone={stateTone(risk.status)}>{risk.status}</Badge></td>
                        <td className="text-[11.5px] beyu-muted">{risk.nextReviewAt ?? "—"}</td>
                      </tr>
                    );
                  })}
                  {visibleRisks.length === 0 && (
                    <tr><td colSpan={9}><EmptyState message="No risks exist in your governed entity and clearance scope." /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="risk:register.read is not granted; risk and control records were not queried." />
          )}
        </Panel>

        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel kicker="Compliance engine" title="Obligations, assessments, evidence & remediation">
            {canCompliance ? (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  {["COMPLIANT", "PARTIALLY_COMPLIANT", "NON_COMPLIANT", "NOT_ASSESSED", "REQUIRES_HUMAN_REVIEW"].map((state) => (
                    <Badge key={state} tone={stateTone(state)}>{state}: {stateCount(state)}</Badge>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="beyu-table">
                    <thead><tr><th>Framework</th><th>Obligation</th><th>Jurisdiction</th><th>Due</th><th>State</th><th>Evidence</th><th>Remediation</th></tr></thead>
                    <tbody>
                      {obligationRows.map((obligation) => {
                        const assessment = assessmentRows.find((row) => row.obligationId === obligation.id);
                        return (
                          <tr key={obligation.id}>
                            <td><Badge tone="navy">{obligation.framework}</Badge></td>
                            <td><div className="font-medium">{obligation.title}</div><div className="font-mono text-[10.5px] beyu-muted">{obligation.reference}</div></td>
                            <td className="text-[11.5px]">{obligation.jurisdictionCode}</td>
                            <td className="text-[11.5px] beyu-muted">{obligation.nextDueAt ?? "—"}</td>
                            <td>
                              <Badge tone={stateTone(assessment?.state ?? "NOT_ASSESSED")}>{assessment?.state ?? "NOT_ASSESSED"}</Badge>
                              {assessment?.aiAssisted && <div className="mt-1 text-[10px] beyu-muted">AI-assisted · human {assessment.humanConfirmed ? "confirmed" : "pending"}</div>}
                            </td>
                            <td className="font-mono text-[10.5px] beyu-muted">{assessment?.evidenceDocumentId ?? "not recorded"}</td>
                            <td className="max-w-xs text-[11.5px] beyu-muted">{assessment?.remediationPlan ?? "—"}{assessment?.remediationDueAt ? ` (due ${assessment.remediationDueAt})` : ""}</td>
                          </tr>
                        );
                      })}
                      {obligationRows.length === 0 && (
                        <tr><td colSpan={7}><EmptyState message="No compliance obligations exist in your governed entity scope." /></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <EmptyState message="compliance:obligation.read is not granted; obligations and assessments were not queried." />
            )}
          </Panel>

          <div className="space-y-5">
            <Panel kicker="Control library" title="Preventive · detective · corrective">
              {canRisk ? (
                <div className="space-y-2">
                  {controlRows.map((control) => (
                    <div key={control.id} className="flex items-start justify-between gap-3 border-b border-[color:var(--beyu-line)] pb-2 last:border-none">
                      <div>
                        <div className="text-[12px] font-medium">{control.title}</div>
                        <div className="text-[11px] beyu-muted">{control.code} · {control.controlType} · {control.automation} · {control.frameworks.join(", ")}</div>
                      </div>
                      <Badge tone={stateTone(control.effectiveness)}>{control.effectiveness}</Badge>
                    </div>
                  ))}
                  {controlRows.length === 0 && <EmptyState message="No controls map to risks in your scope." />}
                </div>
              ) : (
                <EmptyState message="Risk permission is required for the control library." />
              )}
            </Panel>

            <Panel kicker="Fraud & anomaly intelligence" title="Signals with evidence and confidence">
              {canRisk && !entityScoped ? (
                <div className="space-y-2">
                  {anomalyRows.map((signal) => (
                    <div key={signal.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium">{signal.signalType}</span>
                        <Badge tone={signal.severity === "HIGH" ? "red" : "amber"}>{signal.severity} · {(Number(signal.confidence) * 100).toFixed(0)}%</Badge>
                      </div>
                      <div className="mt-1 text-[11px] beyu-muted">{signal.detector} · {signal.subjectType} {signal.subjectId} · owner {signal.assignedRole}</div>
                      <pre className="mt-1 overflow-x-auto rounded bg-[color:var(--beyu-line)]/40 px-2 py-1 text-[10.5px]">{JSON.stringify(signal.evidence)}</pre>
                    </div>
                  ))}
                  {anomalyRows.length === 0 && <EmptyState message="No anomaly signals exist in scope." />}
                </div>
              ) : (
                <EmptyState message={entityScoped ? "Signals have no entity key, so tenant-wide visibility is refused for this entity-scoped grant." : "Risk permission is required for anomaly signals."} />
              )}
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
                    {visibleLegal.map((matter) => (
                      <tr key={matter.id}>
                        <td><div className="font-medium">{matter.title}</div><div className="max-w-md text-[11px] beyu-muted">{matter.obligationSummary}</div></td>
                        <td><Badge tone="navy">{matter.matterType}</Badge></td>
                        <td className="text-[11.5px]">{matter.counterparty ?? "—"}</td>
                        <td className="tabular-nums text-[11.5px]">{matter.exposureAmount ? money(matter.exposureAmount, matter.currency) : "—"}</td>
                        <td className="text-[11.5px] beyu-muted">{matter.keyDeadline ?? "—"}</td>
                        <td><Badge tone={stateTone(matter.status)}>{matter.status}</Badge></td>
                      </tr>
                    ))}
                    {visibleLegal.length === 0 && (
                      <tr><td colSpan={6}><EmptyState message="No legal matters exist within your entity and clearance scope." /></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="legal:matter.read is not granted; legal matters were not queried." />
            )}
            <p className="mt-3 text-[11px] beyu-muted">
              No AI-generated legal conclusion is binding without authorised human legal governance.
            </p>
          </Panel>

          <Panel kicker="Continuity & disaster recovery" title="RPO / RTO objectives and test evidence">
            {canRisk && !entityScoped && globalGovernanceScope ? (
              <div className="overflow-x-auto">
                <table className="beyu-table">
                  <thead><tr><th>Plan</th><th>Scenario</th><th>RPO</th><th>RTO</th><th>Last test</th><th>Next due</th></tr></thead>
                  <tbody>
                    {bcpRows.map((plan) => (
                      <tr key={plan.id}>
                        <td><div className="font-medium">{plan.code}</div><div className="text-[11px] beyu-muted">{plan.scope}</div></td>
                        <td className="text-[11.5px]">{plan.scenario}<div className="beyu-muted">{plan.strategy}</div></td>
                        <td className="tabular-nums text-[11.5px]">{plan.rpoMinutes}m</td>
                        <td className="tabular-nums text-[11.5px]">{plan.rtoMinutes}m</td>
                        <td className="text-[11.5px]">{plan.lastTestedAt}<div className="beyu-muted">{plan.lastTestOutcome}</div></td>
                        <td className="text-[11.5px] beyu-muted">{plan.nextTestDue}</td>
                      </tr>
                    ))}
                    {bcpRows.length === 0 && (
                      <tr><td colSpan={6}><EmptyState message="No continuity plans are registered." /></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                message={
                  entityScoped
                    ? "Continuity plans have no entity key, so this entity-scoped grant cannot read the global register."
                    : !globalGovernanceScope
                      ? "The global continuity register requires global governance scope."
                      : "Risk permission is required for continuity plans."
                }
              />
            )}
            <p className="mt-3 text-[11px] beyu-muted">
              A backup that has never been restored successfully is not treated as reliable.
            </p>
          </Panel>
        </div>
      </div>
    );
  });
}
