import { and, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  blockchainAnchors,
  blockchainReconciliationRuns,
  smartContractRegistry,
} from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { tenantScopeIds, withTenantDatabaseContext } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function BlockchainPage() {
  const access = await requireAccess("blockchain:read", { classification: "RESTRICTED" });
  if (!access.allowed) return <Denied reason={access.reason} capability="blockchain:read" />;
  if (access.principal.entityScope.length > 0) {
    return (
      <Denied
        reason="Blockchain evidence rows do not all carry a canonical legal-entity key; tenant-wide evidence is refused under an entity-scoped grant."
        capability="blockchain:read"
      />
    );
  }

  return withTenantDatabaseContext(access.principal, async () => {
    const tenantIds = await tenantScopeIds(access.principal);
    const visibleClassifications = classificationsAtOrBelow(access.principal.clearance);
    const [registry, anchors, reconciliations] = await Promise.all([
      db
        .select()
        .from(smartContractRegistry)
        .where(
          and(
            inArray(smartContractRegistry.tenantId, tenantIds),
            inArray(smartContractRegistry.classification, visibleClassifications),
          ),
        )
        .orderBy(desc(smartContractRegistry.updatedAt))
        .limit(50),
      db
        .select()
        .from(blockchainAnchors)
        .where(
          and(
            inArray(blockchainAnchors.tenantId, tenantIds),
            inArray(blockchainAnchors.classification, visibleClassifications),
          ),
        )
        .orderBy(desc(blockchainAnchors.updatedAt))
        .limit(50),
      db
        .select()
        .from(blockchainReconciliationRuns)
        .where(
          and(
            inArray(blockchainReconciliationRuns.tenantId, tenantIds),
            inArray(blockchainReconciliationRuns.classification, visibleClassifications),
          ),
        )
        .orderBy(desc(blockchainReconciliationRuns.createdAt))
        .limit(50),
    ]);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Shared capability · Governed blockchain evidence</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Blockchain Registry & Evidence</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Smart-contract provenance, evidence anchors and read-only reconciliation beneath BEYU governance.
            On-chain data never grants authority, changes canonical records or becomes accounting truth.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Registry records" value={String(registry.length)} sub="governed references, not deployment keys" tone="gold" />
          <Metric label="Production networks" value={String(registry.filter((row) => row.networkProduction).length)} sub="heightened gates apply" />
          <Metric label="Evidence anchors" value={String(anchors.length)} sub="commitments in scope" />
          <Metric label="Reconciliation findings" value={String(reconciliations.reduce((total, row) => total + row.findingCount, 0))} sub="never silently overwrites either side" />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="Registry" title="Smart-contract records">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Name</th><th>Network</th><th>Status</th><th>Audit</th><th>Legal review</th></tr></thead>
                <tbody>
                  {registry.map((row) => (
                    <tr key={row.id}>
                      <td><div className="font-medium">{row.name}</div><div className="font-mono text-[10px] beyu-muted">{row.address ?? "address not recorded"}</div></td>
                      <td className="text-[11.5px]">{row.networkKey}</td>
                      <td><Badge tone={stateTone(row.status)}>{row.status}</Badge></td>
                      <td className="text-[11.5px]">{row.auditStatus ?? "—"}</td>
                      <td><Badge tone={stateTone(row.legalReviewStatus)}>{row.legalReviewStatus}</Badge></td>
                    </tr>
                  ))}
                  {registry.length === 0 && <tr><td colSpan={5}><EmptyState message="No smart-contract registry records are visible within scope." /></td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel kicker="Evidence" title="Anchored commitments">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Subject</th><th>Network</th><th>Status</th><th>Confirmations</th></tr></thead>
                <tbody>
                  {anchors.map((row) => (
                    <tr key={row.id}>
                      <td><div className="font-medium">{row.anchorType}</div><div className="font-mono text-[10px] beyu-muted">{row.subjectId}</div></td>
                      <td className="text-[11.5px]">{row.networkKey ?? "—"}</td>
                      <td><Badge tone={stateTone(row.status)}>{row.status}</Badge></td>
                      <td className="tabular-nums text-[11.5px]">{row.confirmations ?? "—"}</td>
                    </tr>
                  ))}
                  {anchors.length === 0 && <tr><td colSpan={4}><EmptyState message="No evidence anchors are visible within scope." /></td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <Panel kicker="Read-only comparison" title="Reconciliation runs">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Run</th><th>Network</th><th>Status</th><th>Findings</th><th>High severity</th><th>Mutates state</th></tr></thead>
              <tbody>
                {reconciliations.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11px]">{row.code}</td>
                    <td className="text-[11.5px]">{row.networkKey}</td>
                    <td><Badge tone={stateTone(row.status)}>{row.status}</Badge></td>
                    <td className="tabular-nums">{row.findingCount}</td>
                    <td className="tabular-nums">{row.highSeverityCount}</td>
                    <td><Badge tone={row.mutatesState ? "red" : "green"}>{row.mutatesState ? "YES" : "NO"}</Badge></td>
                  </tr>
                ))}
                {reconciliations.length === 0 && <tr><td colSpan={6}><EmptyState message="No blockchain reconciliation runs are visible within scope." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
