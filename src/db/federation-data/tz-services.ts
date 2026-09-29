/**
 * BEYU Federation & Trust — TANZANIA service/dataset baseline (data).
 *
 * Candidate services identified from the authority inventory. Statuses are
 * HONEST defaults: UNVERIFIED / UNKNOWN_COST / GOVESB_UNKNOWN /
 * UNCERTAIN_COST until per-service evidence is gathered and recorded.
 * Public-information services (statistics, forecasts) are marked
 * PUBLIC_INFORMATION — that classification is a statement about the
 * information class, not about any API or access entitlement.
 *
 * Each service carries:
 *  - authority code (the providing authority record)
 *  - classification (classification ladder; default PUBLIC_INFORMATION only
 *    where the service is inherently public, otherwise PROTECTED_DATA
 *    placeholder pending review — never an assumption of access)
 *  - consent_required default UNKNOWN unless the purpose is public-info
 */

export interface TzServiceSeed {
  code: string;
  name: string;
  authorityCode: string;
  domain: string;
  classification?: "PUBLIC_INFORMATION" | "PROTECTED_DATA" | "UNKNOWN"; // default PUBLIC_INFORMATION
  consent?: "TRUE" | "FALSE" | "UNKNOWN"; // default UNKNOWN
  agreement?: "TRUE" | "FALSE" | "UNKNOWN"; // default UNKNOWN
  cost?: string; // default UNKNOWN_COST
  govesb?: string; // default GOVESB_UNKNOWN
  notes?: string;
}

const S = (
  code: string,
  name: string,
  authorityCode: string,
  domain: string,
  extra: Partial<TzServiceSeed> = {},
): TzServiceSeed => ({ code, name, authorityCode, domain, ...extra });

