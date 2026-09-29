/**
 * BEYU Federation & Trust — TANZANIA jurisdiction profile (data, not core).
 *
 * Tanzania is the FIRST jurisdiction profile. The profile records:
 *  - the government structure and the authoritative directory source,
 *  - legal framework references (citations — never re-derivations),
 *  - the GovESB integration regime as REQUIREMENTS TO VERIFY (program §12),
 *  - network/trust-service/residency posture,
 *  - the recorded capability negotiation table.
 *
 * Every entry is a requirement or reference, not a compliance claim.
 */

export const TZ_JURISDICTION = {
  code: "TZ",
  name: "Tanzania",
  kind: "COUNTRY",
  status: "ACTIVE",
  countryCode: "TZ",
  governmentStructure:
    "Unitary republic (Union): President, Prime Minister, 26 mainland regions + Zanzibar semi-autonomous government; ministries, departments and agencies (MDAs); regional commissioners; local government authorities (LGAs).",
  authorityDirectorySource:
    "Tanzania Government Directory (go.tz) — official Ministry/Department/Agency directory; regions; local government authorities. Program baseline (2026-09-28): 325 MDA entries, 26 regions, 126 LGAs. Baseline is documented, NOT live-fetched in this environment; reconciliation is repeatable.",
  legalFrameworkReferences: [
    "Constitution of the United Republic of Tanzania, 1977 (as amended)",
    "Personal Data Protection Act, 2022 (PDPA)",
    "Electronic and Postal Communications Act, 2010 (EPCA)",
    "e-Government Policy 2011 (e-GA)",
    "Public Procurement Act, 2011 and regulations",
    "Public-Private Partnership Act, 2012",
    "Companies Act, 2002",
    "Tanzania Revenue Act and tax statutes (as administered by TRA)",
    "Banking and Financial Institutions Act, 2004",
    "Health Professions Acts (councils)",
    "Local Government Act, 1982 and Local Government (District Councils) Act, 1999",
  ],
  dataProtectionFramework: "Personal Data Protection Act 2022; Personal Data Protection Commission (PDPC). Data subject rights, controller registration, cross-border transfer controls.",
  identityFramework: "National ID (NIDA, NIN); civil status (RITA); immigration (Immigration Services Department). Digital identity infrastructure referenced in the e-GA policy.",
  integrationRegime: {
    name: "GovESB (Government Enterprise Service Bus)",
    status: "REQUIREMENTS_ONLY",
    note: "Tanzania e-GA documentation states that GovESB integrations require appropriate registration, security assessment, testing, permissions, DR arrangements and, for data sharing involving private entities or researchers, a valid data-sharing agreement. These are REQUIREMENTS TO BE VERIFIED against the current applicable e-GA rules — not proof that BEYU satisfies them.",
    requirements: [
      "system registration with e-GA",
      "service registration per connected service",
      "security assessment",
      "testing environment (sandbox) pass",
      "production environment approval",
      "appropriate roles and permissions",
      "disaster-recovery (DR) site arrangement",
      "data-sharing agreement for private-entity/researcher data sharing",
      "approved integration architecture",
      "GovNET/IPSec network requirements",
      "confidentiality, integrity and availability controls",
      "data dictionary / schema compliance",
    ],
  },
  networkRequirements: ["GovNET access where required", "IPSec where required", "e-GA approved connectivity"],
  trustServices: ["Digital signature infrastructure (referenced in EPCA)", "Data Protection Commission", "Government service directory (e-GA)"],
  dataResidency: {
    localization: "Cross-border transfer of personal data is controlled by PDPA 2022; do not assume data may leave Tanzania simply because an API works.",
    approvedTransferMechanisms: ["PDPA-recognized transfer mechanisms — verify current PDPC guidance before any transfer"],
  },
  crossBorderInterfaces: ["EAC (East African Community)", "SADC", "African Union", "bilateral treaties (verify per domain)"],
  profileVersion: "1.0.0",
  notes: "First jurisdiction profile of the BEYU Federation & Trust shared capability. All future countries are additional profiles; the federation core is jurisdiction-generic.",
} as const;

/**
 * Recorded capability negotiation table for TZ (program §61). Availability
 * states are the current HONEST posture: public-first services that are
 * PUBLIC_INFORMATION/PUBLIC_SERVICE exist; everything requiring protected
 * access is REQUIRES_* until legally authorized.
 */
