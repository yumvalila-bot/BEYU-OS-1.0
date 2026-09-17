import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Panel, stateTone } from "@/components/brand";
import { UjenziSectionNav } from "../sections";

export const dynamic = "force-dynamic";

export default async function UjenziHandoverPage() {
  const access = await requireAccess("ujenzi:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="ujenzi:data.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const principal = access.principal;
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);
    const tenantId = principal.tenantId;
    const [punchRows, projectRows] = await Promise.all([
      db.select().from(s.ujenziPunchItems).where(and(eq(s.ujenziPunchItems.tenantId, tenantId), inArray(s.ujenziPunchItems.classification, allowedClassifications))).orderBy(desc(s.ujenziPunchItems.createdAt)).limit(40),
      db.select().from(s.ujenziProjects).where(and(eq(s.ujenziProjects.tenantId, tenantId), inArray(s.ujenziProjects.classification, allowedClassifications))).orderBy(desc(s.ujenziProjects.updatedAt)).limit(20),
    ]);
    const openPunch = punchRows.filter((p) => p.status === "OPEN" || p.status === "IN_PROGRESS").length;
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Ujenzi OS — handover</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Handover and punch lists</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">Completion readiness: punch items must be closed before a project can be handed over. Handover is a governed, audited transition (PROJECT_HANDED_OVER) — never a silent status edit.</p>
        </header>

        <UjenziSectionNav current="/os/ujenzi/handover" />

        <Panel kicker="Readiness" title="Handover status by project">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {projectRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11.5px]">{row.code}</td>
                    <td className="font-medium">{row.name}</td>
                    <td>
                      <Badge tone={stateTone(row.status)}>{row.status}</Badge>
                    </td>
                  </tr>
                ))}
                {projectRows.length === 0 && (
                  <tr>
                    <td colSpan={3}>
                      <EmptyState message="No projects yet." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Punch list" title="Outstanding and closed items">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {punchRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11.5px]">{row.code}</td>
                    <td className="font-medium">{row.description.slice(0, 60)}</td>
                    <td className="text-[11.5px]">{row.category ?? "—"}</td>
                    <td>{<Badge tone={stateTone(row.status)}>{row.status}</Badge>}</td>
                  </tr>
                ))}
                {punchRows.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState message="No punch items recorded." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Gate" title="Handover is blocked while punch items remain open">
          <p className="text-[12.5px] beyu-muted">
            {openPunch} punch item(s) remain open across the tenant. The governed handover transition
            (POST /api/v1/ujenzi/projects/&lt;id&gt;/handover) refuses to complete while any punch item is OPEN or
            IN_PROGRESS, and emits PROJECT_HANDED_OVER only when it succeeds.
          </p>
        </Panel>
      </div>
    );
  });
}
