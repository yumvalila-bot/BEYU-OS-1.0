import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import { listTaxAssessments, listTaxRules } from "@/lib/foundation/service";

export const dynamic = "force-dynamic";

export default async function FoundationTaxPage() {
  const access = await requireAccess("foundation:tax.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="foundation:tax.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const [rules, assessments] = await Promise.all([
      listTaxRules(access.principal),
      listTaxAssessments(access.principal),
    ]);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Foundation OS · Tax intelligence</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Tax Intelligence</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Versioned jurisdiction rules and per-activity assessments. Tax information only — never
            advice. No exemption may be claimed for any status other than CONFIRMED with evidence.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Rules on record" value={String(rules.length)} sub="versioned + sourced" tone="gold" />
          <Metric label="Assessments" value={String(assessments.length)} sub="recorded positions" />
          <Metric label="Confirmed" value={String(assessments.filter((a) => a.taxStatus === "CONFIRMED").length)} sub="evidenced" />
          <Metric label="Needs review" value={String(assessments.filter((a) => a.professionalReviewRequired).length)} sub="professional gate" />
        </div>
        <Panel kicker="Evidence" title="Assessments">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Activity</th><th>Status</th><th>Benefit</th><th>Liability</th><th>Review</th></tr></thead>
              <tbody>
                {assessments.map((a) => (
                  <tr key={a.id}>
                    <td><div className="font-medium">{a.activity}</div><div className="font-mono text-[10.5px] beyu-muted">{a.code}</div></td>
                    <td><Badge tone={stateTone(a.taxStatus)}>{a.taxStatus}</Badge></td>
                    <td className="max-w-xs truncate text-[11.5px]">{a.potentialBenefit ?? "—"}</td>
                    <td className="max-w-xs truncate text-[11.5px]">{a.potentialLiability ?? "—"}</td>
                    <td><Badge tone={a.professionalReviewRequired ? "amber" : "green"}>{a.professionalReviewRequired ? "REQUIRED" : "CLEAR"}</Badge></td>
                  </tr>
                ))}
                {assessments.length === 0 && <tr><td colSpan={5}><EmptyState message="No tax assessments." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel kicker="Authority" title="Jurisdiction rules">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Rule</th><th>Authority</th><th>Version</th><th>Effective</th><th>Verified</th><th>Status</th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td><div className="font-medium">{r.code}</div><div className="max-w-xs truncate text-[11px] beyu-muted">{r.applicability}</div></td>
                    <td className="text-[11.5px]">{r.authority}</td>
                    <td className="font-mono text-[11px]">v{r.ruleVersion}</td>
                    <td className="text-[11.5px] tabular-nums">{r.effectiveFrom}{r.effectiveTo ? ` → ${r.effectiveTo}` : ""}</td>
                    <td className="text-[11.5px] tabular-nums">{r.verificationDate ?? "NEVER"}</td>
                    <td><Badge tone={stateTone(r.status)}>{r.status}</Badge></td>
                  </tr>
                ))}
                {rules.length === 0 && <tr><td colSpan={6}><EmptyState message="No tax rules on record." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
