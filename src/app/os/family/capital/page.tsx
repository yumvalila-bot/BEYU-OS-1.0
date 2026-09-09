import { inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  familyBalanceSheetSnapshots,
  familyCapitalAllocations,
  familyCommitteeDecisions,
  familyInvestments,
  familyLiquiditySnapshots,
  familyObligations,
  familyRegulatoryEvents,
  familyTaxPositions,
} from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { can } from "@/lib/authz";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import { FamilyTrustLogo } from "@/components/family-trust-logo";
import { listCommitteeDecisions, listInvestments } from "@/lib/family-office-capital-service";
import { validateCommitteeDecision } from "@/lib/family/office/capital-wealth";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Family Office — Capital Allocation, Wealth & Generational Wealth.
 *
 * A SUB-PAGE of the existing Family Office (`/os/family`), not a replacement for
 * it. Governance, lineage, beneficiaries and vaults stay where they are; this
 * surface adds the capital domain on top of the same principal, the same tenant
 * scope, the same RLS policies and the same design system.
 *
 * Every panel is gated independently by `can()`, so a user holding
 * `familyoffice:capital.read` but not `familyoffice:obligation.read` sees the balance sheet
 * and an explicit "grant required" in the obligation panel rather than an empty
 * table they cannot tell apart from "no obligations exist".
 */
