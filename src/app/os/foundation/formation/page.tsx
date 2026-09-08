import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import { listFormationCases } from "@/lib/foundation/service";

export const dynamic = "force-dynamic";

export default async function FormationPage() {
  const access = await requireAccess("foundation:formation.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="foundation:formation.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const rows = await listFormationCases(access.principal);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Foundation OS · Formation</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Start a Foundation</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Guided formation from intake to approval: feasibility, structure and jurisdiction review,
            legal and tax review, governance activation. Assessments are legal information and process
            guidance — never legal advice — and professional review is mandatory.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Open cases" value={String(rows.filter((r) => !["APPROVED", "REJECTED", "WITHDRAWN"].includes(r.status)).length)} sub="in review" tone="gold" />
          <Metric label="Approved" value={String(rows.filter((r) => r.status === "APPROVED").length)} sub="ready to register" />
          <Metric label="In legal/tax review" value={String(rows.filter((r) => ["LEGAL_REVIEW", "TAX_REVIEW"].includes(r.status)).length)} sub="professional gate" />
          <Metric label="Total" value={String(rows.length)} sub="formation cases" />
        </div>
        <Panel kicker="Pipeline" title="Formation cases">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Proposed name</th><th>Vehicle</th><th>Recommendation</th><th>Legal review</th><th>Tax review</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><div className="font-medium">{c.proposedName}</div><div className="font-mono text-[10.5px] beyu-muted">{c.code}</div></td>
                    <td className="text-[11.5px]">{c.proposedVehicle ?? "—"}</td>
                    <td className="max-w-md truncate text-[11.5px]">{c.recommendation ?? "—"}</td>
                    <td><Badge tone={c.legalReviewRequired ? "amber" : "green"}>{c.legalReviewRequired ? "REQUIRED" : "WAIVED"}</Badge></td>
                    <td><Badge tone={c.taxReviewRequired ? "amber" : "green"}>{c.taxReviewRequired ? "REQUIRED" : "WAIVED"}</Badge></td>
                    <td><Badge tone={stateTone(c.status)}>{c.status}</Badge></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6}><EmptyState message="No formation cases. Open one via POST /api/v1/foundation/formation." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
