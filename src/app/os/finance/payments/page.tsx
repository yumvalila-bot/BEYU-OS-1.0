import { requireAccess } from "@/lib/guard";
import { tenantScopeIds, withTenantDatabaseContext } from "@/lib/tenant-scope";
import { listTransactions, paymentsPosture } from "@/lib/payments/readmodel";
import { allStatuses, assertNoLiveIntegrationClaim } from "@/lib/payments/providers";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

function minorAmount(value: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export default async function PaymentsPage() {
  const access = await requireAccess("finance:payments.read", {
    classification: "RESTRICTED",
  });
  if (!access.allowed) {
    return <Denied reason={access.reason} capability="finance:payments.read" />;
  }
  if (access.principal.entityScope.length > 0) {
    return (
      <Denied
        reason="The combined payment posture includes relational settlement and exception rows without complete legal-entity keys; tenant-wide reads are refused under an entity-scoped grant."
        capability="finance:payments.read"
      />
    );
  }

  return withTenantDatabaseContext(access.principal, async () => {
    const tenantIds = await tenantScopeIds(access.principal);
    const [transactions, posture] = await Promise.all([
      listTransactions({ tenantIds, limit: 100 }),
      paymentsPosture({ tenantIds, settlements: true }),
    ]);
    const providers = allStatuses().map((status) => ({
      ...status,
      integrity: assertNoLiveIntegrationClaim(status),
    }));
    const totals = posture.totals;

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Finance OS · Payments & banking integration</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Payments, Settlements & Exceptions</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Provider evidence, transaction verification, matching, settlement and accounting handoff with
            read, ingest, review and authorize duties separated. This surface cannot create a payment or post
            a journal; CAP_POSTING remains locked to Finance OS controls.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Transactions" value={totals ? String(totals.transactions) : "Unavailable"} sub="provider claims in scope" tone="gold" />
          <Metric label="Verified" value={totals ? String(totals.verified) : "Unavailable"} sub="verification is separate from settlement" />
          <Metric label="Reconciled" value={totals ? String(totals.reconciled) : "Unavailable"} sub="matched to governed records" />
          <Metric label="Blocking exceptions" value={totals ? String(totals.blockedExceptions) : "Unavailable"} sub="must be resolved by an authorized human" />
        </div>

        <Panel kicker="Provider truth" title="Configured integration posture">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {providers.map((provider) => (
              <article key={provider.provider} className="rounded-xl border border-[color:var(--beyu-line)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[13.5px] font-semibold">{provider.provider}</div>
                    <div className="mt-1 text-[11px] beyu-muted">{provider.apiAvailability} · {provider.sandboxMode}</div>
                  </div>
                  <Badge tone={stateTone(provider.integrationStatus)}>{provider.integrationStatus}</Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div><dt className="beyu-muted">Credentials</dt><dd>{provider.credentialStatus}</dd></div>
                  <div><dt className="beyu-muted">Contract</dt><dd>{provider.contractStatus}</dd></div>
                  <div><dt className="beyu-muted">Webhook</dt><dd>{provider.webhookModel}</dd></div>
                  <div><dt className="beyu-muted">Settlement</dt><dd>{provider.settlementModel}</dd></div>
                </dl>
                {!provider.integrity.ok && <p className="mt-3 text-[11px] text-red-700">Registry evidence is internally inconsistent; live use is refused.</p>}
              </article>
            ))}
          </div>
        </Panel>

        <Panel kicker="Read-only claim ledger" title="Payment transactions">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Occurred</th><th>Provider reference</th><th>Direction</th><th>Gross</th><th>Verification</th><th>Reconciliation</th><th>Settlement</th><th>Accounting</th><th>Exceptions</th></tr></thead>
              <tbody>
                {transactions.items.map((row) => (
                  <tr key={row.id}>
                    <td className="tabular-nums text-[11.5px]">{row.occurredAt.slice(0, 10)}</td>
                    <td><div className="font-medium">{row.providerCode}</div><div className="font-mono text-[10px] beyu-muted">{row.providerTransactionId}</div></td>
                    <td className="text-[11.5px]">{row.direction}</td>
                    <td className="tabular-nums">{minorAmount(row.grossMinor, row.currency)}</td>
                    <td><Badge tone={stateTone(row.verificationStatus)}>{row.verificationStatus}</Badge></td>
                    <td><Badge tone={stateTone(row.reconciliationStatus)}>{row.reconciliationStatus}</Badge></td>
                    <td><Badge tone={stateTone(row.settlementStatus)}>{row.settlementStatus}</Badge></td>
                    <td><Badge tone={stateTone(row.accountingStatus)}>{row.accountingStatus}</Badge></td>
                    <td className="tabular-nums">{row.openBlockingExceptions}</td>
                  </tr>
                ))}
                {transactions.items.length === 0 && <tr><td colSpan={9}><EmptyState message="No payment transactions are visible within this scope." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
