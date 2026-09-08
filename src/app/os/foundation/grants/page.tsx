import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, money, stateTone } from "@/components/brand";
import { listGrantees, listGrants } from "@/lib/foundation/service";

export const dynamic = "force-dynamic";

export default async function FoundationGrantsPage() {
  const access = await requireAccess("foundation:grant.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="foundation:grant.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const [grants, grantees] = await Promise.all([
      listGrants(access.principal),
      listGrantees(access.principal),
    ]);
    const committed = grants.reduce((a, g) => a + Number(g.amount), 0);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Foundation OS · Grants</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Grant Management</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Opportunity → closeout with eligibility, due diligence, scoring, conflict checks, approval,
            milestones and disbursements. Approval is a material human decision.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Grants" value={String(grants.length)} sub="in scope" tone="gold" />
          <Metric label="Pipeline value" value={money(committed, "USD")} sub="all stages" />
          <Metric label="Awaiting approval" value={String(grants.filter((g) => g.status === "APPROVAL").length)} sub="material gate" />
          <Metric label="Grantees" value={String(grantees.length)} sub="registered" />
        </div>
        <Panel kicker="Awards" title="Grants">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Grant</th><th>Amount</th><th>Conflict check</th><th>Status</th></tr></thead>
              <tbody>
                {grants.map((g) => (
                  <tr key={g.id}>
                    <td><div className="font-medium">{g.title}</div><div className="font-mono text-[10.5px] beyu-muted">{g.code}</div></td>
                    <td className="tabular-nums">{money(g.amount, g.currency)}</td>
                    <td><Badge tone={stateTone(g.conflictCheckStatus)}>{g.conflictCheckStatus}</Badge></td>
                    <td><Badge tone={stateTone(g.status)}>{g.status}</Badge></td>
                  </tr>
                ))}
                {grants.length === 0 && <tr><td colSpan={4}><EmptyState message="No grants created." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel kicker="Partners" title="Grantees">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Grantee</th><th>Type</th><th>Due diligence</th><th>Status</th></tr></thead>
              <tbody>
                {grantees.map((g) => (
                  <tr key={g.id}>
                    <td><div className="font-medium">{g.displayName}</div><div className="font-mono text-[10.5px] beyu-muted">{g.code}</div></td>
                    <td className="text-[11.5px]">{g.granteeType}</td>
                    <td><Badge tone={stateTone(g.dueDiligenceStatus)}>{g.dueDiligenceStatus}</Badge></td>
                    <td><Badge tone={stateTone(g.status)}>{g.status}</Badge></td>
                  </tr>
                ))}
                {grantees.length === 0 && <tr><td colSpan={4}><EmptyState message="No grantees registered." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
