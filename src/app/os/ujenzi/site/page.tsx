import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Panel, stateTone } from "@/components/brand";
import { UjenziSectionNav } from "../sections";

export const dynamic = "force-dynamic";

export default async function UjenziSitePage() {
  const access = await requireAccess("ujenzi:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="ujenzi:data.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const principal = access.principal;
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);
    const tenantId = principal.tenantId;
    const diaryRows = await db
      .select()
      .from(s.ujenziSiteDiaries)
      .where(and(eq(s.ujenziSiteDiaries.tenantId, tenantId), inArray(s.ujenziSiteDiaries.classification, allowedClassifications)))
      .orderBy(desc(s.ujenziSiteDiaries.diaryDate))
      .limit(40);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Ujenzi OS — site operations</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Daily site diaries</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">Append-only daily records of weather, labour and work executed. Labour is recorded as operational counts and hours — worker identity remains canonical in BEYU HCM, never duplicated here.</p>
        </header>

        <UjenziSectionNav current="/os/ujenzi/site" />

        <Panel kicker="Diaries" title="Most recent daily records">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Weather</th>
                  <th>Labour</th>
                  <th>Hours</th>
                  <th>Work done</th>
                </tr>
              </thead>
              <tbody>
                {diaryRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11.5px]">{row.diaryDate}</td>
                    <td>{row.weather ?? "—"}</td>
                    <td className="tabular-nums text-[11.5px]">{row.labourCount ?? "—"}</td>
                    <td className="tabular-nums text-[11.5px]">{row.labourHours ?? "—"}</td>
                    <td className="text-[11.5px]">{row.workDone?.slice(0, 60) ?? "—"}</td>
                  </tr>
                ))}
                {diaryRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState message="No site diaries recorded yet. Recording a diary emits SITE_PROGRESS_RECORDED." />
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
