import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { ujenziDashboard } from "@/lib/ujenzi";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone, money } from "@/components/brand";
import { UjenziSectionNav } from "./sections";

export const dynamic = "force-dynamic";

export default async function UjenziPage() {
  const access = await requireAccess("ujenzi:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="ujenzi:data.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const principal = access.principal;
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);
    const tenantId = principal.tenantId;

    const [dash, projectRows] = await Promise.all([
      ujenziDashboard(tenantId),
      db
        .select()
        .from(s.ujenziProjects)
        .where(
          and(
            eq(s.ujenziProjects.tenantId, tenantId),
            inArray(s.ujenziProjects.classification, allowedClassifications),
          ),
        )
        .orderBy(desc(s.ujenziProjects.createdAt))
        .limit(20),
    ]);

    const portfolioCurrency = projectRows[0]?.currency ?? "TZS";

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Ujenzi OS — sector OS under BEYU OS</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Construction operations and project controls</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Governed operational truth for construction projects, BOQ and cost control, procurement, materials,
            equipment, site operations, quality, HSE, variations, claims, payment certificates and handover.
            Identity, HCM, documents, governance and audit remain canonical BEYU capabilities; Finance OS remains
            the only journal writer. CAP_POSTING is LOCKED — payment certificates emit PAYMENT_CERTIFIED and never post.
          </p>
        </header>

        <UjenziSectionNav current="/os/ujenzi" />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Projects" value={String(dash.projects)} sub={`${dash.activeProjects} active`} tone="gold" />
          <Metric label="Portfolio value" value={money(dash.portfolioValue, portfolioCurrency)} sub="sum of contract values" />
          <Metric label="Open NCRs" value={String(dash.openNcrs)} sub="quality non-conformances" />
          <Metric label="Open claims" value={String(dash.openClaims)} sub="notified through decided" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Budget" value={money(dash.cost.BUDGET, portfolioCurrency)} sub="approved budget cost lines" />
          <Metric label="Committed" value={money(dash.cost.COMMITTED, portfolioCurrency)} sub="purchase orders and commitments" />
          <Metric label="Actual" value={money(dash.cost.ACTUAL, portfolioCurrency)} sub="recorded actuals (not journals)" />
          <Metric label="Forecast" value={money(dash.cost.FORECAST, portfolioCurrency)} sub="forecast cost lines" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Pending variations" value={String(dash.pendingVariations)} sub="submitted or under review" />
          <Metric label="Safety incidents" value={String(dash.incidents)} sub={`${dash.nearMisses} near miss(es)`} />
          <Metric label="Pending requisitions" value={String(dash.pendingRequisitions)} sub="awaiting approval" />
          <Metric label="Open punch items" value={String(dash.openPunchItems)} sub="handover readiness" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Approved purchase orders" value={String(dash.approvedPurchaseOrders)} sub="governed procurement" />
          <Metric label="Equipment" value={String(dash.equipment)} sub="register entries" />
          <Metric label="Latest site diary" value={dash.latestSiteDiaryDate ?? "—"} sub="most recent record" />
          <Metric label="CAP_POSTING" value="LOCKED" sub="Finance OS remains the only journal writer" />
        </div>

        <Panel kicker="Projects" title="Construction portfolio" action={<Link href="/os/ujenzi/projects" className="text-[12px] font-medium text-[#b08d1c] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017]">All projects →</Link>}>
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Client</th>
                  <th>Contract value</th>
                  <th>Status</th>
                  <th>Class</th>
                </tr>
              </thead>
              <tbody>
                {projectRows.map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono text-[11.5px]">
                      <Link href={`/os/ujenzi/projects/${p.id}`} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017]">
                        {p.code}
                      </Link>
                    </td>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-[11.5px]">{p.client ?? "—"}</td>
                    <td className="tabular-nums text-[11.5px]">{p.contractValue ? money(p.contractValue, p.currency) : "—"}</td>
                    <td>
                      <Badge tone={stateTone(p.status)}>{p.status}</Badge>
                    </td>
                    <td>
                      <Badge tone="slate">{p.classification}</Badge>
                    </td>
                  </tr>
                ))}
                {projectRows.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState message="No construction projects in this tenant yet. Create one through the governed API." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Constitutional boundary" title="What Ujenzi OS does not own">
          <ul className="list-disc space-y-1.5 pl-5 text-[12.5px] beyu-muted">
            <li>Identity, sessions, RBAC/ABAC — canonical BEYU OS identity and authorization.</li>
            <li>Journals, treasury, capital execution — Finance OS only; CAP_POSTING stays LOCKED.</li>
            <li>Employee master — BEYU HCM; site labour is recorded as operational counts.</li>
            <li>Documents and drawings — canonical BEYU document registry; Ujenzi stores references only.</li>
            <li>Approvals and workflow — canonical BEYU governance; Ujenzi transitions are audited events.</li>
            <li>AI — Noelia remains the single governed AI identity; Ujenzi exposes an observation tool only.</li>
          </ul>
        </Panel>
      </div>
    );
  });
}
