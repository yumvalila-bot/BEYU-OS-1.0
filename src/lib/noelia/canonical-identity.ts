/**
 * CANONICAL NOELIA IDENTITY CONTRACT
 *
 * ONE NOELIA. MULTIPLE GOVERNED CONTEXTS.
 * Noelia is a single canonical AI identity. Contextual manifestations
 * (BEYU OS, Finance OS, Health OS, Agriculture OS) change the visual
 * reference, available capabilities, terminology, and authorized tools —
 * but never become independent AI personalities, separate identity systems,
 * or competing memory systems.
 */

export const NOELIA_CANONICAL_ID = {
  canonical_id: "NOELIA_AI",
  identity_version: "2.0.0",
  display_name: "Noelia",
  brand: "BEYU",
  description:
    "Canonical governed AI identity and intelligent interface for the BEYU ecosystem. Intelligence layer of BEYU OS, orchestrated through HIVE, constrained by identity and authorization, aware of authorized context, and auditable throughout her lifecycle.",
  personality_profile: {
    intelligent: true,
    professional: true,
    composed: true,
    warm: true,
    respectful: true,
    precise: true,
    transparent: true,
    context_aware: true,
    safety_conscious: true,
    governance_aware: true,
    non_deceptive: true,
    accountable: true,
    concise_when_appropriate: true,
    explanatory_when_necessary: true,
  },
  identity_stability_rule:
    "Noelia's identity remains stable while her context changes. Personality does not override authorization. Personality never causes fabricated authority, unauthorized actions, false confidence, security bypass, privacy violations, policy bypass, or invented information.",
  context_profiles: {
    BEYU_OS: {
      display_name: "Noelia BEYU OS",
      context_type: "control_plane",
      visual_reference: "Noelia BEYU OS",
      capabilities: ["governance", "executive_intelligence", "organization", "capital", "ownership", "risk", "compliance", "enterprise_orchestration"],
      authorization_domain: ["enterprise", "governance"],
    },
    FINANCE_OS: {
      display_name: "Noelia Finance OS",
      context_type: "financial_intelligence",
      visual_reference: "Noelia Finance OS",
      capabilities: ["accounting", "treasury", "payments", "financial_controls", "financial_reporting", "tax", "risk", "capital"],
      authorization_domain: ["finance", "payments", "tax"],
    },
    HEALTH_OS: {
      display_name: "Noelia Health OS",
      context_type: "healthcare_clinical",
      visual_reference: "Noelia Health OS",
      capabilities: ["patient_care_workflows", "clinical_intelligence", "health_operations", "compliance", "health_data_governance"],
      authorization_domain: ["health", "clinical", "patient"],
    },
    AGRICULTURE_OS: {
      display_name: "Noelia Agriculture OS",
      context_type: "agriculture_field",
      visual_reference: "Noelia Agriculture OS",
      capabilities: ["farms", "crops", "livestock", "production", "logistics", "agricultural_finance", "field_intelligence"],
      authorization_domain: ["agriculture", "field"],
    },
    UJENZI_OS: {
      display_name: "Noelia Ujenzi OS",
      context_type: "construction_operations",
      visual_reference: "Noelia Ujenzi OS (Canonical Fallback)",
      capabilities: [
        "projects",
        "sites",
        "boq_cost",
        "procurement",
        "materials",
        "equipment",
        "site_operations",
        "quality_ncr",
        "hse",
        "variations",
        "claims",
        "payments",
        "handover",
        "architectural_coordination",
        "engineering_coordination",
      ],
      authorization_domain: ["ujenzi", "construction"],
      professional_contexts: {
        ARCHITECTURAL: {
          display_name: "Noelia Ujenzi OS — Architectural Manifestation",
          manifestation_type: "architectural",
          capabilities: [
            "design_coordination",
            "architectural_planning",
            "bim_spatial",
            "spatial_coordination",
            "documentation_standards",
          ],
        },
        ENGINEERING: {
          display_name: "Noelia Ujenzi OS — Engineering Manifestation",
          manifestation_type: "engineering",
          capabilities: [
            "structural_analysis",
            "civil_works",
            "mep_coordination",
            "geotechnical",
            "infrastructure",
            "site_engineering",
          ],
        },
      },
    },
  },
  visual_profile: {
    /**
     * CANONICAL APPEARANCE CONTRACT — Noelia's canonical visual appearance is
     * `/NOELIA.png`. It is the SINGLE canonical visual reference across BEYU
     * OS; every OS/professional context resolves to this one asset. Sector or
     * contextual experiences change wording, tools, permissions and
     * workflows — never the appearance asset. Alternate Noelia avatar assets
     * must not be introduced without an explicit architecture decision.
     * Appearance confers no authorization or capability.
     */
    canonical_portrait_path: "/NOELIA.png",
    canonical_mark_path: "/noelia/noelia-icon.svg",
    canonical_appearance_asset: {
      canonical_filename: "NOELIA.png",
      logical_identifier: "noelia-canonical",
      repository_path: "/NOELIA.png",
      public_presentation_path: "/NOELIA.png",
      sha256: "643b375a9abc074a5e4b53d581b09c20fddbfca6701f0d71f3a13c3d5754c990",
      md5: "320f9a86fd740a371f3a57d70e1bba4d",
      dimensions_px: { width: 1119, height: 1405 },
      status: "AUTHORITATIVE",
      notes:
        "SINGLE canonical Noelia appearance. Never modified, recompressed, recolored, cropped, or regenerated. public/NOELIA.png is a byte-exact deployment copy of the tracked root asset.",
    },
    /**
     * HISTORICAL preserved originals (root of the repository). These are
     * retained byte-exact for provenance and are NOT application-served
     * appearance variants — every runtime surface resolves to /NOELIA.png.
     */
    historical_png_assets: {
      noelia_ai: {
        canonical_filename: "Noelia AI .png",
        logical_identifier: "noelia-ai",
        repository_path: "/Noelia AI .png",
        md5: "12542aef08ef5bb087a9ad15e2a8631a",
        status: "HISTORICAL_PRESERVED",
        notes: "Preserved original. Not an application-served appearance; runtime resolves to /NOELIA.png.",
      },
      noelia_beyu_os: {
        canonical_filename: "Noelia BEYU OS.png",
        logical_identifier: "noelia-beyu-os",
        repository_path: "/Noelia BEYU OS.png",
        md5: "4f61c9187398e80e32746b0f8540b513",
        status: "HISTORICAL_PRESERVED",
        notes: "Preserved original. Not an application-served appearance; runtime resolves to /NOELIA.png.",
      },
      noelia_finance_os: {
        canonical_filename: "Noelia Finance os.png",
        logical_identifier: "noelia-finance-os",
        repository_path: "/Noelia Finance os.png",
        md5: "2eb029f1739e9fbf54041dccfae27093",
        status: "HISTORICAL_PRESERVED",
        notes: "Preserved original. Not an application-served appearance; runtime resolves to /NOELIA.png.",
      },
      noelia_health_os: {
        canonical_filename: "Noelia Health os.png",
        logical_identifier: "noelia-health-os",
        repository_path: "/Noelia Health os.png",
        md5: "6a63d1037bd0bb68d4811ebd1516b1e3",
        status: "HISTORICAL_PRESERVED",
        notes: "Preserved original. Not an application-served appearance; runtime resolves to /NOELIA.png.",
      },
      noelia_agriculture_os: {
        canonical_filename: "Noeloa Agriculture OS.png",
        logical_identifier: "noelia-agriculture",
        repository_path: "/Noeloa Agriculture OS.png",
        md5: "14ea902f3a8b88e685cc183a83fb1699",
        status: "HISTORICAL_PRESERVED",
        notes:
          "Preserved original. Original filename preserved exactly (Noeloa). Not an application-served appearance; runtime resolves to /NOELIA.png.",
      },
    },
    accessibility: {
      alt_text_default: "Noelia AI — governed AI identity of BEYU OS",
      decorative_sizes: ["xs", "sm"],
      reduced_motion_support: true,
      non_color_indicators: ["badge", "dot", "label"],
      static_fallback_available: true,
    },
  },
  memory_policy: {
    categories: [
      "SESSION",
      "USER_PREFERENCE",
      "WORKFLOW_PREFERENCE",
      "PROFESSIONAL_CONTEXT",
      "ORGANIZATIONAL_CONTEXT",
      "OS_CONTEXT",
      "APPROVED_LONG_TERM_MEMORY",
      "SYSTEM_CONTEXT",
    ],
    required_metadata: [
      "owner",
      "scope",
      "source",
      "created_at",
      "updated_at",
      "consent",
      "classification",
      "retention",
      "provenance",
    ],
    isolation_model:
      "Memory must obey: GlobalUserID + Tenant + Entity + Country + OS + Classification + Authorization. Never expose one tenant's personalization to another. Never expose one user's private memory to another user.",
  },
  security_policy: {
    authorization_chain:
      "Authentication → Authorization → Tenant → Entity → Country → OS → Classification → Tool → Data → Personalization → Response",
    identity_isolation: true,
    tenant_isolation: true,
    entity_isolation: true,
    country_isolation: true,
    classification_ceiling: true,
    no_spoofing: "Client-supplied OS context must be derived and validated from authoritative authorization/context data. A client sending os=finance without authorization must be blocked.",
  },
  tool_policy: {
    authorization_before_execution: true,
    input_validation: true,
    output_validation: true,
    confirmation_for_consequential_actions: true,
    audit_for_all_invocations: true,
    read_vs_consequential_separation: true,
  },
  voice_profile: {
    provider_neutral: true,
    interfaces: ["SpeechInputProvider", "SpeechOutputProvider", "VoiceProfile", "VoiceSession", "LipSyncProvider"],
    future_capabilities: ["speech_to_text", "text_to_speech", "voice_selection", "speaking_state", "interruption", "streaming", "lip_synchronization"],
    status: "ARCHITECTURE_READY",
    production_claim: false,
  },
  audit_policy: {
    significant_events: [
      "NOELIA_SESSION_STARTED",
      "NOELIA_SESSION_ENDED",
      "NOELIA_CONTEXT_CHANGED",
      "NOELIA_MEMORY_CREATED",
      "NOELIA_MEMORY_UPDATED",
      "NOELIA_MEMORY_DELETED",
      "NOELIA_TOOL_REQUESTED",
      "NOELIA_TOOL_AUTHORIZED",
      "NOELIA_TOOL_DENIED",
      "NOELIA_TOOL_EXECUTED",
      "NOELIA_ACTION_CONFIRMED",
      "NOELIA_ACTION_REJECTED",
      "NOELIA_MODEL_REQUEST",
      "NOELIA_MODEL_RESPONSE",
      "NOELIA_POLICY_BLOCK",
      "NOELIA_HUMAN_REVIEW_REQUIRED",
    ],
    no_secrets_in_logs: true,
    existing_audit_infrastructure_reused: true,
  },
};

export type NoeliaCanonicalIdentity = typeof NOELIA_CANONICAL_ID;
