import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  capitalCases,
  cropCycles,
  farms,
  harvests,
  hazardRegister,
  livestockHerds,
  workOrders,
  exportOrders,
  exportHolds,
  exportShipments,
} from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { agricultureDashboard, exportDashboard } from "@/lib/agriculture";
import {
  classificationRank,
  classificationsAtOrBelow,
} from "@/lib/constants";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function AgriculturePage() {
  const access = await requireAccess("agriculture:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="agriculture:data.read" />;
  if (access.principal.entityScope.length > 0) {
    return (
      <Denied
        reason="Agriculture OS includes relational operational rows without a canonical legal-entity key; tenant-wide reads are refused under an entity-scoped grant."
        capability="agriculture:data.read"
      />
    );
  }
  return withTenantDatabaseContext(access.principal, async () => {
    const tenantId = access.principal.tenantId;
    const allowedClassifications = classificationsAtOrBelow(access.principal.clearance);
    const fullClearance =
      classificationRank(access.principal.clearance) >=
      classificationRank("HIGHLY_RESTRICTED");
    const farmRows = await db
      .select()
      .from(farms)
      .where(
        and(
          eq(farms.tenantId, tenantId),
          inArray(farms.classification, allowedClassifications),
        ),
      )
      .orderBy(desc(farms.createdAt))
      .limit(20);
    const farmIds = farmRows.map((farm) => farm.id);
    const [cycleRows, harvestRows, herdRows, workRows, hazardRows, caseRows, exportOrderRows, exportHoldRows, exportShipmentRows] = await Promise.all([
      db.select().from(cropCycles).where(and(eq(cropCycles.tenantId, tenantId), inArray(cropCycles.classification, allowedClassifications))).orderBy(desc(cropCycles.createdAt)).limit(20),
      db.select().from(harvests).where(and(eq(harvests.tenantId, tenantId), inArray(harvests.classification, allowedClassifications))).orderBy(desc(harvests.createdAt)).limit(20),
      farmIds.length > 0
        ? db.select().from(livestockHerds).where(and(eq(livestockHerds.tenantId, tenantId), inArray(livestockHerds.farmId, farmIds))).limit(20)
        : Promise.resolve([]),
      db.select().from(workOrders).where(and(eq(workOrders.tenantId, tenantId), inArray(workOrders.classification, allowedClassifications))).limit(20),
      db.select().from(hazardRegister).where(and(eq(hazardRegister.tenantId, tenantId), inArray(hazardRegister.classification, allowedClassifications))).limit(20),
      db.select().from(capitalCases).where(and(eq(capitalCases.tenantId, tenantId), inArray(capitalCases.classification, allowedClassifications))).limit(20),
      db.select().from(exportOrders).where(and(eq(exportOrders.tenantId, tenantId), inArray(exportOrders.classification, allowedClassifications))).orderBy(desc(exportOrders.createdAt)).limit(20),
      db.select().from(exportHolds).where(and(eq(exportHolds.tenantId, tenantId), inArray(exportHolds.classification, allowedClassifications))).orderBy(desc(exportHolds.createdAt)).limit(20),
      db.select().from(exportShipments).where(and(eq(exportShipments.tenantId, tenantId), inArray(exportShipments.classification, allowedClassifications))).orderBy(desc(exportShipments.createdAt)).limit(20),
    ]);
    const [dash, expDash] = fullClearance
      ? await Promise.all([
          agricultureDashboard(tenantId),
          exportDashboard(tenantId).catch(() => ({ totalOrders: 0, draftOrders: 0, readyForShipment: 0, activeHolds: 0, exportShipments: 0, financeBoundary: { journals: "FINANCE_OS_ONLY", capPosting: "LOCKED" } })),
        ])
      : [
          {
            farms: farmRows.length,
            cropCycles: cycleRows.length,
            harvests: harvestRows.length,
            herds: herdRows.length,
            workOrders: workRows.length,
            hazards: hazardRows.length,
            capitalCases: caseRows.length,
          },
          {
            totalOrders: exportOrderRows.length,
            draftOrders: exportOrderRows.filter((order) => order.status === "DRAFT").length,
            readyForShipment: exportOrderRows.filter((order) => order.status === "READY_FOR_SHIPMENT").length,
            activeHolds: exportHoldRows.filter((hold) => hold.status === "ACTIVE").length,
            exportShipments: exportShipmentRows.length,
            financeBoundary: { journals: "FINANCE_OS_ONLY", capPosting: "LOCKED" },
          },
        ];

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

        <Link
          href="/os/agriculture/capabilities"
          className="beyu-panel flex items-start gap-3 p-4 transition hover:border-[#D4A017]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017]"
        >
          <Icon name="agriculture" className="mt-0.5 h-5 w-5 shrink-0 text-[#b08d1c]" />
          <span>
            <span className="block text-[13.5px] font-semibold">Complete Agriculture capability surface</span>
            <span className="mt-0.5 block text-[11.5px] beyu-muted">Land, crop, livestock, aquaculture, environment, work, inventory, quality, projects, commerce, traceability, export and offline interfaces.</span>
          </span>
        </Link>

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

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Export orders" value={String(expDash.totalOrders)} sub="food export lifecycle" tone="gold" />
          <Metric label="Draft export" value={String(expDash.draftOrders)} sub="awaiting confirmation" />
          <Metric label="Ready for shipment" value={String(expDash.readyForShipment)} sub="compliance cleared" />
          <Metric label="Active export holds" value={String(expDash.activeHolds)} sub="quality/compliance/document/lot" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Export shipments" value={String(expDash.exportShipments)} sub="export logistics" />
          <Metric label="Finance boundary" value="FINANCE_OS_ONLY" sub="export emits events, never journals" />
          <Metric label="Traceability" value="REUSED" sub="existing batches/links/harvests/farms" />
          <Metric label="Documents" value="REUSED" sub="canonical agriculture_documents" />
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

          <Panel kicker="Food Export" title="Export orders — lifecycle governed">
            <p className="mb-3 text-[11px] beyu-muted">
              Export orders reuse buyers, products, countries, inventory lots and trace batches. State transitions are governed, holds are explicit and auditable, compliance is derived from configurable requirements. No Finance posting.
            </p>
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Buyer</th>
                    <th>Destination</th>
                    <th>Qty</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {exportOrderRows.map((o) => (
                    <tr key={o.id}>
                      <td className="font-mono text-[11.5px]">{o.code}</td>
                      <td className="text-[11.5px]">{o.buyerId.slice(0, 8)}</td>
                      <td className="text-[11.5px]">{o.destinationCountryCode} {o.destination ?? ""}</td>
                      <td className="tabular-nums text-[11.5px]">{o.quantity} {o.uom}</td>
                      <td>
                        <Badge tone={stateTone(o.status)}>{o.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {exportOrderRows.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState message="No export orders yet." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel kicker="Food Export" title="Export holds — governed, auditable">
            <p className="mb-3 text-[11px] beyu-muted">
              Holds are explicit, reasoned, authorization-controlled. Noelia/HIVE cannot release holds. Active holds block transitions.
            </p>
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Order</th>
                  </tr>
                </thead>
                <tbody>
                  {exportHoldRows.map((h) => (
                    <tr key={h.id}>
                      <td className="text-[11.5px]">{h.holdType}</td>
                      <td className="text-[11.5px]">{h.reason.slice(0, 80)}</td>
                      <td>
                        <Badge tone={stateTone(h.status)}>{h.status}</Badge>
                      </td>
                      <td className="font-mono text-[11.5px]">{h.exportOrderId?.slice(0, 8) ?? "—"}</td>
                    </tr>
                  ))}
                  {exportHoldRows.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState message="No export holds." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="Food Export" title="Export shipments — reuse logistics">
            <p className="mb-3 text-[11px] beyu-muted">
              Export shipments extend existing shipments with destination country, transport mode and commercial terms. Lifecycle is governed, Finance boundary preserved.
            </p>
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Shipment</th>
                    <th>Order</th>
                    <th>Destination</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {exportShipmentRows.map((s) => (
                    <tr key={s.id}>
                      <td className="font-mono text-[11.5px]">{s.shipmentId.slice(0, 8)}</td>
                      <td className="font-mono text-[11.5px]">{s.exportOrderId.slice(0, 8)}</td>
                      <td className="text-[11.5px]">{s.destinationCountryCode}</td>
                      <td>
                        <Badge tone={stateTone(s.status)}>{s.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {exportShipmentRows.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState message="No export shipments." />
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
