import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Panel, stateTone, money } from "@/components/brand";
import { UjenziSectionNav } from "../sections";

export const dynamic = "force-dynamic";

export default async function UjenziBoqCostPage() {
  const access = await requireAccess("ujenzi:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="ujenzi:data.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const principal = access.principal;
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);
    const tenantId = principal.tenantId;
    const [boqRows, costRows] = await Promise.all([
      db.select().from(s.ujenziBoqs).where(and(eq(s.ujenziBoqs.tenantId, tenantId), inArray(s.ujenziBoqs.classification, allowedClassifications))).orderBy(desc(s.ujenziBoqs.updatedAt)).limit(30),
      db.select().from(s.ujenziCostRecords).where(and(eq(s.ujenziCostRecords.tenantId, tenantId), inArray(s.ujenziCostRecords.classification, allowedClassifications))).orderBy(desc(s.ujenziCostRecords.createdAt)).limit(30),
    ]);
    const kinds = ["ESTIMATE", "BUDGET", "COMMITTED", "ACTUAL", "FORECAST"] as const;
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Ujenzi OS — BOQ &amp; cost</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Bills of quantities and cost control</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">Governed BOQ versioning with approval and supersession, plus the ESTIMATE / BUDGET / COMMITTED / ACTUAL / FORECAST cost distinction. Historical project-control records are never overwritten; Finance OS remains the canonical financial truth.</p>
        </header>

        <UjenziSectionNav current="/os/ujenzi/boq-cost" />

        <Panel kicker="Cost position" title="Five kinds of project-control cost, never mixed">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Records</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {kinds.map((kind) => {
                  const rows = costRows.filter((r) => r.kind === kind);
                  const total = rows.reduce((acc, r) => acc + Number(r.amount), 0);
                  return (
                    <tr key={kind}>
                      <td className="font-semibold">{kind}</td>
                      <td className="tabular-nums text-[11.5px]">{rows.length}</td>
                      <td className="tabular-nums">{total.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="BOQ versions" title="Versioned bills of quantities">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Approved</th>
                </tr>
              </thead>
              <tbody>
                {boqRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11.5px]">{row.projectId.slice(0, 14) + "…"}</td>
                    <td>{`v${row.version}`}</td>
                    <td>{<Badge tone={stateTone(row.status)}>{row.status}</Badge>}</td>
                    <td className="tabular-nums text-[11.5px]">{row.totalValue ? money(row.totalValue, row.currency) : "—"}</td>
                    <td className="text-[11.5px]">{row.approvedAt ? row.approvedAt.toISOString().slice(0, 10) : "—"}</td>
                  </tr>
                ))}
                {boqRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState message="No BOQ versions yet. Create one with POST /api/v1/ujenzi/boqs, add items, then approve it." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Cost records" title="Recent cost lines">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Amount</th>
                  <th>Cost code</th>
                  <th>Description</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {costRows.map((row) => (
                  <tr key={row.id}>
                    <td>{<Badge tone="slate">{row.kind}</Badge>}</td>
                    <td className="tabular-nums text-[11.5px]">{money(row.amount, row.currency)}</td>
                    <td className="font-mono text-[11.5px]">{row.costCode ?? "—"}</td>
                    <td className="text-[11.5px]">{row.description ?? "—"}</td>
                    <td className="text-[11.5px]">{row.eventDate ?? "—"}</td>
                  </tr>
                ))}
                {costRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState message="No cost records yet." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
