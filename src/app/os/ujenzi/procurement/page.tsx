import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Panel, stateTone, money } from "@/components/brand";
import { UjenziSectionNav } from "../sections";

export const dynamic = "force-dynamic";

export default async function UjenziProcurementPage() {
  const access = await requireAccess("ujenzi:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="ujenzi:data.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const principal = access.principal;
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);
    const tenantId = principal.tenantId;
    const [requisitionRows, poRows] = await Promise.all([
      db.select().from(s.ujenziRequisitions).where(and(eq(s.ujenziRequisitions.tenantId, tenantId), inArray(s.ujenziRequisitions.classification, allowedClassifications))).orderBy(desc(s.ujenziRequisitions.createdAt)).limit(30),
      db.select().from(s.ujenziPurchaseOrders).where(and(eq(s.ujenziPurchaseOrders.tenantId, tenantId), inArray(s.ujenziPurchaseOrders.classification, allowedClassifications))).orderBy(desc(s.ujenziPurchaseOrders.createdAt)).limit(30),
    ]);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Ujenzi OS — procurement</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Procurement lifecycle</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">Requirement → requisition → approval → purchase order → delivery. Every controlled transition is authorized, audited and never posts a journal; approved POs record a COMMITTED cost line for project control.</p>
        </header>

        <UjenziSectionNav current="/os/ujenzi/procurement" />

        <Panel kicker="Requisitions" title="Requirements awaiting or past approval">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Required by</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {requisitionRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11.5px]">{row.code}</td>
                    <td className="text-[11.5px]">{row.description.slice(0, 60)}</td>
                    <td className="text-[11.5px]">{row.requiredBy ?? "—"}</td>
                    <td>{<Badge tone={stateTone(row.status)}>{row.status}</Badge>}</td>
                  </tr>
                ))}
                {requisitionRows.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState message="No requisitions yet." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Purchase orders" title="Governed commitments">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Supplier</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Expected delivery</th>
                </tr>
              </thead>
              <tbody>
                {poRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11.5px]">{row.code}</td>
                    <td className="text-[11.5px]">{row.supplierName ?? "—"}</td>
                    <td className="tabular-nums text-[11.5px]">{row.amount ? money(row.amount, row.currency) : "—"}</td>
                    <td>{<Badge tone={stateTone(row.status)}>{row.status}</Badge>}</td>
                    <td className="text-[11.5px]">{row.expectedDelivery ?? "—"}</td>
                  </tr>
                ))}
                {poRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState message="No purchase orders yet." />
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
