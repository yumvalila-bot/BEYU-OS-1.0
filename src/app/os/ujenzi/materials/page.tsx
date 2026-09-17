import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Panel, stateTone, money } from "@/components/brand";
import { UjenziSectionNav } from "../sections";

export const dynamic = "force-dynamic";

export default async function UjenziMaterialsPage() {
  const access = await requireAccess("ujenzi:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="ujenzi:data.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const principal = access.principal;
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);
    const tenantId = principal.tenantId;
    const [catalogRows, movementRows] = await Promise.all([
      db.select().from(s.ujenziMaterialCatalog).where(and(eq(s.ujenziMaterialCatalog.tenantId, tenantId), inArray(s.ujenziMaterialCatalog.classification, allowedClassifications))).orderBy(desc(s.ujenziMaterialCatalog.createdAt)).limit(30),
      db.select().from(s.ujenziMaterialMovements).where(and(eq(s.ujenziMaterialMovements.tenantId, tenantId), inArray(s.ujenziMaterialMovements.classification, allowedClassifications))).orderBy(desc(s.ujenziMaterialMovements.createdAt)).limit(40),
    ]);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Ujenzi OS — materials</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Materials catalog and movements</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">Tenant-owned material catalog with receipts, issues, returns and wastage attributed to projects and sites. Stock is derived from governed movement history, not asserted.</p>
        </header>

        <UjenziSectionNav current="/os/ujenzi/materials" />

        <Panel kicker="Catalog" title="Material master for this tenant">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {catalogRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11.5px]">{row.code}</td>
                    <td className="font-medium">{row.name}</td>
                    <td className="text-[11.5px]">{row.category ?? "—"}</td>
                    <td className="text-[11.5px]">{row.unit}</td>
                  </tr>
                ))}
                {catalogRows.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState message="No materials in the catalog yet." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Movements" title="Receipts, issues, returns and wastage">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Quantity</th>
                  <th>Unit cost</th>
                  <th>Reference</th>
                  <th>Moved on</th>
                </tr>
              </thead>
              <tbody>
                {movementRows.map((row) => (
                  <tr key={row.id}>
                    <td>{<Badge tone={stateTone(row.movementType)}>{row.movementType}</Badge>}</td>
                    <td className="tabular-nums text-[11.5px]">{Number(row.quantity).toLocaleString("en-US")}</td>
                    <td className="tabular-nums text-[11.5px]">{row.unitCost ? money(row.unitCost, "TZS", 2) : "—"}</td>
                    <td className="text-[11.5px]">{row.reference ?? "—"}</td>
                    <td className="text-[11.5px]">{row.movedOn ?? "—"}</td>
                  </tr>
                ))}
                {movementRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState message="No movements recorded yet. RECEIPT movements emit MATERIAL_RECEIVED." />
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
