import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Panel, stateTone } from "@/components/brand";
import { UjenziSectionNav } from "../sections";

export const dynamic = "force-dynamic";

export default async function UjenziEquipmentPage() {
  const access = await requireAccess("ujenzi:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="ujenzi:data.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const principal = access.principal;
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);
    const tenantId = principal.tenantId;
    const [equipmentRows, allocationRows] = await Promise.all([
      db.select().from(s.ujenziEquipment).where(and(eq(s.ujenziEquipment.tenantId, tenantId), inArray(s.ujenziEquipment.classification, allowedClassifications))).orderBy(desc(s.ujenziEquipment.createdAt)).limit(30),
      db.select().from(s.ujenziEquipmentAllocations).where(and(eq(s.ujenziEquipmentAllocations.tenantId, tenantId), inArray(s.ujenziEquipmentAllocations.classification, allowedClassifications))).orderBy(desc(s.ujenziEquipmentAllocations.createdAt)).limit(30),
    ]);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Ujenzi OS — equipment</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Equipment register and allocations</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">Owned, leased and hired plant with project allocations. Operating-hour ledgers and maintenance scheduling are a documented follow-on capability, not a fabricated metric.</p>
        </header>

        <UjenziSectionNav current="/os/ujenzi/equipment" />

        <Panel kicker="Register" title="Plant and equipment">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Ownership</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {equipmentRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11.5px]">{row.code}</td>
                    <td className="font-medium">{row.name}</td>
                    <td className="text-[11.5px]">{row.equipmentType ?? "—"}</td>
                    <td>{row.ownership}</td>
                    <td>{<Badge tone={stateTone(row.status)}>{row.status}</Badge>}</td>
                  </tr>
                ))}
                {equipmentRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState message="No equipment registered yet." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Allocations" title="Equipment on projects">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Project</th>
                  <th>From</th>
                  <th>To</th>
                </tr>
              </thead>
              <tbody>
                {allocationRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11.5px]">{row.equipmentId.slice(0, 14) + "…"}</td>
                    <td className="font-mono text-[11.5px]">{row.projectId.slice(0, 14) + "…"}</td>
                    <td className="text-[11.5px]">{row.allocatedFrom ?? "—"}</td>
                    <td className="text-[11.5px]">{row.allocatedTo ?? "—"}</td>
                  </tr>
                ))}
                {allocationRows.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState message="No allocations recorded yet." />
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
