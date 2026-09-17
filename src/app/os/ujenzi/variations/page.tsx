import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Panel, stateTone, money } from "@/components/brand";
import { UjenziSectionNav } from "../sections";

export const dynamic = "force-dynamic";

export default async function UjenziVariationsPage() {
  const access = await requireAccess("ujenzi:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="ujenzi:data.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const principal = access.principal;
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);
    const tenantId = principal.tenantId;
    const variationRows = await db
      .select()
      .from(s.ujenziVariations)
      .where(and(eq(s.ujenziVariations.tenantId, tenantId), inArray(s.ujenziVariations.classification, allowedClassifications)))
      .orderBy(desc(s.ujenziVariations.createdAt))
      .limit(40);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Ujenzi OS — variations</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Variation requests and change control</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">Submission, review, approval or rejection with explicit cost and schedule impact. Approval never mutates financial truth; it is an audited project-control decision (VARIATION_REQUESTED / VARIATION_APPROVED).</p>
        </header>

        <UjenziSectionNav current="/os/ujenzi/variations" />

        <Panel kicker="Register" title="Variation lifecycle">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Title</th>
                  <th>Cost impact</th>
                  <th>Schedule</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {variationRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11.5px]">{row.code}</td>
                    <td className="font-medium">{row.title}</td>
                    <td className="tabular-nums text-[11.5px]">{row.costImpact ? money(row.costImpact, row.currency) : "—"}</td>
                    <td className="tabular-nums text-[11.5px]">{row.scheduleImpactDays != null ? `${row.scheduleImpactDays}d` : "—"}</td>
                    <td>{<Badge tone={stateTone(row.status)}>{row.status}</Badge>}</td>
                  </tr>
                ))}
                {variationRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState message="No variations recorded yet." />
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
