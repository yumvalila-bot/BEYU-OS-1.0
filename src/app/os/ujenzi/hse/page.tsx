import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Panel, stateTone } from "@/components/brand";
import { UjenziSectionNav } from "../sections";

export const dynamic = "force-dynamic";

export default async function UjenziHsePage() {
  const access = await requireAccess("ujenzi:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="ujenzi:data.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const principal = access.principal;
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);
    const tenantId = principal.tenantId;
    const [incidentRows, hazardRows, talkRows] = await Promise.all([
      db.select().from(s.ujenziHseIncidents).where(and(eq(s.ujenziHseIncidents.tenantId, tenantId), inArray(s.ujenziHseIncidents.classification, allowedClassifications))).orderBy(desc(s.ujenziHseIncidents.createdAt)).limit(30),
      db.select().from(s.ujenziHazardRegister).where(and(eq(s.ujenziHazardRegister.tenantId, tenantId), inArray(s.ujenziHazardRegister.classification, allowedClassifications))).orderBy(desc(s.ujenziHazardRegister.createdAt)).limit(30),
      db.select().from(s.ujenziToolboxTalks).where(and(eq(s.ujenziToolboxTalks.tenantId, tenantId), inArray(s.ujenziToolboxTalks.classification, allowedClassifications))).orderBy(desc(s.ujenziToolboxTalks.talkDate)).limit(20),
    ]);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Ujenzi OS — HSE</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Health, safety and environment</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">Incidents and near misses, hazard register and toolbox talks. Worker identity stays canonical in BEYU HCM/Identity; Ujenzi records operational safety evidence only.</p>
        </header>

        <UjenziSectionNav current="/os/ujenzi/hse" />

        <Panel kicker="Incidents" title="Incidents and near misses">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Occurred</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {incidentRows.map((row) => (
                  <tr key={row.id}>
                    <td className="text-[11.5px]">{row.occurredAt ?? "—"}</td>
                    <td>{row.incidentType}</td>
                    <td>{<Badge tone={stateTone(row.severity)}>{row.severity}</Badge>}</td>
                    <td>{<Badge tone={stateTone(row.status)}>{row.status}</Badge>}</td>
                    <td className="text-[11.5px]">{row.description.slice(0, 60)}</td>
                  </tr>
                ))}
                {incidentRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState message="No incidents recorded. Recording emits HSE_INCIDENT_RECORDED." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Hazard register" title="Identified hazards and mitigations">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Hazard</th>
                  <th>Risk</th>
                  <th>Mitigation</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {hazardRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium">{row.hazard.slice(0, 60)}</td>
                    <td>{<Badge tone={stateTone(row.riskLevel)}>{row.riskLevel}</Badge>}</td>
                    <td className="text-[11.5px]">{row.mitigation?.slice(0, 50) ?? "—"}</td>
                    <td>{<Badge tone={stateTone(row.status)}>{row.status}</Badge>}</td>
                  </tr>
                ))}
                {hazardRows.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState message="No hazards registered yet." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Toolbox talks" title="Safety briefings">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Topic</th>
                  <th>Attendees</th>
                </tr>
              </thead>
              <tbody>
                {talkRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11.5px]">{row.talkDate}</td>
                    <td className="font-medium">{row.topic}</td>
                    <td className="tabular-nums text-[11.5px]">{row.attendees ?? "—"}</td>
                  </tr>
                ))}
                {talkRows.length === 0 && (
                  <tr>
                    <td colSpan={3}>
                      <EmptyState message="No toolbox talks recorded yet." />
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
