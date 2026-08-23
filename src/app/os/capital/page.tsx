import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { capitalRequests, legalEntities, resolutions, treasuryPositions } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { can } from "@/lib/authz";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { evaluatePolicy } from "@/lib/policy";
import { Badge, Denied, EmptyState, Metric, Panel, money, stateTone } from "@/components/brand";
import { capitalGovernanceAuthorizations } from "@/lib/governance-authorization";
import { capitalRequestsAwaitingGovernance } from "@/lib/capital-governance-service";
import { GovernanceAuthorizeButton } from "./governance-authorize-button";

export const dynamic = "force-dynamic";

export default async function CapitalPage() {
  const access = await requireAccess("finance:capital.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="finance:capital.read" />;
  const scope = await tenantScopeIds(access.principal); const tenantId = access.principal.tenantId;

  const [requests, treasury, entities, resolutionRows] = await Promise.all([
    db.select().from(capitalRequests).where(inArray(capitalRequests.tenantId, scope)).orderBy(capitalRequests.code),
    db.select().from(treasuryPositions).where(inArray(treasuryPositions.tenantId, scope)),
    db.select().from(legalEntities),
    db.select().from(resolutions).where(inArray(resolutions.tenantId, scope)),
  ]);

  /**
   * Read-only governance authorization signal, resolved server-side from the
   * persisted decision. It displays provenance only: it grants nothing, and the
   * page re-reads it from the database on every render rather than caching or
   * optimistically deriving it.
   */
  const govAuthorizations = await capitalGovernanceAuthorizations(
    access.principal,
    requests.map((r) => r.id),
  );

  /**
   * Which requests may still have their governance prerequisite recorded.
   * Server-resolved; the service re-verifies everything before mutating.
   */
  const awaitingGovernance = await capitalRequestsAwaitingGovernance(
    access.principal,
    requests.map((r) => r.id),
  );

  const canTreasury = can(access.principal, "finance:treasury.read").allowed;
  const entityName = (id: string) => entities.find((e) => e.id === id)?.legalName ?? id;

  // Governance requirement per request, resolved live from the policy engine.
  const governance = await Promise.all(
    requests.map(async (r) => ({
      id: r.id,
      evaluation: await evaluatePolicy({
        action: "finance:capital.manage",
        tenantId,
        roles: access.principal.roles,
        amount: Number(r.amount),
        jurisdictionCode: entities.find((e) => e.id === r.legalEntityId)?.countryCode,
      }),
    })),
  );

  const totalLiquidity = treasury.reduce((a, t) => a + Number(t.baseCurrencyBalance), 0);
  const approved = requests.filter((r) => r.status === "APPROVED").reduce((a, r) => a + Number(r.amount), 0);
  const pending = requests.filter((r) => ["SUBMITTED", "UNDER_REVIEW"].includes(r.status));

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Finance OS · capital & treasury</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Capital allocation & liquidity</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          Capital decisions are governed by approval authority thresholds. Finance OS remains authoritative
          for all financial consequences; the approval requirement below is computed live by the policy engine.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Consolidated liquidity" value={canTreasury ? money(totalLiquidity, "USD") : "Restricted"} tone="gold" sub={canTreasury ? `${treasury.length} positions` : "finance:treasury.read required"} />
        <Metric label="Approved commitments" value={money(approved, "USD")} sub="must be funded before distributions" />
        <Metric label="Pending decisions" value={String(pending.length)} sub="awaiting committee or board" />
        <Metric label="Requests in pipeline" value={String(requests.length)} sub="all statuses" />
      </div>

      <Panel kicker="Capital management" title="Investment proposals, capex, opex and financing">
        <div className="overflow-x-auto">
          <table className="beyu-table">
            <thead>
              <tr>
                <th>Code</th><th>Request</th><th>Entity</th><th>Type</th><th>Amount</th>
                <th>IRR / NPV</th><th>Payback</th><th>Risk-adj.</th><th>Governance required</th><th>Governance authority</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const g = governance.find((x) => x.id === r.id)?.evaluation;
                const res = resolutionRows.find((x) => x.id === r.resolutionId);
                return (
                  <tr key={r.id}>
                    <td className="font-mono text-[11.5px]">{r.code}</td>
                    <td className="font-medium">{r.title}
                      {res && <div className="text-[11px] beyu-muted">linked {res.reference} ({res.status})</div>}
                    </td>
                    <td className="text-[11.5px]">{entityName(r.legalEntityId)}</td>
                    <td><Badge tone="navy">{r.requestType}</Badge></td>
                    <td className="tabular-nums font-semibold">{money(r.amount, r.currency)}</td>
                    <td className="tabular-nums text-[11.5px]">
                      {r.expectedIrr ? `${(Number(r.expectedIrr) * 100).toFixed(1)}%` : "—"}
                      <div className="beyu-muted">{r.expectedNpv ? money(r.expectedNpv, r.currency) : "—"}</div>
                    </td>
                    <td className="tabular-nums text-[11.5px]">{r.paybackMonths ?? "—"}m</td>
                    <td className="tabular-nums text-[11.5px]">{r.riskAdjustedReturn ? `${(Number(r.riskAdjustedReturn) * 100).toFixed(1)}%` : "—"}<div className="beyu-muted">risk {r.riskScore}</div></td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {(g?.obligations ?? []).map((o, i) => (
                          <Badge key={i} tone="amber">{o.approverRole ?? o.type}</Badge>
                        ))}
                        {(g?.obligations ?? []).length === 0 && <span className="text-[11px] beyu-muted">delegated authority</span>}
                      </div>
                    </td>
                    <td>
                      {(() => {
                        const a = govAuthorizations.get(r.id);
                        if (!a || a.provenance === "NONE") {
                          return <span className="text-[11px] beyu-muted">no governing resolution</span>;
                        }
                        const satisfied = r.status === "GOVERNANCE_AUTHORIZED";
                        return (
                          <div className="text-[11px]">
                            <Badge tone={satisfied ? "green" : a.authorized ? "amber" : "slate"}>
                              {satisfied
                                ? "GOVERNANCE AUTHORIZED"
                                : a.authorized
                                  ? "GOVERNANCE SATISFIABLE"
                                  : `GOVERNANCE NOT SATISFIED (${a.decision})`}
                            </Badge>
                            <div className="beyu-muted mt-1">
                              {a.reference} · {a.governanceBodyCode}
                              {a.decidedAt ? ` · decided ${a.decidedAt.slice(0, 10)}` : ""}
                            </div>
                            {a.provenance === "REFERENCE_DATA" && (
                              <div className="beyu-muted">reference data — no ledger provenance</div>
                            )}
                            {satisfied && (
                              <div className="beyu-muted">Execution not performed.</div>
                            )}
                            {!satisfied && a.authorized && awaitingGovernance.has(r.id) && (
                              <GovernanceAuthorizeButton capitalRequestId={r.id} code={r.code} />
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td><Badge tone={stateTone(r.status)}>{r.status}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel kicker="Treasury" title="Cash positions by entity and currency">
        {canTreasury ? (
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Entity</th><th>Institution</th><th>Account</th><th>Type</th><th>Balance</th><th>Base (USD)</th><th>As of</th><th>Class</th></tr></thead>
              <tbody>
                {treasury.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium">{entityName(t.legalEntityId)}</td>
                    <td className="text-[11.5px]">{t.institution}</td>
                    <td className="text-[11.5px]">{t.accountLabel}</td>
                    <td className="text-[11.5px]">{t.accountType}</td>
                    <td className="tabular-nums">{money(t.balance, t.currency)}</td>
                    <td className="tabular-nums font-semibold">{money(t.baseCurrencyBalance, "USD")}</td>
                    <td className="text-[11.5px] beyu-muted">{t.asOf}</td>
                    <td><Badge tone={stateTone(t.classification)}>{t.classification}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="finance:treasury.read is not granted to your roles." />
        )}
      </Panel>
    </div>
  );
}