export const TZ_SERVICES: TzServiceSeed[] = [
  /* identity / civil status */
  S("NIN_ISSUANCE_STATUS", "National ID (NIN) issuance and verification", "NIDA", "IDENTITY", { consent: "TRUE", agreement: "TRUE", govesb: "GOVESB_REQUIRED", classification: "PROTECTED_DATA", notes: "Existing fabric row: CONTRACT_PENDING, GovESB channel, signed agreement required." }),
  S("CIVIL_STATUS_REGISTRATION", "Birth/marriage/death registration & official copies", "RITA", "CIVIL_STATUS", { consent: "TRUE", classification: "PROTECTED_DATA" }),
  S("BENEFICIAL_OWNERSHIP_REGISTRY", "Beneficial ownership registry services", "RITA", "BENEFICIAL_OWNERSHIP", { classification: "PROTECTED_DATA", notes: "Access restricted per law; purpose-limited only." }),
  S("PASSPORT_IMMIGRATION_SERVICES", "Passport & immigration permit services", "IMMIGRATION", "IMMIGRATION", { consent: "TRUE", agreement: "TRUE", classification: "PROTECTED_DATA" }),
  /* corporate / tax */
  S("COMPANY_REGISTRATION_SEARCH", "Company & business registration search", "BRELA", "CORPORATE", { agreement: "TRUE", classification: "PROTECTED_DATA", notes: "Existing fabric row: CONTRACT_PENDING, portal only." }),
  S("IP_REGISTRATION", "Intellectual property registration & search", "BRELA", "INTELLECTUAL_PROPERTY", { agreement: "TRUE", classification: "PROTECTED_DATA" }),
  S("TAX_TAXPAYER_VERIFICATION", "Taxpayer registration/verification (TIN)", "TRA", "TAX", { agreement: "TRUE", consent: "FALSE", classification: "PROTECTED_DATA" }),
  S("TAX_FILING_EFDMS_VFD", "Tax filing (EFDMS/VFD) & e-filing", "TRA", "TAX", { agreement: "TRUE", consent: "FALSE", classification: "PROTECTED_DATA", notes: "Existing fabric row tracks VFD channel (EXTERNAL_BLOCKED). No certificate issued to BEYU yet." }),
  S("CUSTOMS_CLEARANCE", "Customs clearance & import/export control", "TRA_CUSTOMS", "CUSTOMS_BORDER", { agreement: "TRUE", consent: "FALSE", classification: "PROTECTED_DATA" }),
  S("INVESTMENT_REGISTRATION", "Investment registration & facilitation", "TISEZA", "INVESTMENT", { classification: "PROTECTED_DATA" }),
  /* finance */
  S("BANK_LICENCE_SEARCH", "Bank/institution licence search", "BOT", "FINANCE", { classification: "PUBLIC_INFORMATION", consent: "FALSE", cost: "UNKNOWN_COST" }),
  S("PAYMENT_SYSTEM_OVERSIGHT", "Payment system & e-money licensing", "BOT", "PAYMENTS", { classification: "PROTECTED_DATA", consent: "FALSE" }),
  S("INSURANCE_LICENCE_SEARCH", "Insurance/pension licence search", "TIRA", "INSURANCE", { classification: "PUBLIC_INFORMATION", consent: "FALSE" }),
  S("SECURITIES_REGISTRATION", "Securities & capital market operator registration", "CMSA", "CAPITAL_MARKETS", { classification: "PROTECTED_DATA", consent: "FALSE" }),
  /* employment / social */
  S("NSSF_EMPLOYER_VERIFICATION", "NSSF employer & contribution verification", "NSSF", "SOCIAL_PROTECTION", { agreement: "TRUE", consent: "TRUE", classification: "PROTECTED_DATA", notes: "Existing fabric row: CONTRACT_PENDING." }),
  S("PSSSF_VERIFICATION", "PSSSF public-sector member verification", "PSSSF", "SOCIAL_PROTECTION", { agreement: "TRUE", consent: "TRUE", classification: "PROTECTED_DATA", notes: "Existing fabric row: CONTRACT_PENDING." }),
  S("WCF_CLAIM_STATUS", "Work-injury compensation claims", "WCF", "SOCIAL_PROTECTION", { agreement: "TRUE", consent: "TRUE", classification: "PROTECTED_DATA", notes: "Existing fabric row: CONTRACT_PENDING." }),
  S("NHIF_ELIGIBILITY", "Health insurance eligibility & claims", "NHIF", "HEALTH", { agreement: "TRUE", consent: "TRUE", classification: "PROTECTED_DATA", notes: "Existing fabric row: EXTERNAL_BLOCKED — per-facility credentials; none issued to BEYU." }),
  S("OSHA_CERTIFICATION", "Workplace safety inspection & certification", "OSHA", "EMPLOYMENT", { agreement: "TRUE", classification: "PROTECTED_DATA" }),
  S("TEACHER_VERIFICATION", "Teacher registration verification", "TSC", "EDUCATION", { consent: "TRUE", classification: "PROTECTED_DATA" }),
  /* health */
  S("FACILITY_VERIFICATION", "Health facility registration/licensing verification", "MOH", "HEALTH", { classification: "PROTECTED_DATA", consent: "FALSE", notes: "DHIS2 national channel (fabric: EXTERNAL_BLOCKED) is aggregate reporting, not facility-record access." }),
  S("MEDICINE_PRODUCT_VERIFICATION", "Medicines & medical devices product verification", "TMDA", "HEALTH", { agreement: "TRUE", classification: "PROTECTED_DATA" }),
  S("PROFESSIONAL_CREDENTIAL_VERIFICATION", "Health professional credential verification", "MCT", "PROFESSIONAL_CREDENTIALS", { consent: "TRUE", classification: "PROTECTED_DATA", notes: "Pattern applies to all professional councils (MCT, TNMC, pharmacy, laboratory, optometry, MRI, environmental health, traditional health, veterinary)." }),
  S("MEDICAL_RESEARCH_FEDERATION", "Medical research data federation (aggregated/anonymized)", "NIMR", "HEALTH", { classification: "PROTECTED_DATA", consent: "TRUE", notes: "Research federation only; raw patient data never leaves source systems without authorization." }),
  /* agriculture / livestock / fisheries */
  S("SEED_TECHNOLOGY_SERVICES", "Agricultural research & seed technology services", "TARI", "AGRICULTURE", { classification: "PUBLIC_INFORMATION", consent: "FALSE" }),
  S("LIVESTOCK_RESEARCH_SERVICES", "Livestock research & breeding services", "TLRI", "LIVESTOCK", { classification: "PUBLIC_INFORMATION", consent: "FALSE" }),
  S("FISHERIES_RESEARCH_SERVICES", "Fisheries research & stock assessment", "TAFIRI", "FISHERIES", { classification: "PUBLIC_INFORMATION", consent: "FALSE" }),
  S("COMMODITY_BOARD_SERVICES", "Commodity board registration & services", "TZ_DAIRY_BOARD", "AGRICULTURE", { classification: "PROTECTED_DATA", consent: "UNKNOWN", notes: "Boards' current status under reconciliation; services listed per board." }),
  /* ujenzi / land / water / energy / mining */
  S("ENGINEERING_REGISTRATION", "Engineering/architecture/quantity-survey registration", "ERB", "UJENZI", { classification: "PROTECTED_DATA", consent: "UNKNOWN", notes: "Pattern applies to AQRB, TPRB, VRB, NCC as reconciliation confirms names." }),
  S("ROAD_INFRASTRUCTURE_INFO", "Road network & toll information", "TANROADS", "TRANSPORT", { classification: "PUBLIC_INFORMATION", consent: "FALSE" }),
  S("EIA_APPROVALS", "Environmental impact assessment & approvals", "NEMC", "ENVIRONMENT", { classification: "PROTECTED_DATA", consent: "FALSE" }),
  S("WILDLIFE_LICENSING", "Wildlife licences & permits", "TAWA", "NATURAL_RESOURCES", { classification: "PROTECTED_DATA", consent: "FALSE" }),
  S("NATIONAL_PARKS_SERVICES", "National parks entry & conservation services", "TANAPA", "NATURAL_RESOURCES", { classification: "PUBLIC_INFORMATION", consent: "FALSE" }),
  S("FOREST_LICENSING", "Forest licences & timber permits", "TANZANIA_FOREST_SERVICES", "ENVIRONMENT", { classification: "PROTECTED_DATA", consent: "FALSE" }),
  S("LAND_TITLE_VERIFICATION", "Land title & registered interests verification", "LAND_REGISTRY", "LAND", { consent: "TRUE", agreement: "TRUE", classification: "PROTECTED_DATA", notes: "Protected records; purpose-limited authorized access only." }),
  S("LAND_USE_PERMITS", "Land use planning permits", "NLUPC", "LAND", { classification: "PROTECTED_DATA", consent: "FALSE" }),
  S("WATER_USE_PERMITS", "Water use permits", "MINISTRY_WATER", "WATER", { classification: "PROTECTED_DATA", consent: "FALSE" }),
  S("UTILITY_LICENCE_SEARCH", "Energy & water utility licence/tariff search", "EWURA", "ENERGY", { classification: "PUBLIC_INFORMATION", consent: "FALSE" }),
  S("ELECTRICITY_SERVICES", "Electricity supply services", "TANESCO", "ENERGY", { classification: "PROTECTED_DATA", consent: "FALSE", notes: "Customer-level data is protected; public tariff information is public." }),
  S("MINERAL_LICENSING", "Mineral licences, inspection & revenue services", "MINING_COMMISSION", "MINING", { classification: "PROTECTED_DATA", consent: "FALSE" }),
  S("GEMS_CERTIFICATION", "Gems & jewellery certification", "TGC", "MINING", { classification: "PROTECTED_DATA", consent: "FALSE" }),
  /* transport / communications */
  S("VEHICLE_DRIVER_REGISTRATION", "Vehicle & driver registration/licence verification", "LATRA", "TRANSPORT", { consent: "TRUE", classification: "PROTECTED_DATA" }),
  S("AVIATION_LICENSING", "Aviation licences & airworthiness services", "TCAA", "TRANSPORT", { classification: "PROTECTED_DATA", consent: "FALSE" }),
  S("PORT_SERVICES", "Port services & maritime information", "TAA", "TRANSPORT", { classification: "PROTECTED_DATA", consent: "FALSE" }),
  S("TELECOM_LICENCE_SEARCH", "Telecom licence & spectrum search", "TCRA", "COMMUNICATIONS", { classification: "PUBLIC_INFORMATION", consent: "FALSE" }),
  S("GOVERNMENT_SERVICE_DIRECTORY", "Government service directory (Huduma Pamoja/e-GA)", "EGA", "DIGITAL_GOVERNMENT", { classification: "PUBLIC_INFORMATION", consent: "FALSE", cost: "PUBLIC_INFORMATION", notes: "Directory entries are public information. Individual service access follows each service's own regime." }),
  S("DIGITAL_SIGNATURE_INFRASTRUCTURE", "Government digital signature infrastructure", "EGA", "TRUST_SERVICES", { classification: "PROTECTED_DATA", consent: "FALSE", notes: "Availability/cost unverified." }),
  /* education / trade / standards */
  S("DEGREE_VALIDATION", "Degree & university accreditation validation", "TCU", "EDUCATION", { consent: "TRUE", classification: "PROTECTED_DATA" }),
  S("NATIONAL_EXAM_RESULTS", "National examination results & certificate verification", "NECTA", "EDUCATION", { consent: "TRUE", classification: "PROTECTED_DATA" }),
  S("TVET_ACCREDITATION", "TVET accreditation & training records", "NACTVET", "EDUCATION", { consent: "TRUE", classification: "PROTECTED_DATA" }),
  S("STANDARDS_PRODUCT_CERTIFICATION", "Standards & product certification", "TBS", "STANDARDS", { classification: "PROTECTED_DATA", consent: "FALSE" }),
  S("CONSUMER_PROTECTION_SERVICES", "Consumer protection & competition services", "FCC", "CONSUMER_PROTECTION", { classification: "PROTECTED_DATA", consent: "FALSE" }),
  /* procurement / tourism / justice */
  S("GOVERNMENT_SUPPLIER_REGISTRY", "Government supplier registry & contract systems", "PPRA", "GOVERNMENT_PROCUREMENT", { classification: "PROTECTED_DATA", consent: "FALSE", notes: "Supplier-registry access regime unverified." }),
  S("TOURISM_LICENSING", "Tourism licensing & levy services", "TTB", "TOURISM", { classification: "PROTECTED_DATA", consent: "FALSE" }),
  S("COURT_JUDICIAL_SERVICES", "Court registration & judicial services", "JUDICIARY", "LEGAL_JUSTICE", { classification: "PROTECTED_DATA", consent: "FALSE", notes: "Access governed by court rules; no assumption of electronic access." }),
  S("JUDICIAL_ELECTRONIC_SERVICES", "Judiciary electronic filing/records", "JUDICIARY", "LEGAL_JUSTICE", { classification: "PROTECTED_DATA", consent: "FALSE", notes: "Electronic services availability unverified." }),
  /* governance / oversight / statistics */
  S("STATE_AUDIT_PUBLICATIONS", "State audit reports (public publications)", "NAOT", "GOVERNANCE", { classification: "PUBLIC_INFORMATION", consent: "FALSE", cost: "PUBLIC_INFORMATION" }),
  S("HUMAN_RIGHTS_COMPLAINTS", "Human rights complaints & reports", "CHRAGG", "HUMAN_RIGHTS", { classification: "PROTECTED_DATA", consent: "FALSE" }),
  S("NATIONAL_STATISTICS_OPEN_DATA", "National statistics, census & open data", "NBS", "STATISTICS", { classification: "PUBLIC_INFORMATION", consent: "FALSE", cost: "PUBLIC_INFORMATION", notes: "Public information class; microdata remain protected." }),
  S("STI_POLICY_SERVICES", "Science, technology & innovation policy services", "COSTECH", "RESEARCH_SCIENCE", { classification: "PUBLIC_INFORMATION", consent: "FALSE" }),
  /* disaster / community / data governance */
  S("WEATHER_CLIMATE_SERVICES", "Weather forecasts & climate information", "TMA", "WEATHER_CLIMATE", { classification: "PUBLIC_INFORMATION", consent: "FALSE", cost: "PUBLIC_INFORMATION", notes: "Hazard-warning products may carry PUBLIC_SERVICE restrictions." }),
  S("DISASTER_MANAGEMENT_COORDINATION", "Disaster management coordination & alerts", "PMO_DISASTER", "DISASTER_EMERGENCY", { classification: "PROTECTED_DATA", consent: "FALSE", notes: "Alert dissemination is a public-safety function; record access unverified." }),
  S("DISABILITY_SERVICES", "Persons with disabilities rights & inclusion services", "NCPWD", "COMMUNITY_SOCIAL_SERVICES", { classification: "PROTECTED_DATA", consent: "TRUE" }),
  S("DATA_PROTECTION_SERVICES", "Controller registration, DSR & enforcement (PDPA)", "PDPC", "DATA_GOVERNANCE", { classification: "PROTECTED_DATA", consent: "FALSE", notes: "PDPA 2022: cross-border transfer control; controller registration regime applies to BEYU deployments processing TZ personal data." }),
  S("NGO_REGISTRATION", "NGO registration & regulatory services", "NGO_BUREAU", "NGOS_NONPROFIT", { classification: "PROTECTED_DATA", consent: "FALSE", notes: "Host ministry under reconciliation." }),
  /* international */
  S("EAC_CROSS_BORDER_FRAMEWORKS", "EAC cross-border frameworks & single market", "EAC", "INTERNATIONAL_CROSS_BORDER", { classification: "PROTECTED_DATA", consent: "FALSE", notes: "External bloc interface — capability negotiation required before reliance." }),
];
