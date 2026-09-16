import { and, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contractRecords } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { tenantScopeIds, withTenantDatabaseContext } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const access = await requireAccess("contracts:read", { classification: "RESTRICTED" });
  if (!access.allowed) return <Denied reason={access.reason} capability="contracts:read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const tenantIds = await tenantScopeIds(access.principal);
    const contracts = await db
      .select({
        id: contractRecords.id,
        code: contractRecords.code,
        title: contractRecords.title,
        typeFamily: contractRecords.typeFamily,
        state: contractRecords.state,
        criticality: contractRecords.criticality,
        currencyCode: contractRecords.currencyCode,
        contractValue: contractRecords.contractValue,
        legalReviewStatus: contractRecords.legalReviewStatus,
        enforceabilityState: contractRecords.enforceabilityState,
        expiryDate: contractRecords.expiryDate,
        classification: contractRecords.classification,
      })
      .from(contractRecords)
      .where(
        and(
          inArray(contractRecords.tenantId, tenantIds),
          inArray(
            contractRecords.classification,
            classificationsAtOrBelow(access.principal.clearance),
          ),
          ...(access.principal.entityScope.length > 0
            ? [inArray(contractRecords.beyuEntityId, access.principal.entityScope)]
            : []),
        ),
      )
      .orderBy(desc(contractRecords.updatedAt))
      .limit(100);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Shared capability · Governed contracting</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Contract Lifecycle</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            One governed register for request, drafting, review, approval gates, execution, obligations,
            disputes, amendments and evidence anchors. Contract state never moves money, posts a journal or
            changes ownership.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Contracts" value={String(contracts.length)} sub="visible in authorized scope" tone="gold" />
          <Metric label="In review" value={String(contracts.filter((row) => row.state.includes("REVIEW")).length)} sub="human gates remain authoritative" />
          <Metric label="Executed" value={String(contracts.filter((row) => row.state === "EXECUTED").length)} sub="recorded lifecycle state" />
          <Metric label="Critical" value={String(contracts.filter((row) => row.criticality === "CRITICAL").length)} sub="requires heightened oversight" />
        </div>

        <Panel kicker="Authoritative register" title="Contracts in scope">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr><th>Contract</th><th>Family</th><th>Value</th><th>State</th><th>Legal review</th><th>Enforceability</th><th>Expiry</th></tr>
              </thead>
              <tbody>
                {contracts.map((row) => (
                  <tr key={row.id}>
                    <td><div className="font-medium">{row.title}</div><div className="font-mono text-[10.5px] beyu-muted">{row.code}</div></td>
                    <td className="text-[11.5px]">{row.typeFamily}</td>
                    <td className="tabular-nums text-[11.5px]">{row.contractValue && row.currencyCode ? `${row.contractValue} ${row.currencyCode}` : "—"}</td>
                    <td><Badge tone={stateTone(row.state)}>{row.state}</Badge></td>
                    <td><Badge tone={stateTone(row.legalReviewStatus)}>{row.legalReviewStatus}</Badge></td>
                    <td className="text-[11.5px]">{row.enforceabilityState}</td>
                    <td className="tabular-nums text-[11.5px]">{row.expiryDate ?? "—"}</td>
                  </tr>
                ))}
                {contracts.length === 0 && <tr><td colSpan={7}><EmptyState message="No contract records are visible within this tenant, entity and classification scope." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
