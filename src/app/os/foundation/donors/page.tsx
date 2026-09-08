import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, money, stateTone } from "@/components/brand";
import { listDonations, listDonors } from "@/lib/foundation/service";

export const dynamic = "force-dynamic";

export default async function FoundationDonorsPage() {
  const access = await requireAccess("foundation:donor.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="foundation:donor.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const [donors, donations] = await Promise.all([
      listDonors(access.principal),
      listDonations(access.principal),
    ]);
    const total = donations.reduce((a, d) => a + Number(d.amount), 0);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Foundation OS · Donors</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Donor Management</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Donor → donation → fund → restriction → program → outcome. Due diligence gates every
            relationship; blocked donors cannot transact.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Donors" value={String(donors.length)} sub="profiles in scope" tone="gold" />
          <Metric label="Donations" value={money(total, "USD")} sub={`${donations.length} recorded`} />
          <Metric label="Cleared" value={String(donors.filter((d) => d.dueDiligenceStatus === "CLEARED").length)} sub="due diligence" />
          <Metric label="Flagged / blocked" value={String(donors.filter((d) => ["FLAGGED", "BLOCKED"].includes(d.dueDiligenceStatus)).length)} sub="cannot transact" />
        </div>
        <Panel kicker="Stewardship" title="Donors">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Donor</th><th>Type</th><th>Due diligence</th><th>Status</th></tr></thead>
              <tbody>
                {donors.map((d) => (
                  <tr key={d.id}>
                    <td><div className="font-medium">{d.displayName}</div><div className="font-mono text-[10.5px] beyu-muted">{d.code}</div></td>
                    <td className="text-[11.5px]">{d.donorType}</td>
                    <td><Badge tone={stateTone(d.dueDiligenceStatus)}>{d.dueDiligenceStatus}</Badge></td>
                    <td><Badge tone={stateTone(d.status)}>{d.status}</Badge></td>
                  </tr>
                ))}
                {donors.length === 0 && <tr><td colSpan={4}><EmptyState message="No donors registered." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel kicker="Trace" title="Donations">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Donation</th><th>Amount</th><th>Received</th><th>Restriction</th><th>Status</th></tr></thead>
              <tbody>
                {donations.map((d) => (
                  <tr key={d.id}>
                    <td className="font-mono text-[11px]">{d.code}</td>
                    <td className="tabular-nums">{money(d.amount, d.currency)}</td>
                    <td className="text-[11.5px] tabular-nums">{d.receivedAt}</td>
                    <td className="max-w-xs truncate text-[11.5px]">{d.restrictionSummary ?? "—"}</td>
                    <td><Badge tone={stateTone(d.status)}>{d.status}</Badge></td>
                  </tr>
                ))}
                {donations.length === 0 && <tr><td colSpan={5}><EmptyState message="No donations recorded." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