export const TZ_CAPABILITIES: {
  capabilityCode: string;
  availability: string;
  legalBasisRef: string | null;
  connectorRef: string | null;
  dataResidency: string | null;
  costStatus: string;
  requiresHumanApproval: "TRUE" | "FALSE" | "UNKNOWN";
  notes: string | null;
}[] = [
  { capabilityCode: "IDENTITY_VERIFICATION", availability: "REQUIRES_AUTHORIZATION", legalBasisRef: "FDLB_TZ_PDPA", connectorRef: null, dataResidency: "NIN data is protected personal data (PDPA 2022)", costStatus: "UNKNOWN_COST", requiresHumanApproval: "TRUE", notes: "NIDA NIN verification requires agreement + GovESB; no public self-service API verified." },
  { capabilityCode: "CIVIL_STATUS_VERIFICATION", availability: "REQUIRES_AUTHORIZATION", legalBasisRef: null, connectorRef: null, dataResidency: "Civil records are protected", costStatus: "UNKNOWN_COST", requiresHumanApproval: "TRUE", notes: "RITA services are portal-based; no API verified." },
  { capabilityCode: "COMPANY_VERIFICATION", availability: "REQUIRES_AUTHORIZATION", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "UNKNOWN_COST", requiresHumanApproval: "TRUE", notes: "BRELA company/business-name verification is portal-only (existing fabric row: CONTRACT_PENDING)." },
  { capabilityCode: "TAX_FILING", availability: "REQUIRES_GOVERNMENT_CONNECTION", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "UNKNOWN_COST", requiresHumanApproval: "TRUE", notes: "TRA e-filing/VFD channel exists (existing fabric row: EXTERNAL_BLOCKED — TRA certificate not issued)." },
  { capabilityCode: "TAXPAYER_VERIFICATION", availability: "REQUIRES_AUTHORIZATION", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "UNKNOWN_COST", requiresHumanApproval: "TRUE", notes: "Verify TIN/taxpayer status — requires TRA authorization." },
  { capabilityCode: "HEALTH_INSURANCE_VERIFICATION", availability: "REQUIRES_AUTHORIZATION", legalBasisRef: null, connectorRef: null, dataResidency: "Health data is protected (PDPA)", costStatus: "UNKNOWN_COST", requiresHumanApproval: "TRUE", notes: "NHIF eligibility/claims require facility credentials (existing fabric row: EXTERNAL_BLOCKED)." },
  { capabilityCode: "PROFESSIONAL_CREDENTIAL_VERIFICATION", availability: "REQUIRES_AUTHORIZATION", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "UNKNOWN_COST", requiresHumanApproval: "TRUE", notes: "Health/education/other professional councils verify credentials through their systems; authorization required per council." },
  { capabilityCode: "SOCIAL_SECURITY_CONTRIBUTION_VERIFICATION", availability: "REQUIRES_AUTHORIZATION", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "UNKNOWN_COST", requiresHumanApproval: "TRUE", notes: "NSSF/PSSSF contribution verification is portal-based today (existing fabric rows: CONTRACT_PENDING)." },
  { capabilityCode: "PUBLIC_STATISTICS", availability: "AVAILABLE", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "PUBLIC_INFORMATION", requiresHumanApproval: "FALSE", notes: "NBS publishes public statistics; public information only — not a data service entitlement." },
  { capabilityCode: "GOVERNMENT_SERVICE_DIRECTORY", availability: "AVAILABLE", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "PUBLIC_INFORMATION", requiresHumanApproval: "FALSE", notes: "The official government directory/service listings are public information (reconciliation baseline source)." },
  { capabilityCode: "LAND_REGISTRATION_VERIFICATION", availability: "REQUIRES_LOCAL_ENTITY", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "UNKNOWN_COST", requiresHumanApproval: "TRUE", notes: "Land registry verification requires a standing in Tanzania; no public API." },
  { capabilityCode: "CONSTRUCTION_REGISTRATION", availability: "REQUIRES_LOCAL_ENTITY", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "UNKNOWN_COST", requiresHumanApproval: "TRUE", notes: "CRB/ERB/AQRB registration verification requires authorized access." },
  { capabilityCode: "MINERAL_LICENSING_VERIFICATION", availability: "REQUIRES_AUTHORIZATION", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "UNKNOWN_COST", requiresHumanApproval: "TRUE", notes: "Mining Commission licensing data — authorization required." },
  { capabilityCode: "CUSTOMS", availability: "REQUIRES_GOVERNMENT_CONNECTION", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "UNKNOWN_COST", requiresHumanApproval: "TRUE", notes: "TRA Customs operations require the customs channel; not connected." },
  { capabilityCode: "PAYMENTS", availability: "REQUIRES_LOCAL_ENTITY", legalBasisRef: null, connectorRef: null, dataResidency: null, costStatus: "UNKNOWN_COST", requiresHumanApproval: "TRUE", notes: "Bank/payment-system participation requires a licensed local entity (BoT oversight)." },
];
