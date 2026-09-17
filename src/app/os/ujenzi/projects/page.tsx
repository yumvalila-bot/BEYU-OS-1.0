import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Panel, stateTone, money } from "@/components/brand";
import { UjenziSectionNav } from "../sections";

export const dynamic = "force-dynamic";

export default async function UjenziProjectsPage() {
  const access = await requireAccess("ujenzi:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="ujenzi:data.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const principal = access.principal;
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);
    const rows = await db
      .select()
      .from(s.ujenziProjects)
      .where(
        and(
          eq(s.ujenziProjects.tenantId, principal.tenantId),
          inArray(s.ujenziProjects.classification, allowedClassifications),
        ),
      )
      .orderBy(desc(s.ujenziProjects.createdAt));

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Ujenzi OS — projects</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Construction project register</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Every project is tenant-owned, entity-bound and country-bound. Open a project for its governed
            workspace: financials, BOQ, procurement, quality, HSE, variations, claims, payments and handover.
          </p>
        </header>

        <UjenziSectionNav current="/os/ujenzi/projects" />

        <Panel kicker="Register" title={`${rows.length} project(s)`}>
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Client</th>
                  <th>Country</th>
                  <th>Contract value</th>
                  <th>Start</th>
                  <th>Status</th>
                  <th>Class</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono text-[11.5px]">
                      <Link href={`/os/ujenzi/projects/${p.id}`} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017]">
                        {p.code}
                      </Link>
                    </td>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-[11.5px]">{p.client ?? "—"}</td>
                    <td className="text-[11.5px]">{p.countryCode}</td>
                    <td className="tabular-nums text-[11.5px]">{p.contractValue ? money(p.contractValue, p.currency) : "—"}</td>
                    <td className="text-[11.5px]">{p.startDate ?? "—"}</td>
                    <td>
                      <Badge tone={stateTone(p.status)}>{p.status}</Badge>
                    </td>
                    <td>
                      <Badge tone="slate">{p.classification}</Badge>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState message="No projects yet. Projects are created through the governed POST /api/v1/ujenzi/projects endpoint." />
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
