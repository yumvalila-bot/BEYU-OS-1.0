import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import { listSafeguardingCases } from "@/lib/foundation/service-operations";

export const dynamic = "force-dynamic";

export default async function SafeguardingPage() {
  const access = await requireAccess("foundation:safeguarding.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="foundation:safeguarding.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const rows = await listSafeguardingCases(access.principal);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Foundation OS · Safeguarding</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Safeguarding</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Secure casework for safeguarding, child protection, abuse, exploitation, harassment and
            whistleblowing. Highly restricted: named access only, every view audited.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Metric label="Cases" value={String(rows.length)} sub="in scope" tone="gold" />
          <Metric label="Open" value={String(rows.filter((r) => !["CLOSED"].includes(r.status)).length)} sub="active casework" />
          <Metric label="Under investigation" value={String(rows.filter((r) => r.status === "INVESTIGATING").length)} sub="formal investigation" />
        </div>
        <Panel kicker="Protected" title="Cases">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Case</th><th>Type</th><th>Reported</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="font-mono text-[11px]">{c.code}</td>
                    <td><Badge tone="navy">{c.caseType}</Badge></td>
                    <td className="text-[11.5px] tabular-nums">{new Date(c.reportedAt).toISOString().slice(0, 10)}</td>
                    <td><Badge tone={stateTone(c.status)}>{c.status}</Badge></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={4}><EmptyState message="No safeguarding cases." /></td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] beyu-muted">
            Case detail is minimised on this index. Full records require case-level authorisation.
          </p>
        </Panel>
      </div>
    );
  });
}
