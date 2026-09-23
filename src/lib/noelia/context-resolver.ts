/**
 * NOELIA CROSS-OS CONTEXT RESOLVER
 *
 * Derives and validates the active OS context and professional manifestations
 * from authoritative authorization/context data. Prevents client spoofing of
 * OS context or professional context.
 *
 * CANONICAL ARCHITECTURE:
 * ONE canonical Noelia identity: NOELIA_AI across all contexts.
 * Contextual appearance changes Noelia's visual manifestation without
 * creating a new Noelia identity.
 * UJENZI_OS is a Sector OS.
 * Architectural and Engineering manifestations are governed contexts
 * inside UJENZI_OS, not separate operating systems.
 */
import type { NoeliaAuthorizedScope, NoeliaTargetContext } from "./types";
import { NOELIA_CANONICAL_ID } from "./canonical-identity";

export const SUPPORTED_NOELIA_OS_CONTEXTS = [
  "BEYU_OS",
  "HEALTH_OS",
  "FINANCE_OS",
  "AGRICULTURE_OS",
  "UJENZI_OS",
] as const;
export type SupportedNoeliaOSContext = (typeof SUPPORTED_NOELIA_OS_CONTEXTS)[number];

export const SUPPORTED_UJENZI_PROFESSIONAL_CONTEXTS = [
  "ARCHITECTURAL",
  "ENGINEERING",
  "CONSTRUCTION",
  "SITE",
  "HSE",
  "BIM",
  "BOQ_COST",
  "QUALITY_NCR",
  "COMMISSIONING",
] as const;
export type SupportedUjenziProfessionalContext = (typeof SUPPORTED_UJENZI_PROFESSIONAL_CONTEXTS)[number];
export type SupportedNoeliaProfessionalContext = SupportedUjenziProfessionalContext;

export type NoeliaContextualAppearance = {
  identityId: typeof NOELIA_CANONICAL_ID.canonical_id;
  osContext: SupportedNoeliaOSContext;
  professionalContext?: SupportedNoeliaProfessionalContext;
  assetPath: string;
  logicalAssetId: string;
  contextualLabel: string;
  status: "AUTHORITATIVE" | "FALLBACK_CANONICAL" | "DENIED";
  notes?: string;
};

export type ResolvedNoeliaContext = {
  canonicalIdentity: typeof NOELIA_CANONICAL_ID;
  activeOS: string | null;
  professionalContext?: SupportedUjenziProfessionalContext | null;
  authorizedContext: boolean;
  authorizationScope: NoeliaAuthorizedScope;
  visualManifestation: string;
  personalityModifier: string;
  availableCapabilities: string[];
  toolPermissions: string[];
  memoryScope: string[];
  contextualAppearance: NoeliaContextualAppearance;
  auditEvent?: {
    action: "NOELIA_CONTEXT_CHANGED";
    objectType: "NOELIA_CONTEXT";
    objectId: string;
    outcome: "SUCCESS" | "DENIED";
    metadata: Record<string, unknown>;
  };
  denialReason?: string;
  denialCode?: string;
};

/**
 * CANONICAL VISUAL ASSET MAPPING.
 *
 * NOELIA.png = SINGLE CANONICAL NOELIA APPEARANCE. Every OS context resolves
 * to the same canonical asset (`/NOELIA.png`). Context changes wording,
 * capabilities, tools and workflows — never the appearance asset. The mapping
 * keys are retained so contextual metadata (labels, audit context) remains
 * per-OS while the visual identity stays ONE.
 */
const NOELIA_CANONICAL_APPEARANCE_ENTRY = {
  path: "/NOELIA.png",
  logicalId: "noelia-canonical",
  sha256: "643b375a9abc074a5e4b53d581b09c20fddbfca6701f0d71f3a13c3d5754c990",
  status: "AUTHORITATIVE",
  notes:
    "Single canonical Noelia appearance (/NOELIA.png). Never modified, recompressed, recolored, cropped, or regenerated.",
} as const;

export const NOELIA_ASSET_MAPPING: Record<
  string,
  {
    path: string;
    logicalId: string;
    sha256?: string;
    status: "AUTHORITATIVE" | "FALLBACK_CANONICAL";
    notes?: string;
  }
