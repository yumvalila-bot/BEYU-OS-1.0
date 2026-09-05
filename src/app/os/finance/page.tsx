import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import {
  financialPeriods,
  governanceCapabilityRegistry,
  governanceDecisionRegistry,
  journalEntries,
  journalLines,
  ledgerAccounts,
  legalEntities,
  treasuryPositions,
} from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { can } from "@/lib/authz";
import { Badge, Denied, EmptyState, Metric, Panel, money, stateTone } from "@/components/brand";
import { reconcileTreasuryToLedger, scanDataQuality, summarizeDataQuality } from "@/lib/finance/reconciliation";
import { trialBalance, statement } from "@/lib/finance/reporting";

export const dynamic = "force-dynamic";

export default async function FinanceOSPage() {
  const access = await requireAccess("finance:ledger.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="finance:ledger.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const scope = await tenantScopeIds(access.principal);
    const tenantId = access.principal.tenantId;

    const [
      entries,
      accounts,
      periods,
      entities,
      treasury,
      capabilities,
      decisions,
      reconciliation,
      dataQualityFindings,
    ] = await Promise.all([
      db
        .select()
        .from(journalEntries)
        .where(inArray(journalEntries.tenantId, scope))
        .orderBy(desc(journalEntries.postedAt))
        .limit(20),
      db
        .select()
        .from(ledgerAccounts)
        .where(inArray(ledgerAccounts.tenantId, scope))
        .orderBy(ledgerAccounts.code),
      db
        .select()
        .from(financialPeriods)
        .orderBy(desc(financialPeriods.startsOn)),
      db.select().from(legalEntities),
      db
        .select()
        .from(treasuryPositions)
        .where(inArray(treasuryPositions.tenantId, scope)),
      db
        .select()
        .from(governanceCapabilityRegistry)
        .where(eq(governanceCapabilityRegistry.capabilityCode, "CAP_POSTING")),
      db.select().from(governanceDecisionRegistry),
      reconcileTreasuryToLedger(tenantId),
      scanDataQuality(),
    ]);

    const entityMap = new Map(entities.map((e) => [e.id, e]));
    const capPosting = capabilities[0];
    const qualitySummary = summarizeDataQuality(dataQualityFindings);

    const canPost = can(access.principal, "finance:ledger.post").allowed;
    const canTreasury = can(access.principal, "finance:treasury.read").allowed;
    const canWaterfall = can(access.principal, "finance:waterfall.read").allowed;
    const canTax = can(access.principal, "finance:tax.read").allowed;

    const totalTreasuryUSD = treasury.reduce((acc, t) => acc + Number(t.baseCurrencyBalance), 0);

    const todayStr = new Date().toISOString().slice(0, 10);
    const tbReport = await trialBalance({
      tenantId,
      asOf: todayStr,
    });
    const bsReport = await statement({
      kind: "BALANCE_SHEET",
      tenantId,
      asOf: todayStr,
    });

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Sector OS · Finance OS Control Plane</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">General Ledger, Chart of Accounts & Statements</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            The canonical financial authority for BEYU OS. Enforces double-entry integrity, immutable audit trails,
            strict tenant/entity isolation, and fail-closed capability gates. No shadow ledgers or silent plug adjustments are permitted.
          </p>
        </header>

        {/* Status Banner */}
        <div className="beyu-panel border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <div>
                <div className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">
                  CAP_POSTING Gate: {capPosting?.activationStatus ?? "LOCKED"} (FAIL-CLOSED)
                </div>
                <div className="text-[11.5px] beyu-muted">
                  Posting engine requires CFO & ARB ratified accounting policies (P1, P6, P7, P9). Execution is locked.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="amber">GOVERNANCE BLOCKED</Badge>
              <Badge tone="navy">ENGINEERING READY</Badge>
            </div>
          </div>
        </div>

        {/* Top-Level Operational Metrics */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Posting Execution Gate"
            value={capPosting?.activationStatus ?? "LOCKED"}
            tone="amber"
            sub="CAP_POSTING fail-closed gate"
          />
          <Metric
            label="Posted Journal Entries"
            value={String(entries.length)}
            sub={entries.length === 0 ? "Empty ledger (DATA_NOT_AVAILABLE)" : `${entries.length} posted entries`}
          />
          <Metric
            label="Chart of Accounts"
            value={String(accounts.length)}
            sub={accounts.length === 0 ? "Awaiting P6 ratification" : `${accounts.length} active accounts`}
          />
          <Metric
            label="Reconciliation Status"
            value={reconciliation.status}
            tone={reconciliation.status === "RECONCILED" ? "green" : "slate"}
            sub="Zero silent adjustments committed"
          />
        </div>

        {/* Quick Navigation / Hub Links */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/os/capital"
            className="beyu-panel p-4 transition hover:border-[#d4af37]/60 block"
          >
            <div className="beyu-kicker text-[#b08d1c]">Capital & Treasury</div>
            <div className="text-[14px] font-semibold mt-1">Allocation & Liquidity</div>
            <div className="text-[11.5px] beyu-muted mt-0.5">
              {canTreasury ? `${treasury.length} positions · ${money(totalTreasuryUSD, "USD")}` : "Protected scope"}
            </div>
          </Link>
          <Link
            href="/os/waterfall"
            className="beyu-panel p-4 transition hover:border-[#d4af37]/60 block"
          >
            <div className="beyu-kicker text-[#b08d1c]">Waterfall Engine</div>
            <div className="text-[14px] font-semibold mt-1">Cashflow Distribution</div>
            <div className="text-[11.5px] beyu-muted mt-0.5">
              Deterministic tiered allocations with resolution governance
            </div>
          </Link>
          <Link
            href="/os/tax"
            className="beyu-panel p-4 transition hover:border-[#d4af37]/60 block"
          >
            <div className="beyu-kicker text-[#b08d1c]">Tax Intelligence</div>
            <div className="text-[14px] font-semibold mt-1">Strategy & Assessments</div>
            <div className="text-[11.5px] beyu-muted mt-0.5">
              Jurisdiction-gated analysis & statutory evidence
            </div>
          </Link>
        </div>

        {/* General Ledger Section */}
        <Panel
          kicker="Double-Entry Core"
          title="Authoritative General Ledger"
          action={
            <div className="flex items-center gap-2">
              <span className="text-[11px] beyu-muted">Immutable ledger</span>
              <Badge tone={canPost ? "green" : "slate"}>
                {canPost ? "Role Authorized (Poster)" : "Read Only"}
              </Badge>
            </div>
          }
        >
          {entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Date</th>
                    <th>Entity</th>
                    <th>Description</th>
                    <th>Currency</th>
                    <th>Source</th>
                    <th>Posted By</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td className="font-mono text-[11.5px] font-semibold">{e.reference}</td>
                      <td className="text-[11.5px] beyu-muted">
                        {e.postedAt ? new Date(e.postedAt).toISOString().slice(0, 10) : "—"}
                      </td>
                      <td className="text-[11.5px]">
                        {entityMap.get(e.legalEntityId)?.legalName ?? e.legalEntityId}
                      </td>
                      <td className="font-medium text-[12px]">{e.description}</td>
                      <td><Badge tone="navy">{e.currency}</Badge></td>
                      <td className="text-[11.5px] beyu-muted">{e.source}</td>
                      <td className="font-mono text-[11px]">{e.postedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-6 text-center">
              <EmptyState message="General ledger contains zero journal entries. CAP_POSTING is fail-closed locked pending governance ratification." />
            </div>
          )}
        </Panel>

        {/* Chart of Accounts & Accounting Periods */}
        <div className="grid gap-6 xl:grid-cols-2">
          {/* Chart of Accounts */}
          <Panel
            kicker="Reference Data"
            title="Chart of Accounts (CoA)"
            action={<Badge tone="navy">Tenant Scoped</Badge>}
          >
            {accounts.length > 0 ? (
              <div className="overflow-x-auto max-h-80 beyu-scroll">
                <table className="beyu-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Account Name</th>
                      <th>Type</th>
                      <th>IFRS Category</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.id}>
                        <td className="font-mono text-[11.5px] font-semibold">{a.code}</td>
                        <td className="font-medium text-[12px]">{a.name}</td>
                        <td><Badge tone="navy">{a.accountType}</Badge></td>
                        <td className="text-[11.5px] beyu-muted">{a.ifrsCategory ?? "—"}</td>
                        <td><Badge tone={a.active ? "green" : "slate"}>{a.active ? "ACTIVE" : "INACTIVE"}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="No chart of accounts defined in database. Account structure requires P6/P1 policy ratification." />
            )}
          </Panel>

          {/* Accounting Periods Subsystem */}
          <Panel
            kicker="Fiscal Calendar"
            title="Accounting Periods & Close Status"
            action={<Badge tone="gold">Entity Scoped</Badge>}
          >
            {periods.length > 0 ? (
              <div className="overflow-x-auto max-h-80 beyu-scroll">
                <table className="beyu-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Entity</th>
                      <th>Window</th>
                      <th>Status</th>
                      <th>Closed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono text-[11.5px] font-semibold">{p.code}</td>
                        <td className="text-[11.5px]">{entityMap.get(p.legalEntityId)?.code ?? p.legalEntityId}</td>
                        <td className="text-[11.5px] tabular-nums">{p.startsOn} → {p.endsOn}</td>
                        <td><Badge tone={stateTone(p.status)}>{p.status}</Badge></td>
                        <td className="text-[11.5px] beyu-muted">{p.closedBy ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="No accounting periods established. Fiscal calendar policy (P7) remains pending." />
            )}
          </Panel>
        </div>

        {/* Reconciliation & Data Quality Section */}
        <Panel
          kicker="Assurance & Quality"
          title="Treasury to General Ledger Reconciliation"
          action={
            <Badge tone={reconciliation.status === "RECONCILED" ? "green" : "amber"}>
              {reconciliation.status}
            </Badge>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[color:var(--beyu-line)] p-3">
                <div className="text-[11px] beyu-muted">Treasury Subledger Total</div>
                <div className="text-[16px] font-semibold mt-1">{reconciliation.subledgerTotal ?? "—"}</div>
                <div className="text-[10.5px] beyu-muted mt-0.5">{treasury.length} positions recorded</div>
              </div>
              <div className="rounded-lg border border-[color:var(--beyu-line)] p-3">
                <div className="text-[11px] beyu-muted">General Ledger Control Total</div>
                <div className="text-[16px] font-semibold mt-1">{reconciliation.ledgerTotal ?? "null"}</div>
                <div className="text-[10.5px] beyu-muted mt-0.5">Authoritative posted lines</div>
              </div>
              <div className="rounded-lg border border-[color:var(--beyu-line)] p-3">
                <div className="text-[11px] beyu-muted">Reconciliation Difference</div>
                <div className="text-[16px] font-semibold mt-1">{reconciliation.difference ?? "N/A"}</div>
                <div className="text-[10.5px] text-emerald-700 dark:text-emerald-400 mt-0.5">0 silent plug adjustments</div>
              </div>
            </div>

            <div className="text-[12px] bg-slate-50 dark:bg-white/5 p-3 rounded border border-[color:var(--beyu-line)]">
              <span className="font-semibold">Reconciliation Epistemic Note: </span>
              <span className="beyu-muted">{reconciliation.reason}</span>
            </div>

            {dataQualityFindings.length > 0 && (
              <div className="mt-4">
                <div className="text-[12px] font-semibold mb-2">
                  Data Quality Findings ({qualitySummary.total} detected · {qualitySummary.critical} critical)
                </div>
                <div className="space-y-2">
                  {dataQualityFindings.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11.5px] p-2 rounded bg-amber-500/10 border border-amber-500/20">
                      <Badge tone={f.severity === "CRITICAL" ? "red" : "amber"}>{f.severity}</Badge>
                      <div>
                        <span className="font-semibold">{f.check}</span> on table <span className="font-mono">{f.table}</span>: {f.detail}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>

        {/* Governed Reporting Statements (Skeleton with Epistemic Classification) */}
        <div className="grid gap-6 xl:grid-cols-2">
          {/* Trial Balance */}
          <Panel
            kicker="Reporting Engine"
            title="Trial Balance"
            action={<Badge tone={stateTone(tbReport.overallClass)}>{tbReport.overallClass}</Badge>}
          >
            <div className="space-y-3">
              <div className="text-[12px] beyu-muted">
                As of: <span className="font-mono">{tbReport.asOf}</span> · Currency: {tbReport.reportingCurrency ?? "Entity Base"} · Status: {tbReport.assurance}
              </div>
              {tbReport.lines.length > 0 ? (
                <table className="beyu-table">
                  <thead>
                    <tr><th>Account</th><th>Debit</th><th>Credit</th><th>Class</th></tr>
                  </thead>
                  <tbody>
                    {tbReport.lines.map((l, i) => (
                      <tr key={i}>
                        <td className="font-medium text-[12px]">{l.caption}</td>
                        <td className="tabular-nums">{l.debit ?? "—"}</td>
                        <td className="tabular-nums">{l.credit ?? "—"}</td>
                        <td><Badge tone="navy">{l.epistemicClass}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-[12px] p-3 rounded bg-slate-50 dark:bg-white/5 border border-[color:var(--beyu-line)] text-slate-600 dark:text-slate-400">
                  {tbReport.limitations.map((lim, idx) => (
                    <p key={idx} className="mb-1 last:mb-0">• {lim}</p>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          {/* Balance Sheet Skeleton */}
          <Panel
            kicker="Statement Skeleton"
            title="Balance Sheet (IFRS)"
            action={<Badge tone="amber">REQUIRES_AUTHORITY</Badge>}
          >
            <div className="space-y-3">
              <div className="text-[12px] beyu-muted">
                Captions defined; mapping requires ratified account classification policy (P1).
              </div>
              <div className="space-y-2">
                {bsReport.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded border border-[color:var(--beyu-line)] text-[12px]">
                    <span className="font-medium">{l.caption}</span>
                    <Badge tone="amber">{l.epistemicClass}</Badge>
                  </div>
                ))}
              </div>
              <div className="text-[11px] beyu-muted">
                Policy dependency: {bsReport.policyDependencies.join(", ")} (Group CFO ratification).
              </div>
            </div>
          </Panel>
        </div>

        {/* Governance Ratification & Blocker Tracking */}
        <Panel
          kicker="Governance Control Plane"
          title="Accounting Policy Decisions & Ratification Dependency Register"
          action={<Badge tone="amber">Pending CFO / ARB Ratification</Badge>}
        >
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Decision ID</th>
                  <th>Title</th>
                  <th>Required Authority</th>
                  <th>Activation Status</th>
                  <th>Acceptance Criteria</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d) => (
                  <tr key={d.decisionId}>
                    <td className="font-mono text-[11.5px] font-semibold">{d.decisionId}</td>
                    <td className="font-medium text-[12px]">
                      {d.title}
                      <div className="text-[11px] beyu-muted">{d.description}</div>
                    </td>
                    <td className="text-[11.5px]">{d.requiredAuthority}</td>
                    <td><Badge tone={stateTone(d.activationStatus)}>{d.activationStatus}</Badge></td>
                    <td className="text-[11px] beyu-muted max-w-xs">{d.acceptanceCriteria}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
