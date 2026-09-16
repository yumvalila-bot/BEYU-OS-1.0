import Link from "next/link";
import { requireAccess } from "@/lib/guard";
import { Denied, EmptyState, Panel } from "@/components/brand";
import { Icon, type IconName } from "@/components/icons";

export const dynamic = "force-dynamic";

type AgricultureCapabilityGroup = {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  endpoints: string[];
};

const GROUPS: AgricultureCapabilityGroup[] = [
  { id: "land", title: "Land, Farms & Fields", description: "Farmers, farms, parcels, fields and field-zone operating records.", icon: "agriculture", endpoints: ["dashboard", "farmers", "farms", "land-parcels", "fields", "field-zones"] },
  { id: "crops", title: "Crops & Production", description: "Crop types and cycles, input application, irrigation, soil, pest observation, harvest and yield outlook.", icon: "agriculture", endpoints: ["crop-types", "crop-cycles", "inputs", "input-applications", "irrigation", "soil-tests", "pest-observations", "harvests", "yield-outlook"] },
  { id: "livestock", title: "Livestock & Veterinary", description: "Livestock types, herds, individual animals, livestock events and veterinary records.", icon: "protection", endpoints: ["livestock-types", "livestock", "animals", "livestock/events", "veterinary"] },
  { id: "aquaculture", title: "Aquaculture", description: "Aquaculture units, stocking, harvest and water-quality evidence.", icon: "foundation", endpoints: ["aqua-units", "aqua-stockings", "aqua-harvests", "water-quality"] },
  { id: "environment", title: "Environment, Trees & IoT", description: "Water sources, environmental and weather measurements, trees, devices and telemetry.", icon: "events", endpoints: ["water-sources", "env-metrics", "weather", "measurements", "tree-species", "trees", "tree-plantings", "iot-devices", "iot-readings"] },
  { id: "work", title: "Work, Equipment & Assets", description: "Field tasks, assignments, work orders, equipment service and operational assets.", icon: "hcm", endpoints: ["field-tasks", "task-assignments", "work-orders", "equipment", "equipment-service", "assets"] },
  { id: "inventory", title: "Inventory, Storage & Processing", description: "Items, lots, movements, warehouses, storage evidence and process runs.", icon: "registry", endpoints: ["inventory-items", "inventory-lots", "inventory-moves", "warehouses", "storage-records", "process-runs"] },
  { id: "quality", title: "Quality, Safety & Corrective Action", description: "Inspection, laboratory, certification, permits, hazards, incidents and remediation records.", icon: "assurance", endpoints: ["inspections", "lab-results", "certificates", "licenses", "permits", "violations", "hazards", "hazard-mitigations", "corrective-actions", "safety-incidents"] },
  { id: "projects", title: "Projects, Capital & Insurance", description: "Agriculture projects and milestones, budget evidence, Finance handoff cases, policies and claims.", icon: "capital", endpoints: ["projects", "project-milestones", "project-budgets", "capital-cases", "insurance-policies", "insurance-claims"] },
  { id: "commercial", title: "Commercial & Logistics", description: "Suppliers, buyers, products, marketplace listings, orders and shipments without becoming Finance truth.", icon: "payments", endpoints: ["suppliers", "buyers", "products", "listings", "orders", "order-items", "shipments", "shipment-items"] },
  { id: "trace-export", title: "Traceability & Food Export", description: "Trace batches and links plus governed export orders, allocation, compliance, holds, documents, transitions and shipments.", icon: "workflow", endpoints: ["trace-batches", "trace-links", "export-orders", "export-orders/[id]", "export-orders/[id]/allocate", "export-orders/[id]/compliance", "export-orders/[id]/holds", "export-orders/[id]/traceability", "export-orders/[id]/transition", "export-allocations", "export-compliance/requirements", "export-compliance/checks", "export-holds", "export-documents", "export-shipments"] },
  { id: "knowledge", title: "Agreements, Documents, Advice & Offline Sync", description: "Counterparty agreements, governed documents, observations, advisory records, simulation and idempotent offline envelopes.", icon: "documents", endpoints: ["agreements", "documents", "observations", "ai-advice", "whatif", "sync"] },
];

export default async function AgricultureCapabilitiesPage() {
  const access = await requireAccess("agriculture:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="agriculture:data.read" />;
  if (access.principal.entityScope.length > 0) {
    return (
      <Denied
        reason="Agriculture capability data includes relational records without complete legal-entity keys; tenant-wide API discovery is refused under an entity-scoped grant."
        capability="agriculture:data.read"
      />
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Agriculture OS · Implemented capability directory</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Agriculture Capability Surface</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          The implemented Agriculture domains grouped once beneath Agriculture OS. Each endpoint link enters
          the real governed read interface and repeats authentication, RBAC, tenant, entity and classification
          checks; this directory is discovery, never authority.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {GROUPS.map((group) => (
          <Link key={group.id} href={`#${group.id}`} className="rounded-xl border border-[color:var(--beyu-line)] p-4 transition hover:border-[#D4A017] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017]">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0B1F4D]/8 text-[#0B1F4D] dark:bg-white/10 dark:text-[#D4A017]" aria-hidden="true"><Icon name={group.icon} className="h-[18px] w-[18px]" /></span>
              <span><span className="block text-[13.5px] font-semibold">{group.title}</span><span className="mt-0.5 block text-[11.5px] beyu-muted">{group.description}</span></span>
            </div>
          </Link>
        ))}
      </div>

      <Panel kicker="Governed interfaces" title="Implemented domain routes">
        <div className="space-y-6">
          {GROUPS.map((group) => (
            <section key={group.id} id={group.id} className="scroll-mt-24 border-b border-[color:var(--beyu-line)] pb-5 last:border-0 last:pb-0">
              <div className="flex items-start gap-3">
                <Icon name={group.icon} className="mt-0.5 h-5 w-5 shrink-0 text-[#b08d1c]" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-[14px] font-semibold">{group.title}</h2>
                  <p className="mt-1 text-[11.5px] beyu-muted">{group.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {group.endpoints.map((endpoint) =>
                      endpoint.includes("[id]") || endpoint === "livestock/events" || endpoint === "sync" || endpoint === "whatif" ? (
                        <code key={endpoint} className="rounded-md border border-[color:var(--beyu-line)] px-2.5 py-1.5 text-[10.5px] beyu-muted" title="Governed parameterized or mutation route">
                          {endpoint}
                        </code>
                      ) : (
                        <Link key={endpoint} href={`/api/v1/agriculture/${endpoint}`} className="rounded-md border border-[color:var(--beyu-line)] px-2.5 py-1.5 font-mono text-[10.5px] transition hover:border-[#D4A017] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017]">
                          {endpoint}
                        </Link>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </section>
          ))}
          {GROUPS.length === 0 && <EmptyState message="No Agriculture capability groups are registered." />}
        </div>
      </Panel>
    </div>
  );
}
