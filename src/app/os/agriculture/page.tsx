import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  capitalCases,
  cropCycles,
  farms,
  harvests,
  hazardRegister,
  livestockHerds,
  workOrders,
} from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { agricultureDashboard } from "@/lib/agriculture";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function AgriculturePage() {
  const access = await requireAccess("agriculture:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="agriculture:data.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const tenantId = access.principal.tenantId;
    const dash = await agricultureDashboard(tenantId);
    const [farmRows, cycleRows, harvestRows, herdRows, workRows, hazardRows, caseRows] = await Promise.all([
      db.select().from(farms).where(eq(farms.tenantId, tenantId)).orderBy(desc(farms.createdAt)).limit(20),
      db.select().from(cropCycles).where(eq(cropCycles.tenantId, tenantId)).orderBy(desc(cropCycles.createdAt)).limit(20),
      db.select().from(harvests).where(eq(harvests.tenantId, tenantId)).orderBy(desc(harvests.createdAt)).limit(20),
      db.select().from(livestockHerds).where(eq(livestockHerds.tenantId, tenantId)).limit(20),
      db.select().from(workOrders).where(eq(workOrders.tenantId, tenantId)).limit(20),
      db.select().from(hazardRegister).where(eq(hazardRegister.tenantId, tenantId)).limit(20),
      db.select().from(capitalCases).where(eq(capitalCases.tenantId, tenantId)).limit(20),
    ]);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Agriculture OS — sector OS under BEYU OS</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Farms, crops, livestock and value chain</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Tanzania-first operational truth for land, crop cycles, harvests, livestock, aquaculture, inventory,
            work and traceability. Identity, HCM, journals and capital execution remain with BEYU / Finance OS.
            CAP_POSTING is LOCKED. Harvests emit HARVEST_RECORDED; they never post journals.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Farms" value={String(dash.farms)} sub="tenant-isolated operational records" tone="gold" />
          <Metric label="Crop cycles" value={String(dash.cropCycles)} sub="planting through harvest" />
          <Metric label="Harvests recorded" value={String(dash.harvests)} sub="event HARVEST_RECORDED only" />
          <Metric label="Livestock herds" value={String(dash.herds)} sub="head-count events, not payroll" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Work orders" value={String(dash.workOrders)} sub="field execution" />
          <Metric label="Hazard register" value={String(dash.hazards)} sub="operational hazards, not enterprise risk" />
          <Metric label="Capital cases" value={String(dash.capitalCases)} sub="handoff pending Finance OS" />
          <Metric label="CAP_POSTING" value="LOCKED" sub="Finance OS remains the only journal writer" />
        </div>

        <Panel kicker="Farms" title="Land and production units">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Country</th>
                  <th>Area (ha)</th>
                  <th>Status</th>
                  <th>Class</th>
                </tr>
              </thead>
              <tbody>
                {farmRows.map((f) => (
                  <tr key={f.id}>
                    <td className="font-mono text-[11.5px]">{f.code}</td>
                    <td className="font-medium">{f.name}</td>
                    <td className="text-[11.5px]">{f.countryCode}</td>
                    <td className="tabular-nums text-[11.5px]">{f.totalAreaHa ?? "—"}</td>
                    <td>
                      <Badge tone={stateTone(f.status)}>{f.status}</Badge>
                    </td>
                    <td>
                      <Badge tone="slate">{f.classification}</Badge>
                    </td>
                  </tr>
                ))}
                {farmRows.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState message="No farms in this tenant yet." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="Crop cycles" title="Planting to harvest">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Season</th>
                    <th>Planted</th>
                    <th>Status</th>
                    <th>Actual yield (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {cycleRows.map((c) => (
                    <tr key={c.id}>
                      <td className="font-mono text-[11.5px]">{c.code}</td>
                      <td className="text-[11.5px]">{c.season}</td>
                      <td className="text-[11.5px] beyu-muted">{c.plantingDate}</td>
                      <td>
                        <Badge tone={stateTone(c.status)}>{c.status}</Badge>
                      </td>
                      <td className="tabular-nums text-[11.5px]">{c.actualYieldKg ?? "—"}</td>
                    </tr>
                  ))}
                  {cycleRows.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState message="No crop cycles recorded." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel kicker="Harvests" title="Operational yield (not ledger truth)">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Date</th>
                    <th>Qty (kg)</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {harvestRows.map((h) => (
                    <tr key={h.id}>
                      <td className="font-mono text-[11.5px]">{h.code}</td>
                      <td className="text-[11.5px] beyu-muted">{h.harvestDate}</td>
                      <td className="tabular-nums text-[11.5px]">{h.quantityKg}</td>
                      <td className="text-[11.5px]">{h.qualityGrade ?? "—"}</td>
                    </tr>
                  ))}
                  {harvestRows.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState message="No harvests recorded." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="Livestock" title="Herds">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Head count</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {herdRows.map((h) => (
                    <tr key={h.id}>
                      <td className="font-mono text-[11.5px]">{h.code}</td>
                      <td className="text-[11.5px]">{h.name}</td>
                      <td className="tabular-nums text-[11.5px]">{h.headCount}</td>
                      <td>
                        <Badge tone={stateTone(h.status)}>{h.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {herdRows.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState message="No herds recorded." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel kicker="Work" title="Field work orders">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Title</th>
                    <th>Kind</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {workRows.map((w) => (
                    <tr key={w.id}>
                      <td className="font-mono text-[11.5px]">{w.code}</td>
                      <td className="text-[11.5px]">{w.title}</td>
                      <td className="text-[11.5px]">{w.workKind}</td>
                      <td>
                        <Badge tone={stateTone(w.status)}>{w.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {workRows.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState message="No work orders." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="Hazards" title="Operational hazard register">
            <p className="mb-3 text-[11px] beyu-muted">
              This is sector operational hazard tracking. It is not the enterprise risk register and does not
              confer risk-acceptance authority.
            </p>
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Title</th>
                    <th>Kind</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {hazardRows.map((h) => (
                    <tr key={h.id}>
                      <td className="font-mono text-[11.5px]">{h.code}</td>
                      <td className="text-[11.5px]">{h.title}</td>
                      <td className="text-[11.5px]">{h.hazardKind}</td>
                      <td>
                        <Badge tone={stateTone(h.status)}>{h.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {hazardRows.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState message="No operational hazards recorded." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel kicker="Finance boundary" title="Capital cases (handoff only)">
            <p className="mb-3 text-[11px] beyu-muted">
              Cases are submitted pending Finance OS. Agriculture never posts, funds or executes capital.
            </p>
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Title</th>
                    <th>Amount</th>
                    <th>Handoff</th>
                  </tr>
                </thead>
                <tbody>
                  {caseRows.map((c) => (
                    <tr key={c.id}>
                      <td className="font-mono text-[11.5px]">{c.code}</td>
                      <td className="text-[11.5px]">{c.title}</td>
                      <td className="tabular-nums text-[11.5px]">
                        {c.amount} {c.currency}
                      </td>
                      <td>
                        <Badge tone="gold">{c.financeHandoff}</Badge>
                      </td>
                    </tr>
                  ))}
                  {caseRows.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState message="No capital cases." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    );
  });
}
