import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import { listStructureProposals, listStructureScenarios } from "@/lib/foundation/service";

export const dynamic = "force-dynamic";

export default async function StructuresPage() {
  const access = await requireAccess("foundation:structure.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="foundation:structure.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const [proposals, scenarios] = await Promise.all([
      listStructureProposals(access.principal),
      listStructureScenarios(access.principal),
    ]);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Foundation OS · Structure</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Organization Structure & Simulator</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Current and proposed structures with ownership, control and funding relationships. Simulations
            compare before/after across legal, governance, tax, funding, workforce and compliance — and
            never execute changes.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Metric label="Proposals" value={String(proposals.length)} sub="current + proposed" tone="gold" />
          <Metric label="Simulations" value={String(scenarios.length)} sub="what-if analyses" />
          <Metric label="Blockers found" value={String(scenarios.length)} sub="review each scenario" />
        </div>
        <Panel kicker="Designer" title="Structure proposals">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Title</th><th>Kind</th><th>Nodes</th><th>Edges</th><th>Status</th></tr></thead>
              <tbody>
                {proposals.map((p) => {
                  const graph = p.graph as unknown as { nodes?: unknown[]; edges?: unknown[] };
                  return (
                    <tr key={p.id}>
                      <td><div className="font-medium">{p.title}</div><div className="font-mono text-[10.5px] beyu-muted">{p.code}</div></td>
                      <td><Badge tone={p.kind === "CURRENT" ? "navy" : "gold"}>{p.kind}</Badge></td>
                      <td className="tabular-nums">{graph.nodes?.length ?? 0}</td>
                      <td className="tabular-nums">{graph.edges?.length ?? 0}</td>
                      <td><Badge tone={stateTone(p.status)}>{p.status}</Badge></td>
                    </tr>
                  );
                })}
                {proposals.length === 0 && <tr><td colSpan={5}><EmptyState message="No structure proposals." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel kicker="Simulator" title="Scenarios">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Question</th><th>Approvals required</th><th>Tasks</th><th>Status</th></tr></thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.id}>
                    <td><div className="font-medium">{s.question}</div><div className="font-mono text-[10.5px] beyu-muted">{s.code}</div></td>
                    <td className="tabular-nums">{s.requiredApprovals.length}</td>
                    <td className="tabular-nums">{s.implementationTasks.length}</td>
                    <td><Badge tone={stateTone(s.status)}>{s.status}</Badge></td>
                  </tr>
                ))}
                {scenarios.length === 0 && <tr><td colSpan={4}><EmptyState message="No simulations yet." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
