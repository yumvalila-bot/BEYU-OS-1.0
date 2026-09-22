/**
 * BEYU OS — SECTOR ADAPTER REGISTRY (shared capability, §17).
 *
 * ONE registry of sector visualization adapters. Each canonical Sector OS —
 * Health OS, Finance OS, Agriculture OS, UJENZI OS (a full Sector OS, equal
 * here) — plus the Foundation and the BEYU control plane consume the shared
 * dimensional foundation through exactly ONE adapter each. There is no second
 * adapter path, no sector-private graphics stack, and no "BIM OS" / "GIS OS" /
 * "Digital Twin OS": construction semantics live in the Ujenzi adapter, which
 * reads Ujenzi OS data through Ujenzi OS authorization.
 *
 * Future Sector OSs register one adapter here; nothing else in the
 * foundation changes (open/closed at the sector seam).
 */
import type { VizSectorCode } from "../dimensions";
import { assertSectorAccess } from "../authorization";
import type { Principal } from "@/lib/authz";
import { agricultureAdapter } from "./agriculture";
import { financeAdapter } from "./finance";
import { foundationAdapter } from "./foundation";
import { healthAdapter } from "./health";
import { ujenziAdapter } from "./ujenzi";
import { emptyDataset, type AdapterDataset, type AdapterDescriptor, type AdapterRequest, type SectorVisualizationAdapter } from "./types";

export * from "./types";

/** The BEYU control-plane adapter: governance/organization structures that are
 * already shared-capability data (no sector conjunction). Implemented as a
 * thin descriptor today — control-plane scenes render from the sector-agnostic
 * registries via the scene service; a full control-plane dataset mapping is
 * declared PARTIALLY_IMPLEMENTED rather than over-claimed. */
export const controlPlaneAdapter: SectorVisualizationAdapter = {
  sector: "BEYU",
  describe: (): AdapterDescriptor => ({
    sector: "BEYU",
    status: "PARTIALLY_IMPLEMENTED",
    suppliedDimensions: ["1D", "2D"],
    mappedCapabilities: ["OS & registry structure scenes (2D)", "indicator rails from governed dashboards (1D)"],
    notImplemented: ["full control-plane graph rendering (PLANNED)"],
    systemOfRecord: "os_registry, tenants, legal_entities (BEYU control plane)",
  }),
  async collect(principal: Principal, request: AdapterRequest): Promise<AdapterDataset> {
    const access = await assertSectorAccess(principal, "BEYU");
    if (!access.allowed) return emptyDataset("BEYU", "os_registry, tenants, legal_entities", access.reason);
    // Control-plane datasets are assembled by the scene service from the
    // canonical registries; the adapter contract is honored with an empty,
    // honestly-declared dataset rather than a fabricated one.
    void request;
    return emptyDataset("BEYU", "os_registry, tenants, legal_entities (BEYU control plane)");
  },
};

const ADAPTERS: Record<VizSectorCode, SectorVisualizationAdapter> = {
  BEYU: controlPlaneAdapter,
  HEALTH: healthAdapter,
  FINANCE: financeAdapter,
  AGRICULTURE: agricultureAdapter,
  UJENZI: ujenziAdapter,
  FOUNDATION: foundationAdapter,
};

export function getAdapter(sector: VizSectorCode): SectorVisualizationAdapter | null {
  return ADAPTERS[sector] ?? null;
}

export function allAdapters(): SectorVisualizationAdapter[] {
  return Object.values(ADAPTERS);
}

/** Honest adapter capability matrix (served by the API + workspace UI). */
export function adapterDescriptors(): AdapterDescriptor[] {
  return allAdapters().map((a) => a.describe());
}

/**
 * Sectors the principal may actually visualize RIGHT NOW — resolved through
 * the same canonical sector boundary each adapter enforces internally. Used
 * for discovery surfaces (sector tabs); every data access still re-checks.
 */
export async function authorizedAdapterSectors(principal: Principal): Promise<VizSectorCode[]> {
  const sectors = Object.keys(ADAPTERS) as VizSectorCode[];
  const allowed: VizSectorCode[] = [];
  for (const sector of sectors) {
    const access = await assertSectorAccess(principal, sector);
    if (access.allowed) allowed.push(sector);
  }
  return allowed;
}
