/**
 * Machine-readable Ujenzi capability registry.
 * Statuses are honest: IMPLEMENTED | PARTIAL | PLANNED | NOT_CONNECTED | NOT_CERTIFIED | DATA_REQUIRED | BLOCKED.
 */
export type UjenziCapabilityStatus =
  | "IMPLEMENTED"
  | "PARTIAL"
  | "PLANNED"
  | "NOT_CONNECTED"
  | "NOT_CERTIFIED"
  | "DATA_REQUIRED"
  | "BLOCKED";

export type UjenziCapability = {
  capability: string;
  status: UjenziCapabilityStatus;
  owner: string;
  tables: string[];
  api: string[];
  events: string[];
  noeliaTools: string[];
  notes: string;
};

export const UJENZI_CAPABILITY_REGISTRY: UjenziCapability[] = [
  {
    capability: "projects",
    status: "IMPLEMENTED",
    owner: "SECTOR_OPERATOR",
    tables: ["ujenzi_projects", "ujenzi_briefs", "ujenzi_cost_trackers"],
    api: ["/api/v1/ujenzi/projects", "/api/v1/ujenzi/dashboard"],
    events: ["PROJECT_CREATED"],
    noeliaTools: ["ujenzi.operations.observe", "ujenzi.project.observe"],
    notes: "Lifecycle anchor. Cost tracker is not a ledger.",
  },
  {
    capability: "land_sites",
    status: "PARTIAL",
    owner: "SECTOR_OPERATOR",
    tables: ["ujenzi_land_sites"],
    api: ["/api/v1/ujenzi/sites"],
    events: ["SITE_REGISTERED"],
    noeliaTools: ["ujenzi.digital_twin.query"],
    notes: "CRS required. Geometry source USER_ENTERED until survey import.",
  },
  {
    capability: "survey_observations",
    status: "PARTIAL",
    owner: "SECTOR_OPERATOR",
    tables: ["ujenzi_survey_observations"],
    api: ["/api/v1/ujenzi/surveys"],
    events: [],
    noeliaTools: [],
    notes: "Coordinates optional; missing → DATA_REQUIRED. Unknown CRS refused.",
  },
  {
    capability: "gis_ingest",
    status: "PARTIAL",
    owner: "SECTOR_OPERATOR",
    tables: ["ujenzi_gis_datasets"],
    api: ["/api/v1/ujenzi/gis"],
    events: [],
    noeliaTools: [],
    notes: "GeoJSON FeatureCollection only. No WMS/WFS. Renderer NOT_IMPLEMENTED.",
  },
  {
    capability: "defects_rfis_schedule",
    status: "PARTIAL",
    owner: "SECTOR_OPERATOR",
    tables: ["ujenzi_defects", "ujenzi_rfis", "ujenzi_schedule_activities"],
    api: ["/api/v1/ujenzi/defects", "/api/v1/ujenzi/rfis", "/api/v1/ujenzi/schedule"],
    events: [],
    noeliaTools: [],
    notes: "Operational records. Not a P6/Primavera clone.",
  },
  {
    capability: "soil",
    status: "PARTIAL",
    owner: "SECTOR_OPERATOR",
    tables: ["ujenzi_soil_tests"],
    api: ["/api/v1/ujenzi/soil"],
    events: [],
    noeliaTools: ["ujenzi.operations.observe"],
    notes: "Missing parameters → DATA_REQUIRED. Never fabricated.",
  },
  {
    capability: "engineering_calculations",
    status: "NOT_CERTIFIED",
    owner: "SECTOR_OPERATOR",
    tables: ["ujenzi_engineering_calculations", "ujenzi_engineering_standards"],
    api: ["/api/v1/ujenzi/calculations"],
    events: ["CALCULATION_CREATED"],
    noeliaTools: ["ujenzi.operations.observe"],
    notes: "Decision support only. Noelia cannot certify.",
  },
  {
    capability: "digital_twin",
    status: "PARTIAL",
    owner: "SECTOR_OPERATOR",
    tables: [
      "ujenzi_buildings",
      "ujenzi_levels",
      "ujenzi_spaces",
      "ujenzi_elements",
      "ujenzi_systems",
      "ujenzi_assets",
      "ujenzi_twin_edges",
    ],
    api: ["/api/v1/ujenzi/digital-twin"],
    events: [],
    noeliaTools: ["ujenzi.digital_twin.query"],
    notes: "Identifier graph. Not a 3D viewer.",
  },
  {
    capability: "bim",
    status: "PARTIAL",
    owner: "SECTOR_OPERATOR",
    tables: ["ujenzi_bim_models", "ujenzi_model_objects"],
    api: [],
    events: [],
    noeliaTools: [],
    notes: "Metadata register for IFC/federation. No production BIM viewer.",
  },
  {
    capability: "gis_geobim",
    status: "PLANNED",
    owner: "SECTOR_OPERATOR",
    tables: ["ujenzi_land_sites"],
    api: [],
    events: [],
    noeliaTools: [],
    notes: "CRS fields only. No tile server, no fabricated cadastral data.",
  },
  {
    capability: "government_integration",
    status: "NOT_CONNECTED",
    owner: "CHIEF_RISK_COMPLIANCE",
    tables: ["ujenzi_government_applications"],
    api: [],
    events: [],
    noeliaTools: ["government.integration.status"],
    notes: "Uses BEYU Government Integration Fabric. Official APIs not live.",
  },
  {
    capability: "finance_handoff",
    status: "BLOCKED",
    owner: "GROUP_CFO",
    tables: ["ujenzi_cost_trackers", "ujenzi_progress_certificates"],
    api: ["/api/v1/ujenzi/progress"],
    events: [],
    noeliaTools: [],
    notes: "CAP_POSTING LOCKED. JournalsPosted always false from Ujenzi.",
  },
  {
    capability: "offline_sync",
    status: "IMPLEMENTED",
    owner: "SECTOR_OPERATOR",
    tables: ["ujenzi_sync_envelopes"],
    api: ["/api/v1/ujenzi/sync"],
    events: [],
    noeliaTools: [],
    notes: "Idempotent envelopes. Server authorization still required.",
  },
];
