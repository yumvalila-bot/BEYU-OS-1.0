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
import type { Principal } from "@/lib/authz";
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

  async collect(_principal: Principal, _request: AdapterRequest): Promise<AdapterDataset> {
    // Health-local identity and membership are authoritative. BEYU does not
    // query the Health database, and this adapter has no Health-local session.
    // Never substitute a BEYU session for Health authorization or expose PHI.
    return emptyDataset(
      "HEALTH",
      SYSTEM_OF_RECORD,
      "Health visualization requires a Health-local authenticated session and a governed non-PHI data contract. No Health data is queried or exposed from BEYU.",
    );

  },
};
