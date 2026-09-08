import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import { listConflicts, listMeetings } from "@/lib/foundation/service";

export const dynamic = "force-dynamic";

export default async function FoundationGovernancePage() {
  const access = await requireAccess("foundation:governance.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="foundation:governance.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const [meetings, conflicts] = await Promise.all([
      listMeetings(access.principal),
      listConflicts(access.principal),
    ]);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Foundation OS · Governance</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Foundation Governance</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Board meetings, agendas, minutes, quorum and conflict-of-interest declarations. Governance
            bodies, resolutions and votes remain canonical BEYU OS.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Metric label="Meetings" value={String(meetings.length)} sub="scheduled + held" tone="gold" />
          <Metric label="Conflicts declared" value={String(conflicts.length)} sub="interest declarations" />
          <Metric label="Open conflicts" value={String(conflicts.filter((c) => c.status === "DECLARED").length)} sub="awaiting review" />
        </div>
        <Panel kicker="Fiduciary" title="Meetings">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Meeting</th><th>Scheduled</th><th>Agenda items</th><th>Quorum</th><th>Status</th></tr></thead>
              <tbody>
                {meetings.map((m) => (
                  <tr key={m.id}>
                    <td><div className="font-medium">{m.title}</div><div className="font-mono text-[10.5px] beyu-muted">{m.code}</div></td>
                    <td className="text-[11.5px] tabular-nums">{new Date(m.scheduledAt).toISOString().slice(0, 16).replace("T", " ")}</td>
                    <td className="tabular-nums">{(m.agenda as unknown[]).length}</td>
                    <td className="text-[11.5px]">{m.quorumMet === null || m.quorumMet === undefined ? "—" : m.quorumMet ? "MET" : "NOT MET"}</td>
                    <td><Badge tone={stateTone(m.status)}>{m.status}</Badge></td>
                  </tr>
                ))}
                {meetings.length === 0 && <tr><td colSpan={5}><EmptyState message="No meetings scheduled." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel kicker="Integrity" title="Conflict declarations">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Type</th><th>Description</th><th>Severity</th><th>Status</th></tr></thead>
              <tbody>
                {conflicts.map((c) => (
                  <tr key={c.id}>
                    <td><Badge tone="navy">{c.interestType}</Badge></td>
                    <td className="max-w-md truncate text-[11.5px]">{c.description}</td>
                    <td><Badge tone={stateTone(c.severity)}>{c.severity}</Badge></td>
                    <td><Badge tone={stateTone(c.status)}>{c.status}</Badge></td>
                  </tr>
                ))}
                {conflicts.length === 0 && <tr><td colSpan={4}><EmptyState message="No conflicts declared." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