export default async function FamilyCapitalPage() {
  const access = await requireAccess("familyoffice:capital.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="familyoffice:capital.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const scope = await tenantScopeIds(access.principal);
    const asOf = new Date().toISOString().slice(0, 10);

    const canObligation = can(access.principal, "familyoffice:obligation.read").allowed;
    const canInvestment = can(access.principal, "familyoffice:investment.read").allowed;
    const canCommittee = can(access.principal, "familyoffice:committee.read").allowed;
    const canLiquidity = can(access.principal, "familyoffice:liquidity.read").allowed;
    const canIntelligence = can(access.principal, "familyoffice:intelligence.read").allowed;
    const canRequest = can(access.principal, "familyoffice:capitalrequest.read").allowed;

    const [investments, obligations, allocations, decisions, balanceSheets, liquidity, regulatory, tax] = await Promise.all([
      canInvestment ? listInvestments(access.principal, asOf) : null,
      canObligation
        ? db.select().from(familyObligations).where(inArray(familyObligations.tenantId, scope))
        : null,
      canRequest
        ? db.select().from(familyCapitalAllocations).where(inArray(familyCapitalAllocations.tenantId, scope))
        : null,
      canCommittee ? listCommitteeDecisions(access.principal) : null,
      db.select().from(familyBalanceSheetSnapshots).where(inArray(familyBalanceSheetSnapshots.tenantId, scope)),
      canLiquidity
        ? db.select().from(familyLiquiditySnapshots).where(inArray(familyLiquiditySnapshots.tenantId, scope))
        : null,
      canIntelligence
        ? db.select().from(familyRegulatoryEvents).where(inArray(familyRegulatoryEvents.tenantId, scope))
        : null,
      canIntelligence
        ? db.select().from(familyTaxPositions).where(inArray(familyTaxPositions.tenantId, scope))
        : null,
    ]);

    /**
     * Re-validate every committee decision against the recorded votes. Quorum and
     * majority are recomputed here rather than trusted from a stored flag, so a
     * decision whose arithmetic does not hold is visible on the page that reports
     * it as approved.
     */
    const decisionRows = (decisions?.decisions ?? []).map((row) => {
      const votes = (row.members as { memberRef: string; role: string; position: string; dissentReason: string | null }[] | null) ?? [];
      const findings = validateCommitteeDecision({
        id: row.id,
        tenantId: row.tenantId,
        allocationId: row.allocationId ?? "",
        decision: row.decision as never,
        bodyRef: row.bodyRef,
        members: votes as never,
        quorumMinimum: row.quorumMinimum,
        majorityRule: row.majorityRule as never,
        date: row.decisionDate,
        reason: row.reason,
        conditions: (row.conditions as string[] | null) ?? [],
        followUps: (row.followUps as { action: string; ownerRef: string; dueDate: string }[] | null) ?? [],
        authorityRef: row.authorityRef,
        decidedByActorType: row.decidedByActorType as never,
        requesterRef: row.requesterRef,
        executorRef: row.executorRef,
        reconcilerRef: row.reconcilerRef,
      });
      return { row, votes, findings };
    });

    /** Money is stored as numeric(18,2) and rendered as a formatted decimal — never recomputed here. */
    const money = (value: string | null | undefined, currency: string) =>
      value === null || value === undefined ? "—" : `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

    /**
     * Engine measures are integer minor units, never floats. Dividing by 100 here
     * is for display only; the authoritative value stays an integer.
     */
    const minor = (valueMinor: number, currency: string) =>
      `${(valueMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

    /** Currencies present, so the page never implies a cross-currency total exists. */
    const obligationCurrencies = [...new Set((obligations ?? []).map((o) => o.currency))].sort();

    return (
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="beyu-kicker text-[#b08d1c]">
              Family office ·{" "}
              <Link href="/os/family" className="underline decoration-dotted underline-offset-2">
                governance, lineage &amp; vaults
              </Link>
            </div>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight">
              Capital allocation, wealth &amp; generational wealth
            </h1>
            <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
              The capital domain of the Family Office. Capital doctrine is policy, not instruction; every measure names
              its basis; and Finance OS remains the sole authority for accounting, posting and periods.
            </p>
          </div>
          <FamilyTrustLogo size={64} className="shrink-0" ariaLabel="BEYU Family Trust" />
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Investments in scope"
            value={canInvestment ? String(investments?.total ?? 0) : "Restricted"}
            sub={canInvestment ? `${new Set((investments?.investments ?? []).map((i) => i.currency)).size} currencies` : "familyoffice:investment.read required"}
          />
          <Metric
            label="Obligations recorded"
            value={canObligation ? String(obligations?.length ?? 0) : "Restricted"}
            sub={canObligation ? `${obligationCurrencies.length} currencies · per-currency only` : "familyoffice:obligation.read required"}
            tone="gold"
          />
          <Metric
            label="Capital allocation cases"
            value={canRequest ? String(allocations?.length ?? 0) : "Restricted"}
            sub={canRequest ? `${(allocations ?? []).filter((a) => a.status === "COMPLETE").length} complete` : "familyoffice:capitalrequest.read required"}
          />
          <Metric
            label="Committee decisions"
            value={canCommittee ? String(decisions?.total ?? 0) : "Restricted"}
            sub={canCommittee ? `${decisionRows.filter((d) => d.findings.length > 0).length} failing validation` : "familyoffice:committee.read required"}
            tone={canCommittee && decisionRows.some((d) => d.findings.length > 0) ? "red" : undefined}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel kicker="§13 · investment engine" title="Investments, measures & governance status">
            {canInvestment ? (
              <div className="overflow-x-auto">
                <table className="beyu-table">
                  <thead>
                    <tr>
                      <th>Investment</th>
                      <th>Type / class</th>
                      <th>Cost</th>
                      <th>Current value</th>
                      <th>Return</th>
                      <th>Governance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(investments?.investments ?? []).map((i) => (
                      <tr key={i.id}>
                        <td className="font-medium">
                          {i.name}
                          <div className="mt-0.5 text-[10.5px] beyu-muted">
                            {i.countryCode} · {i.liquidity}
                          </div>
                        </td>
                        <td className="text-[11.5px]">
                          {i.type}
                          <div className="text-[10.5px] beyu-muted">{i.assetClass}</div>
                        </td>
                        <td className="tabular-nums text-[11.5px]">{minor(i.acquisitionCostMinor, i.currency)}</td>
                        <td className="tabular-nums text-[11.5px]">
                          {/* Null before any mark exists. "Not marked" is not "worth zero". */}
                          {i.valuation ? minor(i.valuation.valueMinor, i.currency) : <span className="text-[10.5px] beyu-muted">not marked</span>}
                          <div className="text-[10.5px] beyu-muted">{i.valuation ? `${i.valuation.basis} · ${i.valuation.asOf}` : "no valuation on record"}</div>
                        </td>
                        <td className="tabular-nums text-[11.5px]">
                          {i.measures.roiBps === null ? "—" : `${(i.measures.roiBps / 100).toFixed(2)}%`}
                          <div className="text-[10.5px] beyu-muted">
                            {i.measures.irrBps === null ? "IRR n/a" : `IRR ${(i.measures.irrBps / 100).toFixed(2)}%`}
                          </div>
                        </td>
                        <td>
                          <Badge tone={stateTone(i.governanceStatus)}>{i.governanceStatus}</Badge>
                          {!i.committeeDecisionRef && i.governanceStatus !== "IDEA" && i.governanceStatus !== "SCREENING" && (
                            <div className="mt-0.5 text-[10.5px] text-[#b3261e]">no committee decision on record</div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(investments?.total ?? 0) === 0 && (
                      <tr>
                        <td colSpan={6}>
                          <EmptyState message="No investments recorded in scope." />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="familyoffice:investment.read is not granted to your roles." />
            )}
            <p className="mt-3 text-[11px] beyu-muted">
              Values here are Family Office measures, not accounting balances. An unrealised figure is marked with its
              valuation basis; nothing on this page is posted to the ledger.
            </p>
          </Panel>

          <Panel kicker="§21 · investment committee" title="Decisions, quorum & authority">
            {canCommittee ? (
              <div className="space-y-3">
                {decisionRows.map(({ row, votes, findings }) => (
                  <div key={row.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold">{row.bodyRef}</span>
                      <div className="flex gap-1">
                        <Badge tone={stateTone(row.decision)}>{row.decision}</Badge>
                        <Badge tone="navy">{row.majorityRule}</Badge>
                      </div>
                    </div>
                    <div className="mt-1 text-[11.5px] beyu-muted">
                      {row.decisionDate} · quorum ≥ {row.quorumMinimum} · {votes.length} vote(s) recorded
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {votes.map((v) => (
                        <Badge key={`${row.id}-${v.memberRef}`} tone={v.position === "FOR" ? "green" : v.position === "AGAINST" ? "red" : "navy"}>
                          {v.memberRef} · {v.position}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-1.5 text-[11px] beyu-muted">
                      authority: <span className="font-mono">{row.authorityRef ?? "NONE ON RECORD"}</span>
                    </div>
                    {findings.length > 0 && (
                      <div className="mt-2 rounded border border-[#f0c8c4] bg-[#fdf4f3] px-2 py-1.5">
                        <div className="text-[10.5px] font-semibold text-[#b3261e]">
                          This decision does not satisfy its own quorum and majority rules
                        </div>
                        <ul className="mt-1 list-disc pl-4 text-[10.5px] text-[#8a1c14]">
                          {findings.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
                {decisionRows.length === 0 && <EmptyState message="No committee decisions recorded." />}
              </div>
            ) : (
              <EmptyState message="familyoffice:committee.read is not granted to your roles." />
            )}
          </Panel>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="§8 · who owes whom" title="Obligation register">
            {canObligation ? (
              <div className="overflow-x-auto">
                <table className="beyu-table">
                  <thead>
                    <tr>
                      <th>Kind</th>
                      <th>Lender → borrower</th>
                      <th>Outstanding</th>
                      <th>Rate</th>
                      <th>Maturity</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(obligations ?? []).map((o) => (
                      <tr key={o.id}>
                        <td className="text-[11.5px]">
                          {o.kind}
                          <div className="text-[10.5px] beyu-muted">{o.direction}</div>
                        </td>
                        <td className="text-[11.5px]">
                          {o.lenderName} → {o.borrowerName}
                          <div className="text-[10.5px] beyu-muted">
                            {o.lenderCountryCode} → {o.borrowerCountryCode}
                          </div>
                        </td>
                        <td className="tabular-nums text-[11.5px]">{money(o.outstanding, o.currency)}</td>
                        <td className="tabular-nums text-[11.5px]">
                          {(Number(o.annualRateBps ?? 0) / 100).toFixed(2)}%
                          <div className="text-[10.5px] beyu-muted">{o.rateType}</div>
                        </td>
                        <td className="text-[11.5px]">{o.maturityDate ?? <span className="text-[#b3261e]">not recorded</span>}</td>
                        <td>
                          <Badge tone={stateTone(o.status)}>{o.status}</Badge>
                        </td>
                      </tr>
                    ))}
                    {(obligations ?? []).length === 0 && (
                      <tr>
                        <td colSpan={6}>
                          <EmptyState message="No obligations recorded in scope." />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="familyoffice:obligation.read is not granted to your roles." />
            )}
            <p className="mt-3 text-[11px] beyu-muted">
              Totals are per currency. No cross-currency total is produced, because no FX rate has been ratified.
            </p>
          </Panel>

          <Panel kicker="§10 · allocation workflow" title="Capital requests & segregation of duties">
            {canRequest ? (
              <div className="space-y-2">
                {(allocations ?? []).map((a) => {
                  /** §39: requester, approver, executor and reconciler must be four distinct parties. */
                  const overlap = a.requesterRef && a.requesterRef === a.executorRef;
                  return (
                    <div key={a.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[12.5px] font-semibold">{a.title}</span>
                        <div className="flex gap-1">
                          <Badge tone={stateTone(a.status)}>{a.status}</Badge>
                          <Badge tone="gold">{a.currency}</Badge>
                        </div>
                      </div>
                      <div className="mt-1 text-[11.5px] beyu-muted">
                        {money(a.amount, a.currency)} · {a.countryCode} · step {(a.currentStepIndex ?? 0) + 1}
                      </div>
                      <div className="mt-1 text-[11px] beyu-muted">
                        requester <span className="font-mono">{a.requesterRef ?? "—"}</span> · executor{" "}
                        <span className="font-mono">{a.executorRef ?? "—"}</span> · reconciler{" "}
                        <span className="font-mono">{a.reconcilerRef ?? "—"}</span>
                      </div>
                      {overlap && (
                        <div className="mt-1.5 text-[10.5px] font-semibold text-[#b3261e]">
                          Segregation breach: requester and executor are the same party
                          {a.segregationWaivedByPolicy ? " (waived by policy)" : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
                {(allocations ?? []).length === 0 && <EmptyState message="No capital allocation cases in scope." />}
              </div>
            ) : (
              <EmptyState message="familyoffice:capitalrequest.read is not granted to your roles." />
            )}
          </Panel>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          <Panel kicker="§15 · balance sheet" title="Stored snapshots">
            <div className="space-y-2">
              {balanceSheets.map((b) => (
                <div key={b.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold">{b.asOf}</span>
                    <Badge tone="gold">{b.currency}</Badge>
                  </div>
                  <div className="mt-1 text-[11.5px] beyu-muted">
                    assets {money(b.totalAssets, b.currency)} · liabilities {money(b.totalLiabilities, b.currency)}
                  </div>
                  <div className="mt-0.5 text-[11.5px]">net worth {money(b.netWorth, b.currency)}</div>
                </div>
              ))}
              {balanceSheets.length === 0 && <EmptyState message="No balance-sheet snapshot stored yet." />}
            </div>
            <p className="mt-3 text-[11px] beyu-muted">
              A computed balance sheet needs Finance OS balances and is produced on demand through the API. Absent a
              snapshot this panel is empty — it is not zero.
            </p>
          </Panel>

          <Panel kicker="§19 · liquidity" title="Stored projections">
            {canLiquidity ? (
              <div className="space-y-2">
                {liquidity?.map((l) => (
                  <div key={l.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold">{l.asOf}</span>
                      <Badge tone="gold">{l.currency}</Badge>
                    </div>
                    <div className="mt-1 text-[11.5px] beyu-muted">
                      liquid {money(l.liquid, l.currency)} · near-liquid {money(l.nearLiquid, l.currency)}
                    </div>
                  </div>
                ))}
                {(liquidity ?? []).length === 0 && <EmptyState message="No liquidity projection stored yet." />}
              </div>
            ) : (
              <EmptyState message="familyoffice:liquidity.read is not granted to your roles." />
            )}
          </Panel>

          <Panel kicker="§24 / §25 · intelligence" title="Regulatory & tax positions">
            {canIntelligence ? (
              <div className="space-y-3">
                <div>
                  <div className="beyu-kicker beyu-muted">Regulatory &amp; market events</div>
                  <div className="mt-1 space-y-1.5">
                    {(regulatory ?? []).map((e) => (
                      <div key={e.id} className="text-[11.5px]">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="font-medium">{e.title}</span>
                          <Badge tone={stateTone(e.classification)}>{e.classification}</Badge>
                          <Badge tone="navy">{e.confidence}</Badge>
                        </div>
                        <div className="text-[10.5px] beyu-muted">
                          {e.eventDate} · {e.jurisdictionRef} · {e.source}
                        </div>
                      </div>
                    ))}
                    {(regulatory ?? []).length === 0 && <EmptyState message="No intelligence recorded." />}
                  </div>
                </div>
                <div>
                  <div className="beyu-kicker beyu-muted">Tax positions</div>
                  <div className="mt-1 space-y-1.5">
                    {(tax ?? []).map((t) => (
                      <div key={t.id} className="text-[11.5px]">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="font-medium">{t.taxType}</span>
                          <Badge tone={t.level === "FINAL_ACCOUNTING_TREATMENT" ? "green" : "gold"}>{t.level}</Badge>
                        </div>
                        <div className="text-[10.5px] beyu-muted">
                          {t.jurisdictionRef} · {money(t.amount, t.currency)}
                          {t.professionalReviewRef ? "" : " · NOT professionally reviewed"}
                        </div>
                      </div>
                    ))}
                    {(tax ?? []).length === 0 && <EmptyState message="No tax positions recorded." />}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState message="familyoffice:intelligence.read is not granted to your roles." />
            )}
          </Panel>
        </div>

        <div className="rounded-lg border border-[color:var(--beyu-line)] bg-[color:var(--beyu-surface-2,#faf9f7)] px-4 py-3">
          <div className="beyu-kicker text-[#b08d1c]">Boundaries this surface respects</div>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[11.5px] beyu-muted">
            <li>
              Capital doctrine (CAP-001…CAP-015) is recorded as policy principles. Nothing on this page issues an
              automatic instruction to buy, sell or hold.
            </li>
            <li>
              Finance OS remains the single authority for accounting, journals, posting, periods, reconciliation and
              statements. Family Office measures are analytical and link to the ledger by reference.
            </li>
            <li>
              Financing models (wrap, lease-purchase, seller financing) are models only. None is presented as an
              executed legal transaction.
            </li>
            <li>
              Noelia may analyze, calculate, summarize, simulate, recommend, alert and draft over this data. It may not
              approve, transfer, execute, change ownership, bypass a governance step or post to the ledger.
            </li>
            <li>Every scenario is labelled SCENARIO and carries its assumptions. No projection is guaranteed.</li>
          </ul>
        </div>
      </div>
    );
  });
}