> = {
  BEYU_OS: { ...NOELIA_CANONICAL_APPEARANCE_ENTRY },
  FINANCE_OS: { ...NOELIA_CANONICAL_APPEARANCE_ENTRY },
  HEALTH_OS: { ...NOELIA_CANONICAL_APPEARANCE_ENTRY },
  AGRICULTURE_OS: { ...NOELIA_CANONICAL_APPEARANCE_ENTRY },
  UJENZI_OS: { ...NOELIA_CANONICAL_APPEARANCE_ENTRY },
  NOELIA_AI: { ...NOELIA_CANONICAL_APPEARANCE_ENTRY },
};

export function resolveNoeliaOSContext(
  requestedOS: string | null,
  scope: NoeliaAuthorizedScope,
  target: NoeliaTargetContext,
  requestedProfessionalContext?: string | null,
): ResolvedNoeliaContext {
  // Derive active OS from authorization scope, not from arbitrary client input.
  // The target does not carry an OS field; OS must be validated against authorization scope.
  const authorizedOSContexts: string[] = (scope as Record<string, unknown>).osContexts as string[] ?? ["BEYU_OS"];
  const activeOS = (requestedOS ?? "BEYU_OS").toUpperCase();

  // Validate OS authorization: client cannot spoof an unauthorized OS
  const isAuthorizedOS = authorizedOSContexts.includes(activeOS) || activeOS === "BEYU_OS";

  if (!isAuthorizedOS) {
    return {
      canonicalIdentity: NOELIA_CANONICAL_ID,
      activeOS,
      professionalContext: null,
      authorizedContext: false,
      authorizationScope: scope,
      visualManifestation: "",
      personalityModifier: "",
      availableCapabilities: [],
      toolPermissions: [],
      memoryScope: [],
      contextualAppearance: {
        identityId: NOELIA_CANONICAL_ID.canonical_id,
        osContext: (activeOS in NOELIA_ASSET_MAPPING ? activeOS : "BEYU_OS") as SupportedNoeliaOSContext,
        assetPath: "",
        logicalAssetId: "",
        contextualLabel: "Unauthorized Context",
        status: "DENIED",
        notes: `OS context '${activeOS}' is not authorized.`,
      },
      auditEvent: {
        action: "NOELIA_CONTEXT_CHANGED",
        objectType: "NOELIA_CONTEXT",
        objectId: NOELIA_CANONICAL_ID.canonical_id,
        outcome: "DENIED",
        metadata: {
          requestedOS: activeOS,
          reason: "OS_DENIED",
        },
      },
      denialReason: `OS context '${activeOS}' is not authorized for this principal. The effective OS context must be derived from authoritative authorization data.`,
      denialCode: "OS_DENIED",
    };
  }

  // Validate professional context if requested
  const normalizedProf = requestedProfessionalContext
    ? (requestedProfessionalContext.toUpperCase() as SupportedUjenziProfessionalContext)
    : null;

  if (normalizedProf) {
    // Professional contexts are governed manifestations inside UJENZI_OS only.
    if (activeOS !== "UJENZI_OS") {
      return {
        canonicalIdentity: NOELIA_CANONICAL_ID,
        activeOS,
        professionalContext: null,
        authorizedContext: false,
        authorizationScope: scope,
        visualManifestation: "",
        personalityModifier: "",
        availableCapabilities: [],
        toolPermissions: [],
        memoryScope: [],
        contextualAppearance: {
          identityId: NOELIA_CANONICAL_ID.canonical_id,
          osContext: activeOS as SupportedNoeliaOSContext,
          assetPath: "",
          logicalAssetId: "",
          contextualLabel: "Unauthorized Professional Context",
          status: "DENIED",
          notes: `Professional context '${normalizedProf}' is not supported in ${activeOS}. Professional manifestations exist only inside UJENZI_OS.`,
        },
        auditEvent: {
          action: "NOELIA_CONTEXT_CHANGED",
          objectType: "NOELIA_CONTEXT",
          objectId: NOELIA_CANONICAL_ID.canonical_id,
          outcome: "DENIED",
          metadata: {
            requestedOS: activeOS,
            requestedProfessionalContext: normalizedProf,
            reason: "PROFESSIONAL_CONTEXT_NOT_SUPPORTED_IN_OS",
          },
        },
        denialReason: `Professional contexts are governed contexts inside UJENZI_OS only, not separate operating systems, and are not supported in '${activeOS}'.`,
        denialCode: "PROFESSIONAL_CONTEXT_DENIED",
      };
    }

    // Must be in the supported Ujenzi professional catalogue
    if (!SUPPORTED_UJENZI_PROFESSIONAL_CONTEXTS.includes(normalizedProf)) {
      return {
        canonicalIdentity: NOELIA_CANONICAL_ID,
        activeOS,
        professionalContext: null,
        authorizedContext: false,
        authorizationScope: scope,
        visualManifestation: "",
        personalityModifier: "",
        availableCapabilities: [],
        toolPermissions: [],
        memoryScope: [],
        contextualAppearance: {
          identityId: NOELIA_CANONICAL_ID.canonical_id,
          osContext: "UJENZI_OS",
          assetPath: "",
          logicalAssetId: "",
          contextualLabel: "Unsupported Professional Context",
          status: "DENIED",
          notes: `Professional context '${normalizedProf}' is not supported by UJENZI_OS.`,
        },
        auditEvent: {
          action: "NOELIA_CONTEXT_CHANGED",
          objectType: "NOELIA_CONTEXT",
          objectId: NOELIA_CANONICAL_ID.canonical_id,
          outcome: "DENIED",
          metadata: {
            requestedOS: activeOS,
            requestedProfessionalContext: normalizedProf,
            reason: "PROFESSIONAL_CONTEXT_UNSUPPORTED",
          },
        },
        denialReason: `Professional context '${normalizedProf}' is not supported by UJENZI_OS.`,
        denialCode: "PROFESSIONAL_CONTEXT_DENIED",
      };
    }

    // Check if the scope restricts professional contexts
    const authorizedProfContexts = (scope as Record<string, unknown>).professionalContexts as string[] | undefined;
    if (authorizedProfContexts !== undefined && !authorizedProfContexts.includes(normalizedProf)) {
      return {
        canonicalIdentity: NOELIA_CANONICAL_ID,
        activeOS,
        professionalContext: null,
        authorizedContext: false,
        authorizationScope: scope,
        visualManifestation: "",
        personalityModifier: "",
        availableCapabilities: [],
        toolPermissions: [],
        memoryScope: [],
        contextualAppearance: {
          identityId: NOELIA_CANONICAL_ID.canonical_id,
          osContext: "UJENZI_OS",
          assetPath: "",
          logicalAssetId: "",
          contextualLabel: "Unauthorized Professional Context",
          status: "DENIED",
          notes: `Professional context '${normalizedProf}' is not authorized for this principal scope.`,
        },
        auditEvent: {
          action: "NOELIA_CONTEXT_CHANGED",
          objectType: "NOELIA_CONTEXT",
          objectId: NOELIA_CANONICAL_ID.canonical_id,
          outcome: "DENIED",
          metadata: {
            requestedOS: activeOS,
            requestedProfessionalContext: normalizedProf,
            reason: "PROFESSIONAL_CONTEXT_UNAUTHORIZED",
          },
        },
        denialReason: `Professional context '${normalizedProf}' is not authorized for this principal scope.`,
        denialCode: "PROFESSIONAL_CONTEXT_DENIED",
      };
    }
  }

  // Resolve visual manifestation from canonical asset registry
  const mappingKey = activeOS in NOELIA_ASSET_MAPPING ? activeOS : "NOELIA_AI";
  const mapping = NOELIA_ASSET_MAPPING[mappingKey] ?? NOELIA_ASSET_MAPPING["NOELIA_AI"];

  // Contextual Label
  let contextualLabel = `Noelia ${activeOS.replace("_", " ")} Manifestation`;
  if (activeOS === "UJENZI_OS") {
    if (normalizedProf === "ARCHITECTURAL") {
      contextualLabel = "Noelia Ujenzi OS — Architectural Manifestation";
    } else if (normalizedProf === "ENGINEERING") {
      contextualLabel = "Noelia Ujenzi OS — Engineering Manifestation";
    } else if (normalizedProf) {
      contextualLabel = `Noelia Ujenzi OS — ${normalizedProf.charAt(0) + normalizedProf.slice(1).toLowerCase().replace("_", " ")} Manifestation`;
    } else {
      contextualLabel = "Noelia Ujenzi OS Manifestation";
    }
  } else if (activeOS === "BEYU_OS") {
    contextualLabel = "Noelia BEYU OS Manifestation";
  } else if (activeOS === "FINANCE_OS") {
    contextualLabel = "Noelia Finance OS Manifestation";
  } else if (activeOS === "HEALTH_OS") {
    contextualLabel = "Noelia Health OS Manifestation";
  } else if (activeOS === "AGRICULTURE_OS") {
    contextualLabel = "Noelia Agriculture OS Manifestation";
  }

  const contextualAppearance: NoeliaContextualAppearance = {
    identityId: NOELIA_CANONICAL_ID.canonical_id,
    osContext: (activeOS in NOELIA_ASSET_MAPPING ? activeOS : "BEYU_OS") as SupportedNoeliaOSContext,
    professionalContext: normalizedProf ? normalizedProf : undefined,
    assetPath: mapping.path,
    logicalAssetId: mapping.logicalId,
    contextualLabel,
    status: mapping.status,
    notes: mapping.notes,
  };

  // Resolve capabilities based on OS authorization (subset of canonical identity capabilities)
  const capabilityMap: Record<string, string[]> = {
    BEYU_OS: [
      "GOVERNANCE",
      "EXECUTIVE",
      "COMPLIANCE",
      "ANALYTICS",
      "CROSS_OS",
      "KNOWLEDGE",
      "FINANCIAL",
      "RISK",
      "TAX",
      "HEALTH",
      "AGRICULTURE",
      "WORKFORCE",
      "LEGAL",
    ],
    FINANCE_OS: [
      "FINANCIAL",
      "RISK",
      "COMPLIANCE",
      "GOVERNANCE",
      "TAX",
      "ANALYTICS",
      "KNOWLEDGE",
      "EXECUTIVE",
    ],
    HEALTH_OS: [
      "HEALTH",
      "COMPLIANCE",
      "GOVERNANCE",
      "ANALYTICS",
      "KNOWLEDGE",
      "EXECUTIVE",
    ],
    AGRICULTURE_OS: [
      "AGRICULTURE",
      "FINANCIAL",
      "GOVERNANCE",
      "ANALYTICS",
      "KNOWLEDGE",
      "EXECUTIVE",
    ],
    UJENZI_OS: [
      "UJENZI",
      "CONSTRUCTION",
      "PROJECTS",
      "BOQ_COST",
      "QUALITY_NCR",
      "HSE",
      "SITE_OPERATIONS",
      "ANALYTICS",
      "KNOWLEDGE",
      "EXECUTIVE",
    ],
    NOELIA_AI: ["KNOWLEDGE", "EXECUTIVE", "COMPLIANCE", "ANALYTICS"],
  };

  let availableCapabilities = capabilityMap[activeOS] ?? capabilityMap["BEYU_OS"];
  if (activeOS === "UJENZI_OS" && normalizedProf) {
    if (normalizedProf === "ARCHITECTURAL") {
      availableCapabilities = [
        "ARCHITECTURAL_COORDINATION",
        "BIM_SPATIAL",
        "DESIGN_REVIEW",
        "PLANNING",
        "DOCUMENTATION",
        "ANALYTICS",
        "KNOWLEDGE",
        "EXECUTIVE",
      ];
    } else if (normalizedProf === "ENGINEERING") {
      availableCapabilities = [
        "STRUCTURAL_ANALYSIS",
        "CIVIL_WORKS",
        "MEP_COORDINATION",
        "GEOTECHNICAL",
        "SITE_ENGINEERING",
        "ANALYTICS",
        "KNOWLEDGE",
        "EXECUTIVE",
      ];
    } else if (normalizedProf === "CONSTRUCTION") {
      availableCapabilities = [
        "CONSTRUCTION_EXECUTION",
        "SITE_OPERATIONS",
        "CONTRACTOR_COORDINATION",
        "ANALYTICS",
        "KNOWLEDGE",
        "EXECUTIVE",
      ];
    } else if (normalizedProf === "SITE") {
      availableCapabilities = [
        "SITE_OPERATIONS",
        "DAILY_DIARIES",
        "EQUIPMENT_ALLOCATION",
        "ANALYTICS",
        "KNOWLEDGE",
        "EXECUTIVE",
      ];
    } else if (normalizedProf === "HSE") {
      availableCapabilities = [
        "HSE_INCIDENTS",
        "HAZARDS",
        "TOOLBOX_TALKS",
        "ANALYTICS",
        "KNOWLEDGE",
        "EXECUTIVE",
      ];
    } else if (normalizedProf === "BIM") {
      availableCapabilities = [
        "BIM_COORDINATION",
        "SPATIAL_MODELING",
        "CLASH_GUIDANCE",
        "ANALYTICS",
        "KNOWLEDGE",
        "EXECUTIVE",
      ];
    } else if (normalizedProf === "BOQ_COST") {
      availableCapabilities = [
        "BOQ_TRACKING",
        "COST_CONTROL",
        "VARIATIONS",
        "ANALYTICS",
        "KNOWLEDGE",
        "EXECUTIVE",
      ];
    } else if (normalizedProf === "QUALITY_NCR") {
      availableCapabilities = [
        "QUALITY_INSPECTIONS",
        "NCRS",
        "PUNCH_LISTS",
        "ANALYTICS",
        "KNOWLEDGE",
        "EXECUTIVE",
      ];
    } else if (normalizedProf === "COMMISSIONING") {
      availableCapabilities = [
        "COMMISSIONING",
        "HANDOVER",
        "CERTIFICATES",
        "ANALYTICS",
        "KNOWLEDGE",
        "EXECUTIVE",
      ];
    }
  }

  // Personality modifier: context-aware terminology adjustments (no independent personality)
  const modifierMap: Record<string, string> = {
    BEYU_OS: "Enterprise governance, executive intelligence, organizational orchestration vocabulary.",
    FINANCE_OS: "Financial accounting, treasury, payments, risk, compliance vocabulary.",
    HEALTH_OS: "Clinical, patient-care, health operations, healthcare compliance vocabulary.",
    AGRICULTURE_OS: "Agriculture, farm management, crop, livestock, field operations vocabulary.",
    UJENZI_OS: "Construction operations, project management, site execution, quality, and cost control vocabulary.",
    NOELIA_AI: "General canonical identity vocabulary.",
  };

  let personalityModifier = modifierMap[activeOS] ?? modifierMap["BEYU_OS"];
  if (activeOS === "UJENZI_OS" && normalizedProf) {
    if (normalizedProf === "ARCHITECTURAL") {
      personalityModifier = "Architectural design, spatial coordination, BIM, planning, and architectural documentation vocabulary.";
    } else if (normalizedProf === "ENGINEERING") {
      personalityModifier = "Structural engineering, civil works, MEP systems, geotechnical, and site engineering vocabulary.";
    } else if (normalizedProf === "CONSTRUCTION") {
      personalityModifier = "Construction execution, contractor workflows, field supervision, and site logistics vocabulary.";
    } else if (normalizedProf === "SITE") {
      personalityModifier = "Site operations, daily diary logs, equipment logistics, and field management vocabulary.";
    } else if (normalizedProf === "HSE") {
      personalityModifier = "Health, safety, environment, hazard identification, and incident prevention vocabulary.";
    } else if (normalizedProf === "BIM") {
      personalityModifier = "Building Information Modeling, spatial coordination, and digital twin alignment vocabulary.";
    } else if (normalizedProf === "BOQ_COST") {
      personalityModifier = "Bill of quantities, cost tracking, payment claims, and variation management vocabulary.";
    } else if (normalizedProf === "QUALITY_NCR") {
      personalityModifier = "Quality assurance, inspection testing plans (ITP), NCR resolution, and snagging vocabulary.";
    } else if (normalizedProf === "COMMISSIONING") {
      personalityModifier = "Commissioning verification, punch item clearance, and project handover vocabulary.";
    }
  }

  const memoryScope = [`OS_CONTEXT:${activeOS}`];
  if (normalizedProf) {
    memoryScope.push(`PROFESSIONAL_CONTEXT:${activeOS}:${normalizedProf}`);
  }

  const auditEvent = {
    action: "NOELIA_CONTEXT_CHANGED" as const,
    objectType: "NOELIA_CONTEXT" as const,
    objectId: NOELIA_CANONICAL_ID.canonical_id,
    outcome: "SUCCESS" as const,
    metadata: {
      activeOS,
      professionalContext: normalizedProf,
      logicalAssetId: mapping.logicalId,
      status: mapping.status,
    },
  };

  return {
    canonicalIdentity: NOELIA_CANONICAL_ID,
    activeOS,
    professionalContext: normalizedProf,
    authorizedContext: true,
    authorizationScope: scope,
    visualManifestation: mapping.path,
    personalityModifier,
    availableCapabilities,
    toolPermissions: ["ai:memory.read", "ai:analytics.read", `os:${activeOS.toLowerCase().replace("_os", "")}.read`],
    memoryScope,
    contextualAppearance,
    auditEvent,
  };
}
