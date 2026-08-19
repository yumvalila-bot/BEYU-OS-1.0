import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { employees, employmentEvents, legalEntities, parties, positions } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { classificationRank } from "@/lib/constants";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, money, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function HcmPage() {
  const access = await requireAccess("hcm:employee.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="hcm:employee.read" />;
  const scope = await tenantScopeIds(access.principal); const tenantId = access.principal.tenantId;

  const rows = await db
    .select({
      id: employees.id,
      employeeNo: employees.employeeNo,
      name: parties.displayName,
      entity: legalEntities.legalName,
      position: positions.title,
      grade: positions.grade,
      hireDate: employees.hireDate,
      status: employees.status,
      employmentType: employees.employmentType,
      country: employees.countryCode,
      salary: employees.baseSalary,
      currency: employees.salaryCurrency,
      classification: employees.classification,
      contractRef: employees.contractRef,
    })
    .from(employees)
    .innerJoin(parties, eq(parties.id, employees.partyId))
    .innerJoin(legalEntities, eq(legalEntities.id, employees.legalEntityId))
    .leftJoin(positions, eq(positions.id, employees.positionId))
    .where(inArray(employees.tenantId, scope))
    .orderBy(employees.employeeNo);

  const events = await db.select().from(employmentEvents).orderBy(employmentEvents.effectiveFrom);
  const positionRows = await db.select().from(positions).where(inArray(positions.tenantId, scope));

  const showCompensation = classificationRank(access.principal.clearance) >= classificationRank("RESTRICTED");
  const byEntity = new Map<string, number>();
  for (const r of rows) byEntity.set(r.entity, (byEntity.get(r.entity) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Human capital management</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">One employee master · one workforce lifecycle</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          HCM is the single source of truth for the workforce. Sector OSs consume governed HCM data and
          must not hold independent employee masters. Finance OS consumes authorised workforce outputs
          and remains authoritative for financial consequences.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Employee master records" value={String(rows.length)} sub="unique BEYU employee IDs" />
        <Metric label="Active" value={String(rows.filter((r) => r.status === "ACTIVE").length)} sub="lifecycle state ACTIVE" />
        <Metric label="Employing entities" value={String(byEntity.size)} sub={[...byEntity.keys()].slice(0, 2).join(", ")} />
        <Metric label="Positions" value={String(positionRows.length)} sub="budgeted establishment" />
      </div>

      <Panel kicker="360° workforce record" title="Employee master">
        <div className="overflow-x-auto">
          <table className="beyu-table">
            <thead>
              <tr>
                <th>Employee ID</th><th>Name</th><th>Employing entity</th><th>Position</th><th>Hired</th>
                <th>Type</th><th>Status</th>{showCompensation && <th>Base pay</th>}<th>Class</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-[11.5px]">{r.employeeNo}</td>
                  <td className="font-medium">{r.name}<div className="text-[11px] beyu-muted">{r.contractRef}</div></td>
                  <td className="text-[11.5px]">{r.entity}</td>
                  <td className="text-[11.5px]">{r.position ?? "—"}{r.grade ? ` · ${r.grade}` : ""}</td>
                  <td className="text-[11.5px] beyu-muted">{r.hireDate}</td>
                  <td className="text-[11.5px]">{r.employmentType}</td>
                  <td><Badge tone={stateTone(r.status)}>{r.status}</Badge></td>
                  {showCompensation && (
                    <td className="tabular-nums text-[11.5px]">{r.salary ? money(r.salary, r.currency ?? "USD") : "—"}</td>
                  )}
                  <td><Badge tone={stateTone(r.classification)}>{r.classification}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!showCompensation && (
          <p className="mt-3 text-[11px] beyu-muted">
            Compensation columns are suppressed: your clearance ({access.principal.clearance}) is below the
            RESTRICTED classification of pay data.
          </p>
        )}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel kicker="Lifecycle" title="Employment events (immutable history)">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Employee</th><th>Event</th><th>Effective</th><th>Approved by</th><th>Recorded by</th></tr></thead>
              <tbody>
                {events.map((e) => {
                  const emp = rows.find((r) => r.id === e.employeeId);
                  return (
                    <tr key={e.id}>
                      <td className="text-[11.5px]">{emp?.name ?? e.employeeId}</td>
                      <td><Badge tone="navy">{e.eventType}</Badge></td>
                      <td className="text-[11.5px] beyu-muted">{e.effectiveFrom}</td>
                      <td className="text-[11.5px]">{e.approvedBy ?? "—"}</td>
                      <td className="text-[11px] beyu-muted">{e.recordedBy}</td>
                    </tr>
                  );
                })}
                {events.length === 0 && <tr><td colSpan={5}><EmptyState message="No employment events." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Establishment" title="Positions & reporting lines">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Position</th><th>Grade</th><th>Job family</th><th>Reports to</th><th>Budget</th></tr></thead>
              <tbody>
                {positionRows.map((p) => (
                  <tr key={p.id}>
                    <td><div className="font-medium">{p.title}</div><div className="font-mono text-[10.5px] beyu-muted">{p.code}</div></td>
                    <td className="text-[11.5px]">{p.grade}</td>
                    <td className="text-[11.5px]">{p.jobFamily ?? "—"}</td>
                    <td className="text-[11.5px]">{positionRows.find((x) => x.id === p.reportsToPositionId)?.title ?? "—"}</td>
                    <td className="tabular-nums text-[11.5px]">{p.headcountBudget}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
