import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, money, stateTone } from "@/components/brand";
import { listFunds } from "@/lib/foundation/service";
import { fundReconciliationView, listFoundationCapitalRequests } from "@/lib/foundation/finance-bridge";

export const dynamic = "force-dynamic";

export default async function FoundationFundsPage() {
  const access = await requireAccess("foundation:fund.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="foundation:fund.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const [funds, recon, capital] = await Promise.all([
      listFunds(access.principal),
      fundReconciliationView(access.principal),
      listFoundationCapitalRequests(access.principal),
    ]);
    const balance = funds.reduce((a, f) => a + Number(f.balance), 0);
    const committed = funds.reduce((a, f) => a + Number(f.committed), 0);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Foundation OS · Funds</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Funds & Finance</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Restricted, unrestricted, designated, endowment and reserve funds. Restricted funds never
            mix without their recorded purpose; financial consequences remain canonical Finance OS.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Funds" value={String(funds.length)} sub="in scope" tone="gold" />
          <Metric label="Balance" value={money(balance, "USD")} sub="across funds" />
          <Metric label="Committed" value={money(committed, "USD")} sub="allocated" />
          <Metric label="Capital requests" value={String(capital.length)} sub="via Finance OS" />
        </div>
        <Panel kicker="Accounting" title="Funds & reconciliation">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Fund</th><th>Type</th><th>Balance</th><th>Committed</th><th>Available</th><th>Drift</th></tr></thead>
              <tbody>
                {funds.map((f) => {
                  const r = recon.find((x) => x.fundId === f.id);
                  return (
                    <tr key={f.id}>
                      <td><div className="font-medium">{f.name}</div><div className="font-mono text-[10.5px] beyu-muted">{f.code}</div></td>
                      <td><Badge tone={f.fundType === "RESTRICTED" ? "amber" : "navy"}>{f.fundType}</Badge></td>
                      <td className="tabular-nums">{money(f.balance, f.currency)}</td>
                      <td className="tabular-nums">{money(f.committed, f.currency)}</td>
                      <td className="tabular-nums">{r ? money(r.available, f.currency) : "—"}</td>
                      <td className="tabular-nums">{r ? money(r.drift, f.currency) : "—"}</td>
                    </tr>
                  );
                })}
                {funds.length === 0 && <tr><td colSpan={6}><EmptyState message="No funds created." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel kicker="Finance OS" title="Capital requests (sector FOUNDATION)">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Request</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {capital.map((c) => (
                  <tr key={c.id}>
                    <td><div className="font-medium">{c.title}</div><div className="font-mono text-[10.5px] beyu-muted">{c.code}</div></td>
                    <td className="tabular-nums">{money(c.amount, c.currency)}</td>
                    <td><Badge tone={stateTone(c.status)}>{c.status}</Badge></td>
                  </tr>
                ))}
                {capital.length === 0 && <tr><td colSpan={3}><EmptyState message="No capital requests." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
