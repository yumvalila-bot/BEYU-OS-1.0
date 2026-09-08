import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import {
  complianceDashboard,
  deadlinesMissingEvidence,
  listComplianceTasks,
  listDeadlines,
  listEscalations,
  listObligations,
} from "@/lib/foundation/compliance";
import { deadlineHealth } from "@/lib/foundation/deadlines";

export const dynamic = "force-dynamic";

export default async function FoundationCompliancePage() {
  const access = await requireAccess("foundation:compliance.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="foundation:compliance.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [dashboard, missing, deadlines, tasks, escalations, obligations] = await Promise.all([
      complianceDashboard(access.principal, today),
      deadlinesMissingEvidence(access.principal),
      listDeadlines(access.principal),
      listComplianceTasks(access.principal),
      listEscalations(access.principal),
      listObligations(access.principal),
    ]);
    const missingSet = new Set(missing);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Foundation OS · Timely compliance</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Compliance Center</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            No known actionable obligation may silently expire: rule → obligation → deadline → task →
            notification → evidence → verification → completion → audit.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Overdue" value={String(dashboard.overdueCount)} sub="missed deadlines" tone="gold" />
          <Metric label="Due today" value={String(dashboard.health.DUE_TODAY)} sub="act now" />
          <Metric label="At risk" value={String(dashboard.health.AT_RISK)} sub="due within 14 days" />
          <Metric label="Evidence missing" value={String(missing.length)} sub="completion blocked" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Obligations" value={String(obligations.length)} sub="registry entries" />
          <Metric label="On-time" value={dashboard.onTimePct === null ? "—" : `${dashboard.onTimePct}%`} sub="completed share" />
          <Metric label="Blocked tasks" value={String(dashboard.blockedTasks)} sub="dependency held" />
          <Metric label="Open escalations" value={String(dashboard.openEscalations)} sub="raised by policy" />
        </div>
        <Panel kicker="Calendar" title="Deadlines">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Due</th><th>Health</th><th>Status</th><th>Period</th><th>Evidence</th></tr></thead>
              <tbody>
                {deadlines.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)).map((d) => {
                  const h = d.status === "OVERDUE" ? "OVERDUE" : deadlineHealth(d.dueDate, today);
                  return (
                    <tr key={d.id}>
                      <td className="tabular-nums">{d.dueDate}</td>
                      <td><Badge tone={stateTone(h)}>{h}</Badge></td>
                      <td><Badge tone={stateTone(d.status)}>{d.status}</Badge></td>
                      <td className="text-[11.5px]">{d.periodLabel ?? "—"}</td>
                      <td><Badge tone={missingSet.has(d.id) ? "red" : "green"}>{missingSet.has(d.id) ? "MISSING" : "OK"}</Badge></td>
                    </tr>
                  );
                })}
                {deadlines.length === 0 && <tr><td colSpan={5}><EmptyState message="No deadlines computed." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="Execution" title="Tasks">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Task</th><th>Owner</th><th>Status</th></tr></thead>
                <tbody>
                  {tasks.slice(0, 12).map((t) => (
                    <tr key={t.id}>
                      <td><div className="font-medium">{t.title}</div><div className="font-mono text-[10.5px] beyu-muted">{t.code}</div></td>
                      <td className="text-[11.5px]">{t.ownerRole}</td>
                      <td><Badge tone={stateTone(t.status)}>{t.status}</Badge></td>
                    </tr>
                  ))}
                  {tasks.length === 0 && <tr><td colSpan={3}><EmptyState message="No compliance tasks." /></td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel kicker="Attention" title="Escalations">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Level</th><th>Route</th><th>Reason</th><th>Status</th></tr></thead>
                <tbody>
                  {escalations.slice(0, 12).map((e) => (
                    <tr key={e.id}>
                      <td className="tabular-nums">L{e.level}</td>
                      <td className="text-[11px]">{e.fromRole} → {e.toRole}</td>
                      <td className="max-w-xs truncate text-[11.5px]">{e.reason}</td>
                      <td><Badge tone={stateTone(e.status)}>{e.status}</Badge></td>
                    </tr>
                  ))}
                  {escalations.length === 0 && <tr><td colSpan={4}><EmptyState message="No escalations raised." /></td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    );
  });
}
