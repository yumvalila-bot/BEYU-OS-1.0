import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { complianceAssessments, complianceObligations } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import Link from "next/link";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

/**
 * Compliance — the compliance engine as a first-class shared capability.
 *
 * Obligations and assessments already exist (assurance.compliance_obligations
 * / compliance_assessments) and are also summarised on the Assurance overview.
 * This focused surface presents the compliance domain itself under its
 * canonical capability (compliance:obligation.read). Compliance states are
 * explicit — the system never infers compliance and never claims certification.
 */
export default async function CompliancePage() {
  const access = await requireAccess("compliance:obligation.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="compliance:obligation.read" />;
  return withTenantDatabaseContext(access.principal, async () => {

    const scope = await tenantScopeIds(access.principal);
    const [obligationRows, assessmentRows] = await Promise.all([
      db.select().from(complianceObligations).where(inArray(complianceObligations.tenantId, scope)),
      db.select().from(complianceAssessments).where(inArray(complianceAssessments.tenantId, scope)),
    ]);

    const stateCount = (s: string) => assessmentRows.filter((a) => a.state === s).length;
    const assessed = assessmentRows.length;
    const compliant = stateCount("COMPLIANT");
    const overdue = obligationRows.filter((o) => o.nextDueAt && o.nextDueAt < new Date().toISOString().slice(0, 10));
    const frameworks = new Set(obligationRows.map((o) => o.framework));

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Compliance · shared capability</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Obligations, assessments &amp; remediation</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            One compliance engine: every obligation is mapped to a framework and jurisdiction, assessed on
            evidence, and remediated under an owner. AI-assisted assessments are always marked and require
            human confirmation.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Obligations" value={String(obligationRows.length)} sub={`${frameworks.size} frameworks`} />
          <Metric label="Assessed" value={String(assessed)} sub={`${obligationRows.length - assessed} awaiting assessment`} />
          <Metric label="Compliance rate" value={assessed ? `${Math.round((compliant / assessed) * 100)}%` : "Not assessed"} sub={`${compliant}/${assessed} compliant`} />
          <Metric label="Due date passed" value={String(overdue.length)} sub="obligations past next due" tone={overdue.length > 0 ? "gold" : "navy"} />
        </div>

        <Panel kicker="Explicit states" title="Assessment posture">
          <div className="mb-4 flex flex-wrap gap-2">
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
                      <td>
                        <Badge tone={stateTone(a?.state ?? "NOT_ASSESSED")}>{a?.state ?? "NOT_ASSESSED"}</Badge>
                        {a?.aiAssisted && <div className="mt-1 text-[10px] beyu-muted">AI-assisted · human {a.humanConfirmed ? "confirmed" : "pending"}</div>}
                      </td>
                      <td className="max-w-xs text-[11.5px] beyu-muted">{a?.remediationPlan ?? "—"}{a?.remediationDueAt ? ` (due ${a.remediationDueAt})` : ""}</td>
                    </tr>
                  );
                })}
                {obligationRows.length === 0 && <tr><td colSpan={6}><EmptyState message="No compliance obligations recorded in your scope." /></td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11.5px] beyu-muted">
            Regulatory change radar and legal exposure live under{" "}
            <Link href="/os/legal" className="font-semibold text-[#b08d1c]">Legal &amp; Liability</Link>; anomaly
            evidence under the <Link href="/os/assurance" className="font-semibold text-[#b08d1c]">Assurance overview</Link>.
          </p>
        </Panel>
      </div>
    );
  });
}
