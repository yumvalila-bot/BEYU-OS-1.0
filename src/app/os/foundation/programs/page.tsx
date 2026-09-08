import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, money, stateTone } from "@/components/brand";
import { listImpactMetrics, listProjects, listPrograms } from "@/lib/foundation/service-operations";

export const dynamic = "force-dynamic";

export default async function FoundationProgramsPage() {
  const access = await requireAccess("foundation:program.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="foundation:program.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const [programs, projects, metrics] = await Promise.all([
      listPrograms(access.principal),
      listProjects(access.principal),
      listImpactMetrics(access.principal),
    ]);
    const budget = programs.reduce((a, p) => a + Number(p.budget), 0);
    const spend = programs.reduce((a, p) => a + Number(p.spendToDate), 0);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Foundation OS · Programs & impact</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Programs, Projects & Impact</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Programs carry objectives, beneficiaries, budgets and KPIs; projects execute them; impact
            flows input → activity → output → outcome → impact with evidence.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Programs" value={String(programs.length)} sub="in scope" tone="gold" />
          <Metric label="Budget" value={money(budget, "USD")} sub={`${money(spend, "USD")} spent`} />
          <Metric label="Projects" value={String(projects.length)} sub="under programs" />
          <Metric label="Impact metrics" value={String(metrics.length)} sub="tracked" />
        </div>
        <Panel kicker="Delivery" title="Programs">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Program</th><th>Theme</th><th>Budget</th><th>Spend</th><th>Beneficiaries</th><th>Status</th></tr></thead>
              <tbody>
                {programs.map((p) => (
                  <tr key={p.id}>
                    <td><div className="font-medium">{p.name}</div><div className="font-mono text-[10.5px] beyu-muted">{p.code}</div></td>
                    <td><Badge tone="navy">{p.theme}</Badge></td>
                    <td className="tabular-nums">{money(p.budget, p.currency)}</td>
                    <td className="tabular-nums">{money(p.spendToDate, p.currency)}</td>
                    <td className="tabular-nums">{p.beneficiariesReached.toLocaleString()}</td>
                    <td><Badge tone={stateTone(p.status)}>{p.status}</Badge></td>
                  </tr>
                ))}
                {programs.length === 0 && <tr><td colSpan={6}><EmptyState message="No programs." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="Execution" title="Projects">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Project</th><th>Budget</th><th>Status</th></tr></thead>
                <tbody>
                  {projects.slice(0, 12).map((p) => (
                    <tr key={p.id}>
                      <td><div className="font-medium">{p.name}</div><div className="font-mono text-[10.5px] beyu-muted">{p.code}</div></td>
                      <td className="tabular-nums">{p.budget ? money(p.budget, p.currency) : "—"}</td>
                      <td><Badge tone={stateTone(p.status)}>{p.status}</Badge></td>
                    </tr>
                  ))}
                  {projects.length === 0 && <tr><td colSpan={3}><EmptyState message="No projects." /></td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel kicker="Evidence" title="Impact metrics">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Metric</th><th>Level</th><th>Target</th></tr></thead>
                <tbody>
                  {metrics.slice(0, 12).map((m) => (
                    <tr key={m.id}>
                      <td><div className="font-medium">{m.name}</div><div className="font-mono text-[10.5px] beyu-muted">{m.code} · {m.unit}</div></td>
                      <td><Badge tone="navy">{m.level}</Badge></td>
                      <td className="tabular-nums">{m.target ? Number(m.target).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                  {metrics.length === 0 && <tr><td colSpan={3}><EmptyState message="No impact metrics." /></td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    );
  });
}
