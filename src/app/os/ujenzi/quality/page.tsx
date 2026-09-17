import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Panel, stateTone } from "@/components/brand";
import { UjenziSectionNav } from "../sections";

export const dynamic = "force-dynamic";

export default async function UjenziQualityPage() {
  const access = await requireAccess("ujenzi:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="ujenzi:data.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const principal = access.principal;
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);
    const tenantId = principal.tenantId;
    const [inspectionRows, ncrRows] = await Promise.all([
      db.select().from(s.ujenziInspectionRequests).where(and(eq(s.ujenziInspectionRequests.tenantId, tenantId), inArray(s.ujenziInspectionRequests.classification, allowedClassifications))).orderBy(desc(s.ujenziInspectionRequests.createdAt)).limit(30),
      db.select().from(s.ujenziNcrs).where(and(eq(s.ujenziNcrs.tenantId, tenantId), inArray(s.ujenziNcrs.classification, allowedClassifications))).orderBy(desc(s.ujenziNcrs.createdAt)).limit(30),
    ]);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Ujenzi OS — quality</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Inspection requests and non-conformance reports</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">Every quality record is attributable to a project, tenant and user with timestamps. NCR creation and closure are audited events; checklist and test libraries are a documented follow-on.</p>
        </header>

        <UjenziSectionNav current="/os/ujenzi/quality" />

        <Panel kicker="Inspection requests" title="Requested and completed inspections">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Requested for</th>
                  <th>Inspector</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {inspectionRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11.5px]">{row.code}</td>
                    <td className="text-[11.5px]">{row.inspectionType}</td>
                    <td className="text-[11.5px]">{row.requestedFor ?? "—"}</td>
                    <td className="text-[11.5px]">{row.inspector ?? "—"}</td>
                    <td>{<Badge tone={stateTone(row.result)}>{row.result}</Badge>}</td>
                  </tr>
                ))}
                {inspectionRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState message="No inspection requests yet. Recording a result emits QUALITY_INSPECTION_RECORDED." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="NCRs" title="Non-conformance reports">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Severity</th>
                  <th>Raised</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ncrRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11.5px]">{row.code}</td>
                    <td>{<Badge tone={stateTone(row.severity)}>{row.severity}</Badge>}</td>
                    <td className="text-[11.5px]">{row.raisedOn ?? "—"}</td>
                    <td className="text-[11.5px]">{row.dueDate ?? "—"}</td>
                    <td>{<Badge tone={stateTone(row.status)}>{row.status}</Badge>}</td>
                  </tr>
                ))}
                {ncrRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState message="No NCRs raised yet. Raising emits NCR_CREATED; closing emits NCR_CLOSED." />
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
