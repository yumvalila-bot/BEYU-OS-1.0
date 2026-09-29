/**
 * BEYU Federation & Trust — TANZANIA legal-basis references (data).
 *
 * Statutory instruments referenced by the TZ jurisdiction profile and
 * capability rows. status REGISTERED = cited in the profile; these are
 * references to verify, NOT compliance claims. effectiveDate null where the
 * consolidated text was not confirmable from the build environment.
 */

export interface TzLegalBaseSeed {
  code: string;
  name: string;
  kind: "ACT" | "REGULATION" | "PROCLAMATION" | "DIRECTIVE" | "TREATY" | "OTHER";
  issuer: string;
  subject: string;
  effectiveDate?: string; // ISO or null (not confirmable from build environment)
  federationRelevance: string;
  notes?: string;
}

export const TZ_LEGAL_BASES: TzLegalBaseSeed[] = [
  {
    code: "FDLB_TZ_PDPA",
    name: "Personal Data Protection Act, 2022 (PDPA)",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Data protection, data-subject rights, controller registration, cross-border transfer control",
    effectiveDate: "2022-01-11",
    federationRelevance: "Primary data-protection constraint on all federation flows touching TZ personal data; cross-border transfer control drives the residency requirement in transition plans.",
    notes: "Enabling regulations phased in after assent; verify current regulatory status during reconciliation.",
  },
  {
    code: "FDLB_TZ_CITIZENSHIP_IDENTITY",
    name: "National Identification and Citizenship Act, 2015 (NIDA Act)",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "National identification (NIN), ID issuance, identity data",
    effectiveDate: "2015-08-26",
    federationRelevance: "Legal basis for NIDA services; NIN data is protected personal data — purpose limitation and consent apply.",
  },
  {
    code: "FDLB_TZ_REGISTRATION_ACT",
    name: "Business Names and Company Registration Act, 2002 (BRELA framework)",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Company registration, business names, registers",
    effectiveDate: "2002",
    federationRelevance: "Legal basis for BRELA registers and search services; successor functions (RITA) under the 2024 registration framework — reconcile.",
    notes: "Verify the current consolidated registration legislation (Registration and Insolvency and Trusteeship Act) during reconciliation.",
  },
  {
    code: "FDLB_TZ_TAX_ADMINISTRATION",
    name: "Tax Administration Act, 2015",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Tax administration, returns, enforcement, taxpayer data",
    effectiveDate: "2015",
    federationRelevance: "Legal basis for TRA services; taxpayer data is protected and subject to statutory purpose limitation (consent not the applicable basis).",
  },
  {
    code: "FDLB_TZ_SOCIAL_SECURITY",
    name: "National Social Security Fund Act, 2013",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Social security contributions and benefits",
    effectiveDate: "2013",
    federationRelevance: "Legal basis for NSSF/PSSSF/WCF verification services; member data is protected.",
  },
  {
    code: "FDLB_TZ_HEALTH_INSURANCE",
    name: "Health Insurance Act, 2001 (NHIF framework)",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Health insurance scheme, contributions, benefits",
    effectiveDate: "2001",
    federationRelevance: "Legal basis for NHIF eligibility/claims services; health data is protected — purpose limitation and purpose-specific agreements required.",
  },
  {
    code: "FDLB_TZ_ELECTRONIC_TRANSACTIONS",
    name: "Electronic Transactions Act, 2003",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Electronic records, signatures, digital evidence",
    effectiveDate: "2003",
    federationRelevance: "Legal recognition of electronic records and signatures used in federation exchanges; verify amendment status during reconciliation.",
  },
  {
    code: "FDLB_TZ_CYBER_CRIME",
    name: "Cybercrimes Act, 2015",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Computer systems security, cyber offences",
    effectiveDate: "2015",
    federationRelevance: "Security obligations for systems and networks handling government data; connectors must be assessed against its provisions.",
  },
  {
    code: "FDLB_TZ_LAND_ACT",
    name: "Land Act, 1999 / Land Registration Act, 1997",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Land tenure, registration, titles",
    effectiveDate: "1999",
    federationRelevance: "Legal basis for land-title records; title data is protected — verification services only through authorized, purpose-limited channels.",
  },
  {
    code: "FDLB_TZ_ENVIRONMENT_MANAGEMENT",
    name: "Environment Management Act, 2000",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Environmental management, EIA, pollution control",
    effectiveDate: "2000",
    federationRelevance: "Legal basis for NEMC EIA and environmental approval services.",
  },
  {
    code: "FDLB_TZ_PUBLIC_PROCUREMENT",
    name: "Public Procurement and Asset Disposal Act, 2011",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Public procurement, asset disposal, supplier registry",
    effectiveDate: "2011",
    federationRelevance: "Legal basis for PPRA/GPSA services and the government supplier registry; contract data is protected.",
  },
  {
    code: "FDLB_TZ_MINING_ACT",
    name: "Mining Act, 2010",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Mineral resources, licensing, revenue, environmental obligations",
    effectiveDate: "2010",
    federationRelevance: "Legal basis for Mining Commission services; licence data access follows the Act's disclosure rules.",
  },
  {
    code: "FDLB_TZ_BASIC_EDUCATION",
    name: "Basic Education Act, 1979 (as amended)",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Basic education administration, examination records",
    effectiveDate: "1979",
    federationRelevance: "Legal basis for education records; student/teacher data is protected.",
  },
  {
    code: "FDLB_TZ_HIGHER_EDUCATION",
    name: "Higher Education Act, 2001",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Universities, accreditation, degree awarding",
    effectiveDate: "2001",
    federationRelevance: "Legal basis for TCUE accreditation and degree-validation services.",
  },
  {
    code: "FDLB_TZ_COMMUNICATIONS",
    name: "Communications Act, 2003",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Communications licensing, spectrum, regulation",
    effectiveDate: "2003",
    federationRelevance: "Legal basis for TCRA licensing and spectrum services.",
  },
  {
    code: "FDLB_TZ_BANKING",
    name: "Banking and Other Financial Institutions Act, 2015",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Banking licences, supervision, payment systems",
    effectiveDate: "2015",
    federationRelevance: "Legal basis for BoT supervision; bank customer data is protected — never accessible by registration.",
  },
  {
    code: "FDLB_TZ_INSURANCE",
    name: "Insurance Act, 2012",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Insurance business, licensing, policyholder protection",
    effectiveDate: "2012",
    federationRelevance: "Legal basis for TIRA services.",
  },
  {
    code: "FDLB_TZ_CAPITAL_MARKETS",
    name: "Capital Markets and Securities Act, 2015",
    kind: "ACT",
    issuer: "United Republic of Tanzania",
    subject: "Securities, capital market operators, investor protection",
    effectiveDate: "2015",
    federationRelevance: "Legal basis for CMSA services.",
  },
  {
    code: "FDLB_TZ_EAC_TREATY",
    name: "Treaty for the Establishment of the East African Community (1999) & Protocol(s)",
    kind: "TREATY",
    issuer: "East African Community",
    subject: "Regional integration: single market, movement of persons, trade",
    effectiveDate: "1999",
    federationRelevance: "Framework for EAC cross-border capability negotiation; no automatic rights — each reliance is negotiated per transition plan.",
  },
  {
    code: "FDLB_TZ_GOVERNMENT_DIRECTORIES",
    name: "Government directories (Ministry/Department/Agency, regions, LGAs)",
    kind: "OTHER",
    issuer: "United Republic of Tanzania",
    subject: "Official government structure baseline (325 MDA entries, 26 regions, 126 LGAs per directory snapshot)",
    effectiveDate: undefined,
    federationRelevance: "Authoritative reconciliation baseline for the authority, region and LGA registries. Live fetch was not possible from the build environment (no outbound DNS to go.tz); the baseline counts are recorded as REQUIREMENTS, and the seeded inventories are marked PENDING_RECONCILIATION.",
    notes: "Obtain the current official directory extract and run scripts/federation/tanzania-coverage-audit.ts to reconcile.",
  },
];
