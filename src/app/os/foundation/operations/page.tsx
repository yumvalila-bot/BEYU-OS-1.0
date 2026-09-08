import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, money, stateTone } from "@/components/brand";
import {
  listAssets,
  listInvestments,
  listProcurements,
  listWorkforceAssignments,
} from "@/lib/foundation/service-operations";

export const dynamic = "force-dynamic";

export default async function FoundationOperationsPage() {
  const access = await requireAccess("foundation:procurement.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="foundation:procurement.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const [procurements, assets, investments, assignments] = await Promise.all([
      listProcurements(access.principal),
      listAssets(access.principal),
      listInvestments(access.principal),
      listWorkforceAssignments(access.principal),
    ]);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Foundation OS · Operations</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Procurement, Assets, Investments</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Need → audit procurement, acquire → dispose assets, and policy-bound investments. Material
            investments require human approval; nothing executes autonomously.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Procurements" value={String(procurements.length)} sub="in pipeline" tone="gold" />
          <Metric label="Assets" value={String(assets.length)} sub="registered" />
          <Metric label="Investments" value={String(investments.length)} sub="positions" />
          <Metric label="Assignments" value={String(assignments.length)} sub="HCM workers in context" />
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="Supply" title="Procurements">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Procurement</th><th>Budget</th><th>Status</th></tr></thead>
                <tbody>
                  {procurements.slice(0, 10).map((p) => (
                    <tr key={p.id}>
                      <td><div className="font-medium">{p.title}</div><div className="font-mono text-[10.5px] beyu-muted">{p.code}</div></td>
                      <td className="tabular-nums">{p.budgetAmount ? money(p.budgetAmount, p.currency) : "—"}</td>
                      <td><Badge tone={stateTone(p.status)}>{p.status}</Badge></td>
                    </tr>
                  ))}
                  {procurements.length === 0 && <tr><td colSpan={3}><EmptyState message="No procurements." /></td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel kicker="Register" title="Assets">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Asset</th><th>Type</th><th>Status</th></tr></thead>
                <tbody>
                  {assets.slice(0, 10).map((a) => (
                    <tr key={a.id}>
                      <td><div className="font-medium">{a.name}</div><div className="font-mono text-[10.5px] beyu-muted">{a.code}</div></td>
                      <td className="text-[11.5px]">{a.assetType}</td>
                      <td><Badge tone={stateTone(a.status)}>{a.status}</Badge></td>
                    </tr>
                  ))}
                  {assets.length === 0 && <tr><td colSpan={3}><EmptyState message="No assets registered." /></td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="Treasury" title="Investments">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Instrument</th><th>Principal</th><th>Status</th></tr></thead>
                <tbody>
                  {investments.slice(0, 10).map((i) => (
                    <tr key={i.id}>
                      <td><div className="font-medium">{i.instrument}</div><div className="font-mono text-[10.5px] beyu-muted">{i.code}</div></td>
                      <td className="tabular-nums">{money(i.principalAmount, i.currency)}</td>
                      <td><Badge tone={stateTone(i.status)}>{i.status}</Badge></td>
                    </tr>
                  ))}
                  {investments.length === 0 && <tr><td colSpan={3}><EmptyState message="No investments proposed." /></td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel kicker="HCM context" title="Workforce assignments">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Role</th><th>Type</th><th>Status</th></tr></thead>
                <tbody>
                  {assignments.slice(0, 10).map((a) => (
                    <tr key={a.id}>
                      <td className="font-medium">{a.roleTitle}</td>
                      <td><Badge tone="navy">{a.assignmentType}</Badge></td>
                      <td><Badge tone={stateTone(a.status)}>{a.status}</Badge></td>
                    </tr>
                  ))}
                  {assignments.length === 0 && <tr><td colSpan={3}><EmptyState message="No assignments." /></td></tr>}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] beyu-muted">
              Assignments are contextual. The worker master record stays in canonical HCM.
            </p>
          </Panel>
        </div>
      </div>
    );
  });
}
