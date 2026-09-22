/**
 * BEYU OS — HEALTH OS VISUALIZATION ADAPTER (shared capability → Sector OS).
 *
 * Health OS is a FEDERATED Sector OS: its clinical and operational data lives
 * in the Health backend (its own database, migrations and authorization), and
 * canonical BEYU users reach it only through the federated identity bridge
 * (beyu_identity.beyu_identity_links). This adapter honors that architecture
 * exactly:
 *
 *   1. NO PHI — EVER. Protected health information is not visualization
 *      material through this layer. Patient-level records, clinical notes and
 *      identifiers are structurally unreachable from this adapter: it has no
 *      query path to the Health clinical schema at all (§17-HEALTH).
 *   2. FAIL-CLOSED FEDERATION. Without an active identity link the adapter
 *      returns NOT_AVAILABLE — it never borrows another sector's authority.
 *   3. HONEST SCOPE. What is IMPLEMENTED today is the federation-status /
 *      health-service-availability abstraction built from data that genuinely
 *      exists on the BEYU side (OS registry lifecycle for HEALTH_OS + the
 *      identity bridge state). Facility floor plans, medical-equipment twins,
 *      epidemiological maps and clinical workflows are PLANNED: they require
 *      a governed Health federation data contract (an authorized, non-PHI
 *      aggregate feed from the Health backend) that does not exist yet. They
 *      are declared here, not fabricated.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { osRegistry } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { checkHealthOSAuthorization } from "@/lib/health-os-authorization";
import { observed, unavailable } from "../provenance";
import { mapStatusToStage } from "../engines/lifecycle";
import { emptyDataset, type AdapterDataset, type AdapterDescriptor, type AdapterRequest, type SectorVisualizationAdapter } from "./types";

const SYSTEM_OF_RECORD = "os_registry (HEALTH_OS lifecycle) + beyu_identity.beyu_identity_links (federation bridge)";

export const healthAdapterDescriptor: AdapterDescriptor = {
  sector: "HEALTH",
  status: "PARTIALLY_IMPLEMENTED",
  suppliedDimensions: ["1D", "7D"],
  mappedCapabilities: [
    "Health OS federation status (1D indicator: identity-link state)",
    "HEALTH_OS registry lifecycle (7D: lifecycle state of the federated Sector OS itself)",
  ],
  notImplemented: [
    "facility floor plans / clinical environments (PLANNED — requires a governed non-PHI Health federation data contract)",
    "medical-equipment digital twins (PLANNED — same contract)",
    "epidemiological / health-service coverage maps (PLANNED — aggregate feed contract)",
    "clinical workflows (PLANNED)",
    "ANY patient-level data — by constitutional design, never by omission: PHI is not visualization material through this layer",
  ],
  systemOfRecord: SYSTEM_OF_RECORD,
};

export const healthAdapter: SectorVisualizationAdapter = {
  sector: "HEALTH",
  describe: () => healthAdapterDescriptor,

  async collect(principal: Principal, _request: AdapterRequest): Promise<AdapterDataset> {
    // DATA AUTHORIZATION: the federated Health identity bridge. Fail closed.
    const health = await checkHealthOSAuthorization(principal.userId);
    if (!health.authorized) {
      return emptyDataset("HEALTH", SYSTEM_OF_RECORD, `Health OS visualization requires the federated Health identity link (${health.reason ?? "NOT_LINKED"}). No PHI is exposed through visualization in any case.`);
    }

    const objects: AdapterDataset["objects"] = [];
    const lifecycle: AdapterDataset["lifecycle"] = [];

    // The only BEYU-side Health facts that exist today: the OS registry entry
    // for HEALTH_OS and the principal's federation link. Both are operational
    // metadata — no clinical data, no PHI.
    const [registryRow] = await db.select().from(osRegistry).where(eq(osRegistry.code, "HEALTH_OS")).limit(1);

    objects.push({
      id: "HEALTH_OS_FEDERATION",
      label: "Health OS federation",
      layerId: "health-federation",
      // Operational metadata about the federation itself; CONFIDENTIAL is the
      // minimum catalogue classification for identity-linked state.
      classification: "CONFIDENTIAL",
      geometry: null,
      dimensionValues: {
        "1D": observed(health.authorized ? "LINKED" : "NOT_LINKED"),
        "7D": registryRow ? observed(registryRow.lifecycle) : unavailable(),
      },
      accessibleText: `Health OS federation status: identity link ${health.authorized ? "active" : "inactive"}${health.linkedAt ? ` since ${health.linkedAt.slice(0, 10)}` : ""}; HEALTH_OS registry lifecycle ${registryRow?.lifecycle ?? "UNKNOWN"}. Clinical and facility visualization requires a governed Health federation data contract (PLANNED). Patient data is never exposed through visualization.`,
      timeAnchor: health.linkedAt ?? null,
      sourceRef: "beyu_identity_links:SELF",
      status: health.authorized ? "LINKED" : "NOT_LINKED",
    });

    if (registryRow) {
      const stage = mapStatusToStage(registryRow.lifecycle);
      if (stage) lifecycle.push({ subjectKey: "HEALTH_OS", stage, at: null, sourceStatus: registryRow.lifecycle, source: "os_registry" });
    }

    return {
      sector: "HEALTH",
      // PARTIAL is the honest status: the federation facts are present, the
      // clinical/facility datasets are PLANNED behind a governed contract.
      status: "PARTIAL",
      reason: "Federation status is available; facility/equipment/epidemiological visualization is PLANNED behind a governed non-PHI Health data contract.",
      objects,
      time: [],
      quantities: [],
      performance: [],
      lifecycle,
      risk: [],
      relationships: [],
      systemOfRecord: SYSTEM_OF_RECORD,
    };
  },
};
