import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone, money } from "@/components/brand";
import { UjenziSectionNav } from "../../sections";

export const dynamic = "force-dynamic";

export default async function UjenziProjectWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await requireAccess("ujenzi:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="ujenzi:data.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const principal = access.principal;
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);
    const tenantId = principal.tenantId;

    // Cross-tenant or missing project IDs resolve to 404 — never a leak.
    const [project] = await db
      .select()
      .from(s.ujenziProjects)
      .where(and(eq(s.ujenziProjects.id, id), eq(s.ujenziProjects.tenantId, tenantId)))
      .limit(1);
    if (!project) notFound();

    const [
      siteRows,
      phaseRows,
      milestoneRows,
      boqRows,
      costRows,
      poRows,
      ncrRows,
      incidentRows,
      variationRows,
      claimRows,
      certificateRows,
      punchRows,
      inspectionRows,
    ] = await Promise.all([
      db.select().from(s.ujenziProjectSites).where(and(eq(s.ujenziProjectSites.tenantId, tenantId), eq(s.ujenziProjectSites.projectId, id))),
      db.select().from(s.ujenziProjectPhases).where(and(eq(s.ujenziProjectPhases.tenantId, tenantId), eq(s.ujenziProjectPhases.projectId, id))).orderBy(s.ujenziProjectPhases.code),
      db.select().from(s.ujenziMilestones).where(and(eq(s.ujenziMilestones.tenantId, tenantId), eq(s.ujenziMilestones.projectId, id))).orderBy(s.ujenziMilestones.dueDate),
      db.select().from(s.ujenziBoqs).where(and(eq(s.ujenziBoqs.tenantId, tenantId), eq(s.ujenziBoqs.projectId, id))).orderBy(desc(s.ujenziBoqs.version)),
      db.select().from(s.ujenziCostRecords).where(and(eq(s.ujenziCostRecords.tenantId, tenantId), eq(s.ujenziCostRecords.projectId, id))),
      db.select().from(s.ujenziPurchaseOrders).where(and(eq(s.ujenziPurchaseOrders.tenantId, tenantId), eq(s.ujenziPurchaseOrders.projectId, id))).orderBy(desc(s.ujenziPurchaseOrders.createdAt)).limit(10),
      db.select().from(s.ujenziNcrs).where(and(eq(s.ujenziNcrs.tenantId, tenantId), eq(s.ujenziNcrs.projectId, id))).orderBy(desc(s.ujenziNcrs.createdAt)).limit(10),
      db.select().from(s.ujenziHseIncidents).where(and(eq(s.ujenziHseIncidents.tenantId, tenantId), eq(s.ujenziHseIncidents.projectId, id))).orderBy(desc(s.ujenziHseIncidents.createdAt)).limit(10),
      db.select().from(s.ujenziVariations).where(and(eq(s.ujenziVariations.tenantId, tenantId), eq(s.ujenziVariations.projectId, id))).orderBy(desc(s.ujenziVariations.createdAt)).limit(10),
      db.select().from(s.ujenziClaims).where(and(eq(s.ujenziClaims.tenantId, tenantId), eq(s.ujenziClaims.projectId, id))).orderBy(desc(s.ujenziClaims.createdAt)).limit(10),
      db.select().from(s.ujenziPaymentCertificates).where(and(eq(s.ujenziPaymentCertificates.tenantId, tenantId), eq(s.ujenziPaymentCertificates.projectId, id))).orderBy(desc(s.ujenziPaymentCertificates.certificateNo)),
      db.select().from(s.ujenziPunchItems).where(and(eq(s.ujenziPunchItems.tenantId, tenantId), eq(s.ujenziPunchItems.projectId, id))).orderBy(desc(s.ujenziPunchItems.createdAt)).limit(10),
      db.select().from(s.ujenziInspectionRequests).where(and(eq(s.ujenziInspectionRequests.tenantId, tenantId), eq(s.ujenziInspectionRequests.projectId, id))).orderBy(desc(s.ujenziInspectionRequests.createdAt)).limit(10),
    ]);

    const costByKind = new Map(costRows.map((r) => [r.kind, r]));
    const sum = (kind: string) =>
      costRows.filter((r) => r.kind === kind).reduce((acc, r) => acc + Number(r.amount), 0);
    const approvedBoq = boqRows.find((b) => b.status === "APPROVED") ?? null;
    const openPunch = punchRows.filter((p) => p.status === "OPEN" || p.status === "IN_PROGRESS").length;
    const openNcr = ncrRows.filter((n) => n.status !== "CLOSED").length;

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">
            <Link href="/os/ujenzi/projects" className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017]">
              Ujenzi OS — projects
            </Link>{" "}
            / {project.code}
          </div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            {project.client ? `Client: ${project.client}. ` : ""}
            Country {project.countryCode}. Contract value{" "}
            {project.contractValue ? money(project.contractValue, project.currency) : "not recorded"}.
            Contract records remain canonical in the governed BEYU contracting domain
            {project.contractRef ? ` (reference ${project.contractRef})` : ""}.
          </p>
        </header>

        <UjenziSectionNav current="/os/ujenzi/projects" />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Status" value={project.status} sub={`start ${project.startDate ?? "—"}`} tone="gold" />
          <Metric label="Approved budget" value={money(sum("BUDGET"), project.currency)} sub="BUDGET cost lines" />
          <Metric label="Committed" value={money(sum("COMMITTED"), project.currency)} sub="POs and commitments" />
          <Metric label="Actual" value={money(sum("ACTUAL"), project.currency)} sub="not journals" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Approved BOQ" value={approvedBoq ? `v${approvedBoq.version}` : "—"} sub={approvedBoq?.totalValue ? money(approvedBoq.totalValue, project.currency) : "no approved version"} />
          <Metric label="Open NCRs" value={String(openNcr)} sub="quality non-conformances" />
          <Metric label="Open punch items" value={String(openPunch)} sub="handover readiness" />
          <Metric label="CAP_POSTING" value="LOCKED" sub="certificates never post journals" />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="Sites" title="Project sites">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Location</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {siteRows.map((row) => (
                    <tr key={row.id}>
                      <td className="font-mono text-[11.5px]">{row.code}</td>
                      <td className="font-medium">{row.name}</td>
                      <td className="text-[11.5px]">{row.location ?? "—"}</td>
                      <td>
                        <Badge tone={stateTone(row.status)}>{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {siteRows.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState message="No sites recorded for this project." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel kicker="Schedule" title="Phases and milestones">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th>Planned</th>
                    <th>Progress</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {phaseRows.map((row) => (
                    <tr key={row.id}>
                      <td className="font-medium">{row.name}</td>
                      <td className="text-[11.5px]">{row.plannedStart ?? "—"} → {row.plannedEnd ?? "—"}</td>
                      <td className="tabular-nums text-[11.5px]">{row.progressPct ? `${row.progressPct}%` : "—"}</td>
                      <td>
                        <Badge tone={stateTone(row.status)}>{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {phaseRows.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState message="No phases recorded. Earned-value metrics are only shown when real progress data exists." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {milestoneRows.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-[12px]">
                {milestoneRows.slice(0, 8).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3">
                    <span className="beyu-muted">{m.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] beyu-muted">{m.dueDate ?? "—"}</span>
                      <Badge tone={stateTone(m.status)}>{m.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel kicker="Financial" title="Cost position (project-control truth, not ledgers)">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Amount</th>
                  <th>Records</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                {(["ESTIMATE", "BUDGET", "COMMITTED", "ACTUAL", "FORECAST"] as const).map((kind) => {
                  const rows = costRows.filter((r) => r.kind === kind);
                  return (
                    <tr key={kind}>
                      <td className="font-semibold">{kind}</td>
                      <td className="tabular-nums">{money(sum(kind), project.currency)}</td>
                      <td className="tabular-nums text-[11.5px]">{rows.length}</td>
                      <td className="text-[11.5px] beyu-muted">
                        {kind === "ACTUAL"
                          ? "recorded actual cost lines; canonical financial truth stays in Finance OS"
                          : kind === "COMMITTED"
                            ? "approved purchase orders and commitments"
                            : kind === "ESTIMATE"
                              ? "pre-budget estimates"
                              : kind === "BUDGET"
                                ? "approved budget"
                                : "forecast at completion"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="BOQ" title="Versioned bills of quantities">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Approved</th>
                  </tr>
                </thead>
                <tbody>
                  {boqRows.map((b) => (
                    <tr key={b.id}>
                      <td className="font-mono text-[11.5px]">v{b.version}</td>
                      <td>
                        <Badge tone={stateTone(b.status)}>{b.status}</Badge>
                      </td>
                      <td className="tabular-nums text-[11.5px]">{b.totalValue ? money(b.totalValue, b.currency) : "—"}</td>
                      <td className="text-[11.5px]">{b.approvedAt ? b.approvedAt.toISOString().slice(0, 10) : "—"}</td>
                    </tr>
                  ))}
                  {boqRows.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState message="No BOQ versions yet. Approving a version supersedes the previous one without overwriting history." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel kicker="Procurement" title="Recent purchase orders">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Supplier</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {poRows.map((po) => (
                    <tr key={po.id}>
                      <td className="font-mono text-[11.5px]">{po.code}</td>
                      <td className="text-[11.5px]">{po.supplierName ?? "—"}</td>
                      <td className="tabular-nums text-[11.5px]">{po.amount ? money(po.amount, po.currency) : "—"}</td>
                      <td>
                        <Badge tone={stateTone(po.status)}>{po.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {poRows.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState message="No purchase orders recorded." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="Quality" title="Inspections and NCRs">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Type / description</th>
                    <th>Result / status</th>
                  </tr>
                </thead>
                <tbody>
                  {inspectionRows.map((row) => (
                    <tr key={row.id}>
                      <td className="font-mono text-[11.5px]">{row.code}</td>
                      <td className="text-[11.5px]">{row.inspectionType}</td>
                      <td>
                        <Badge tone={stateTone(row.result)}>{row.result}</Badge>
                      </td>
                    </tr>
                  ))}
                  {ncrRows.map((row) => (
                    <tr key={row.id}>
                      <td className="font-mono text-[11.5px]">{row.code}</td>
                      <td className="text-[11.5px]">{row.description.slice(0, 60)}</td>
                      <td>
                        <Badge tone={stateTone(row.status)}>{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {inspectionRows.length === 0 && ncrRows.length === 0 && (
                    <tr>
                      <td colSpan={3}>
                        <EmptyState message="No inspection requests or NCRs recorded." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel kicker="HSE" title="Safety record">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Occurred</th>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {incidentRows.map((row) => (
                    <tr key={row.id}>
                      <td className="text-[11.5px]">{row.occurredAt ?? "—"}</td>
                      <td className="text-[11.5px]">{row.incidentType}</td>
                      <td>
                        <Badge tone={stateTone(row.severity)}>{row.severity}</Badge>
                      </td>
                      <td>
                        <Badge tone={stateTone(row.status)}>{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {incidentRows.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState message="No incidents or near misses recorded." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="Commercial" title="Variations and claims">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Title</th>
                    <th>Impact</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {variationRows.map((row) => (
                    <tr key={row.id}>
                      <td className="font-mono text-[11.5px]">{row.code}</td>
                      <td className="text-[11.5px]">{row.title}</td>
                      <td className="tabular-nums text-[11.5px]">
                        {row.costImpact ? money(row.costImpact, row.currency) : "—"}
                        {row.scheduleImpactDays ? ` / ${row.scheduleImpactDays}d` : ""}
                      </td>
                      <td>
                        <Badge tone={stateTone(row.status)}>{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {claimRows.map((row) => (
                    <tr key={row.id}>
                      <td className="font-mono text-[11.5px]">{row.code}</td>
                      <td className="text-[11.5px]">{row.title}</td>
                      <td className="tabular-nums text-[11.5px]">{row.amount ? money(row.amount, row.currency) : "—"}</td>
                      <td>
                        <Badge tone={stateTone(row.status)}>{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {variationRows.length === 0 && claimRows.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState message="No variations or claims recorded." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel kicker="Payments" title="Payment certificates (never posted)">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Cert</th>
                    <th>Period</th>
                    <th>Gross</th>
                    <th>Net</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {certificateRows.map((row) => (
                    <tr key={row.id}>
                      <td className="font-mono text-[11.5px]">#{row.certificateNo}</td>
                      <td className="text-[11.5px]">{row.periodFrom ?? "—"} → {row.periodTo ?? "—"}</td>
                      <td className="tabular-nums text-[11.5px]">{money(row.grossValue, row.currency)}</td>
                      <td className="tabular-nums text-[11.5px]">{money(row.netValue, row.currency)}</td>
                      <td>
                        <Badge tone={stateTone(row.status)}>{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {certificateRows.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState message="No payment certificates. Certification emits PAYMENT_CERTIFIED; Finance OS integration remains the governed posting path." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <Panel kicker="Handover" title="Punch list and completion">
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
                    <td className="text-[11.5px]">{row.description.slice(0, 70)}</td>
                    <td className="text-[11.5px]">{row.category ?? "—"}</td>
                    <td>
                      <Badge tone={stateTone(row.status)}>{row.status}</Badge>
                    </td>
                  </tr>
                ))}
                {punchRows.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState message="No punch items. Handover is blocked while punch items remain open." />
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
