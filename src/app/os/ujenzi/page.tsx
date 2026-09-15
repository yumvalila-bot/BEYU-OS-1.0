import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ujenziEngineeringCalculations, ujenziHseIncidents, ujenziProjects, ujenziSoilTests } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { ujenziDashboard } from "@/lib/ujenzi";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function UjenziPage() {
  const access = await requireAccess("ujenzi:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="ujenzi:data.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const tenantId = access.principal.tenantId;
    const dash = await ujenziDashboard(tenantId);
    const [projectRows, calcRows, soilRows, hseRows] = await Promise.all([
      db.select().from(ujenziProjects).where(eq(ujenziProjects.tenantId, tenantId)).orderBy(desc(ujenziProjects.createdAt)).limit(20),
      db.select().from(ujenziEngineeringCalculations).where(eq(ujenziEngineeringCalculations.tenantId, tenantId)).limit(20),
      db.select().from(ujenziSoilTests).where(eq(ujenziSoilTests.tenantId, tenantId)).limit(20),
      db.select().from(ujenziHseIncidents).where(eq(ujenziHseIncidents.tenantId, tenantId)).limit(20),
    ]);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Ujenzi OS — one construction Sector OS under BEYU OS</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Command centre — projects, engineering, site</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            BEYU Ujenzi OS is ONE Sector OS. Design, engineering, BIM, BOQ, procurement, labour pool, HSE and
            Vision 2050 alignment are capabilities inside Ujenzi, not inner operating systems. Finance OS remains
            the journal. CAP_POSTING is LOCKED. Calculations are not professional certification. Soil records never
            invent field results. Government remains authoritative.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Projects" value={String(dash.projects)} sub="tenant-isolated construction records" tone="gold" />
          <Metric label="Calculations" value={String(dash.calculations)} sub="NOT certification" />
          <Metric label="Soil tests" value={String(dash.soilTests)} sub="DATA_REQUIRED if missing" />
          <Metric label="CAP_POSTING" value="LOCKED" sub="Finance OS remains the only journal writer" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="HSE incidents" value={String(dash.hseIncidents)} sub="operational safety, not enterprise risk" />
          <Metric label="Progress certs" value={String(dash.progressCertificates)} sub="handoff pending Finance" />
          <Metric label="Gov applications" value={String(dash.governmentApplications)} sub="NOT_CONNECTED until official" />
          <Metric label="Architecture" value="ONE SECTOR OS" sub="no inner operating systems" />
        </div>

        <Panel kicker="Projects" title="Registered construction projects">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Stage</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {projectRows.map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono text-[11.5px]">{p.code}</td>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-[11.5px]">{p.projectType}</td>
                    <td className="text-[11.5px]">{p.lifecycleStage}</td>
                    <td>
                      <Badge tone={stateTone(p.status)}>{p.status}</Badge>
                    </td>
                  </tr>
                ))}
                {projectRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState message="No Ujenzi projects in this tenant yet." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="Engineering" title="Calculations (decision support only)">
            <p className="mb-3 text-[11px] beyu-muted">
              Every result remains NOT_CERTIFIED until a human professional reviews and approves it.
            </p>
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Discipline</th>
                    <th>Status</th>
                    <th>Certification</th>
                  </tr>
                </thead>
                <tbody>
                  {calcRows.map((c) => (
                    <tr key={c.id}>
                      <td className="font-mono text-[11.5px]">{c.code}</td>
                      <td className="text-[11.5px]">{c.discipline}</td>
                      <td>
                        <Badge tone={stateTone(c.approvalState)}>{c.approvalState}</Badge>
                      </td>
                      <td className="text-[11.5px]">{c.professionalCertification}</td>
                    </tr>
                  ))}
                  {calcRows.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState message="No calculations recorded." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel kicker="Soil" title="Geotechnical records (never fabricated)">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Kind</th>
                    <th>Data status</th>
                    <th>Epistemic</th>
                  </tr>
                </thead>
                <tbody>
                  {soilRows.map((r) => (
                    <tr key={r.id}>
                      <td className="text-[11.5px]">{r.testKind}</td>
                      <td>
                        <Badge tone={stateTone(r.dataStatus)}>{r.dataStatus}</Badge>
                      </td>
                      <td className="text-[11.5px]">{r.epistemicStatus}</td>
                    </tr>
                  ))}
                  {soilRows.length === 0 && (
                    <tr>
                      <td colSpan={3}>
                        <EmptyState message="No soil tests. Missing data stays DATA_REQUIRED." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <Panel kicker="HSE" title="Incidents">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Title</th>
                  <th>Severity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {hseRows.map((h) => (
                  <tr key={h.id}>
                    <td className="font-mono text-[11.5px]">{h.code}</td>
                    <td className="text-[11.5px]">{h.title}</td>
                    <td className="text-[11.5px]">{h.severity}</td>
                    <td>
                      <Badge tone={stateTone(h.status)}>{h.status}</Badge>
                    </td>
                  </tr>
                ))}
                {hseRows.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState message="No HSE incidents." />
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
