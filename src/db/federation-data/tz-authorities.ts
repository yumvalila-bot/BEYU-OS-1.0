/**
 * BEYU Federation & Trust — TANZANIA national authority inventory (data).
 *
 * Source of the inventory (program §15): the authorities discussed throughout
 * the BEYU architecture work, structured for reconciliation against the
 * current authoritative Tanzania Government Directory (325 MDA entries
 * baseline). This file is DATA: the federation core is jurisdiction-generic.
 *
 * HONESTY RULES (program §100):
 *  - Every record is REGISTERED / CLASSIFIED with verification REGISTERED.
 *  - Nothing is connected, live, verified, free or GovESB-compliant.
 *  - official_website only where high-confidence; otherwise null.
 *  - Records whose official identity could not be confidently established are
 *    marked record_status UNCERTAIN with a note — never invented.
 *  - legacy = cross-link to the existing 0036 government_agencies registry
 *    (one identity, two planes).
 *
 * Private licensed institutions (banks, payment operators, e-money
 * institutions, microfinance, insurers, pension funds) are NOT government
 * authorities and are deliberately not seeded here; they are supervised by
 * BoT/TIRA (see coverage report).
 */

export interface TzAuthoritySeed {
  code: string;
  name: string;
  short?: string;
  domain: string;
  type?: string; // AUTHORITY_TYPES; default AGENCY
  parent?: string; // parent authority code
  website?: string; // high-confidence official website only
  mandate?: string;
  consent?: "TRUE" | "FALSE" | "UNKNOWN"; // default UNKNOWN
  agreement?: "TRUE" | "FALSE" | "UNKNOWN"; // default UNKNOWN
  apiStatus?: string; // default UNVERIFIED
  govesb?: string; // default GOVESB_UNKNOWN
  cost?: string; // default UNKNOWN_COST
  legacy?: string; // government_agencies.code cross-link
  categories?: string[];
  uncertain?: boolean; // record_status = UNCERTAIN
  notes?: string;
}

const A = (
  code: string,
  name: string,
  domain: string,
  extra: Partial<TzAuthoritySeed> = {},
): TzAuthoritySeed => ({ code, name, domain, ...extra });

export const TZ_AUTHORITIES: TzAuthoritySeed[] = [
  /* ---------------- MINISTRIES (parents for departments/agencies) ------- */
  A("MINISTRY_FINANCE", "Ministry of Finance", "TAX", { type: "MINISTRY", mandate: "Fiscal policy, budget, public finance" }),
  A("MINISTRY_FOREIGN_AFFAIRS_EAC", "Ministry of Foreign Affairs and East African Cooperation", "INTERNATIONAL_CROSS_BORDER", { type: "MINISTRY", mandate: "Diplomacy, treaties, EAC cooperation" }),
  A("MINISTRY_HOME_AFFAIRS", "Ministry of Home Affairs", "DEFENCE_SECURITY", { type: "MINISTRY", mandate: "Internal security, immigration, civil order" }),
  A("MINISTRY_HEALTH", "Ministry of Health", "HEALTH", { type: "MINISTRY", website: "https://www.moh.go.tz", mandate: "Health policy and service delivery", categories: ["facility registration", "public health", "health workforce policy"] }),
  A("MINISTRY_AGRICULTURE", "Ministry of Agriculture", "AGRICULTURE", { type: "MINISTRY", mandate: "Agriculture, food security, cooperatives policy" }),
  A("MINISTRY_LIVESTOCK_FISHERIES", "Ministry of Livestock and Fisheries", "LIVESTOCK", { type: "MINISTRY", mandate: "Livestock development and fisheries policy", categories: ["animal health", "fisheries licensing"] }),
  A("MINISTRY_LANDS_HOUSING", "Ministry of Lands, Housing and Human Settlements Development", "LAND", { type: "MINISTRY", mandate: "Land policy, housing, human settlements" }),
  A("MINISTRY_ENERGY", "Ministry of Energy", "ENERGY", { type: "MINISTRY", mandate: "Energy policy (separated from Minerals in the 2025 structure)" }),
  A("MINISTRY_MINERALS", "Ministry of Minerals", "MINING", { type: "MINISTRY", mandate: "Minerals and geosciences policy" }),
  A("MINISTRY_TRANSPORT", "Ministry of Transport", "TRANSPORT", { type: "MINISTRY", mandate: "Transport policy" }),
  A("MINISTRY_WORKS", "Ministry of Works", "UJENZI", { type: "MINISTRY", mandate: "Works and construction policy (verify current ministry structure — 2025 reorganization)", notes: "BEYU architecture work refers to a 'Ministry of Construction'; reconcile against the current official ministry list." }),
  A("MINISTRY_COMMUNICATION_IT", "Ministry of Communication and Information Technology", "DIGITAL_GOVERNMENT", { type: "MINISTRY", mandate: "ICT policy, digital government" }),
  A("MINISTRY_EDUCATION_ST", "Ministry of Education, Science and Technology", "EDUCATION", { type: "MINISTRY", mandate: "Education, science, technology policy" }),
  A("MINISTRY_INDUSTRY_TRADE", "Ministry of Industry and Trade", "INDUSTRY", { type: "MINISTRY", mandate: "Industry, trade, investment policy", categories: ["import/export licensing", "industrial licensing"] }),
  A("MINISTRY_LABOUR", "Ministry of Labour and Employment", "EMPLOYMENT", { type: "MINISTRY", mandate: "Labour and employment policy" }),
  A("MINISTRY_NATURAL_RESOURCES_TOURISM", "Ministry of Natural Resources and Tourism", "TOURISM", { type: "MINISTRY", mandate: "Tourism, wildlife, natural resources policy" }),
  A("MINISTRY_INFORMATION_CULTURE", "Ministry of Information, Culture, Arts and Sports", "CULTURE", { type: "MINISTRY", mandate: "Information, culture, arts, sports, media policy" }),
  A("MINISTRY_COMMUNITY_DEVELOPMENT", "Ministry of Community Development, Gender, Women and Special Groups", "COMMUNITY_SOCIAL_SERVICES", { type: "MINISTRY", mandate: "Community development, social welfare, gender, youth, disability" }),
  A("MINISTRY_DEFENCE", "Ministry of Defence and National Service", "DEFENCE_SECURITY", { type: "MINISTRY", mandate: "Defence policy, national service" }),
  A("PRESIDENT_OFFICE", "Office of the President", "GOVERNANCE", { type: "MINISTRY", mandate: "Presidential offices (Planning and Investment, Public Service Management, Regional Administration and Local Government, State House)" }),
  A("VPO_ENVIRONMENT", "Vice President's Office — Environment", "ENVIRONMENT", { type: "DEPARTMENT", mandate: "Environment, climate change, biodiversity" }),
  A("PMO_DISASTER", "Prime Minister's Office — Disaster Management", "DISASTER_EMERGENCY", { type: "DEPARTMENT", mandate: "Disaster management coordination" }),

  /* ---------------- IDENTITY / CIVIL STATUS / IMMIGRATION (§16) --------- */
  A("NIDA", "National Identification Authority", "IDENTITY", {
    short: "NIDA", website: "https://www.nida.go.tz", legacy: "NIDA", apiStatus: "NONE_PUBLISHED", govesb: "GOVESB_REQUIRED",
    agreement: "TRUE", consent: "TRUE",
    mandate: "National identification (NIN), national ID cards, identity verification services",
    categories: ["NIN", "national ID", "identity verification"],
    notes: "Existing fabric row: CONTRACT_PENDING — signed agreement required, GovESB channel. No public API verified.",
  }),
  A("RITA", "Registration, Insolvency and Trusteeship Agency", "CIVIL_STATUS", {
    short: "RITA", website: "https://www.rita.go.tz", apiStatus: "NONE_PUBLISHED", consent: "TRUE",
    mandate: "Civil status records (births, marriages, deaths), trusteeship and insolvency, beneficial ownership registry",
    categories: ["birth registration", "marriage registration", "death registration", "beneficial ownership registry", "insolvency"],
  }),
  A("IMMIGRATION", "Immigration Services Department", "IMMIGRATION", {
    type: "DEPARTMENT", parent: "MINISTRY_HOME_AFFAIRS", consent: "TRUE", agreement: "TRUE",
    mandate: "Passports, immigration permits, entry/exit, border control services",
    categories: ["passport", "residence permit", "work permit", "border control"],
  }),
  A("POLICE", "Tanzania Police Force", "DEFENCE_SECURITY", {
    type: "INSTITUTION", consent: "TRUE",
    mandate: "Public order, policing; certain identity/civil-record functions where legally authorized",
    notes: "Federation interfaces only where legally authorized; no assumption of record access.",
  }),

  /* ---------------- CORPORATE / TAX / BUSINESS (§17) -------------------- */
  A("BRELA", "Business Registrations and Licensing Agency", "CORPORATE", {
    short: "BRELA", website: "https://ors.brela.go.tz", legacy: "BRELA", apiStatus: "NONE_PUBLISHED", agreement: "TRUE",
    mandate: "Company registration, business names, intellectual property registration, licensing, beneficial ownership filings",
    categories: ["company registration", "business names", "intellectual property", "licensing", "beneficial ownership"],
    notes: "Existing fabric row: CONTRACT_PENDING — portal only, no published API.",
  }),
  A("TRA", "Tanzania Revenue Authority", "TAX", {
    short: "TRA", website: "https://www.tra.go.tz", legacy: "TRA_VFD", apiStatus: "NONE_PUBLISHED", agreement: "TRUE", consent: "FALSE",
    mandate: "Tax administration (income, VAT, withholding), customs, tax filing (EFDMS/VFD, e-filing)",
    categories: ["tax registration", "taxpayer verification", "tax filing", "customs", "VAT", "PAYE"],
    notes: "Existing fabric row tracks the VFD channel (EXTERNAL_BLOCKED — TRA-issued certificate not yet issued to BEYU). Other TRA services are independently untracked.",
  }),
  A("TISEZA", "Tanzania Investment Centre (TISEZA)", "INVESTMENT", {
    mandate: "Investment facilitation, investment promotion, investor services",
    categories: ["investment registration", "investor facilitation"],
  }),
  A("TRA_CUSTOMS", "TRA Customs Division", "CUSTOMS_BORDER", {
    type: "DEPARTMENT", parent: "TRA", agreement: "TRUE", consent: "FALSE",
    mandate: "Customs clearance, import/export control, border revenue",
    notes: "Distinct service plane within TRA; access requirements independent of the tax channels.",
  }),

  /* ---------------- INVESTMENT / FINANCE (§18) -------------------------- */
  A("BOT", "Bank of Tanzania", "FINANCE", {
    type: "PUBLIC_CORPORATION", website: "https://www.bot.go.tz",
    mandate: "Central bank; monetary policy; supervision of banks, payment systems, e-money institutions",
    categories: ["bank supervision", "payment system oversight", "e-money licensing", "foreign exchange"],
  }),
  A("TIRA", "Tanzania Insurance Regulatory Authority", "INSURANCE", {
    type: "REGULATOR", website: "https://www.tira.go.tz",
    mandate: "Insurance and pension fund regulation and supervision",
    categories: ["insurance licensing", "pension supervision", "policyholder protection"],
  }),
  A("CMSA", "Capital Markets and Securities Authority", "CAPITAL_MARKETS", {
    type: "REGULATOR", website: "https://www.cmsa.go.tz",
    mandate: "Capital markets regulation: securities, investment instruments, capital market operators",
  }),
  A("DSE", "DSE Ltd (Dar es Salaam Stock Exchange)", "CAPITAL_MARKETS", {
    type: "PUBLIC_CORPORATION", website: "https://www.dse.co.tz",
    mandate: "Capital market infrastructure: equities, bonds, derivatives trading",
  }),
  A("TMX", "TMX (Tanzania Money Exchange)", "CAPITAL_MARKETS", {
    mandate: "Foreign exchange trading platform",
    uncertain: true, notes: "Identity as discussed in BEYU architecture work — verify official name/status during reconciliation.",
  }),
  A("UTT_AMIS", "UTT AMIS", "INVESTMENT", {
    mandate: "As discussed in BEYU architecture work",
    uncertain: true, notes: "Official identity not confidently established — mark UNCERTAIN per failure policy; verify during reconciliation.",
  }),
  A("FIU", "Financial Intelligence Unit", "FINANCE", {
    type: "AGENCY", parent: "BOT", consent: "TRUE",
    mandate: "AML/CFT intelligence, suspicious transaction reporting",
    notes: "Highly sensitive; access only through statutory channels.",
  }),
  A("TRAB", "TRAB", "CAPITAL_MARKETS", {
    uncertain: true, notes: "Abbreviation used in BEYU architecture work — official identity to be verified during reconciliation (failure policy: UNCERTAIN).",
  }),
  A("TRAT", "TRAT", "CAPITAL_MARKETS", {
    uncertain: true, notes: "Abbreviation used in BEYU architecture work — official identity to be verified during reconciliation (failure policy: UNCERTAIN).",
  }),

  /* ---------------- EMPLOYMENT / SOCIAL PROTECTION (§19) ---------------- */
  A("NSSF", "National Social Security Fund", "SOCIAL_PROTECTION", {
    short: "NSSF", website: "https://www.nssf.go.tz", legacy: "NSSF", apiStatus: "NONE_PUBLISHED", agreement: "TRUE", consent: "TRUE",
    mandate: "Social security contributions, pension and disability benefits for private-sector workers",
    categories: ["employer verification", "contribution verification", "pension benefits"],
  }),
  A("PSSSF", "Public Service Social Security Fund", "SOCIAL_PROTECTION", {
    short: "PSSSF", type: "FUND", website: "https://www.psssf.go.tz", legacy: "PSSSF", apiStatus: "NONE_PUBLISHED", agreement: "TRUE", consent: "TRUE",
    mandate: "Social security for public-sector workers",
  }),
  A("WCF", "Workers Compensation Fund", "SOCIAL_PROTECTION", {
    short: "WCF", type: "FUND", website: "https://www.wcf.go.tz", legacy: "WCF", apiStatus: "NONE_PUBLISHED", agreement: "TRUE", consent: "TRUE",
    mandate: "Work-injury compensation",
    categories: ["work-injury claims", "employer compliance"],
  }),
  A("NHIF", "National Health Insurance Fund", "HEALTH", {
    short: "NHIF", type: "FUND", website: "https://www.nhif.or.tz", legacy: "NHIF", apiStatus: "NONE_PUBLISHED", agreement: "TRUE", consent: "TRUE",
    mandate: "Health insurance: eligibility, claims, facility accreditation",
    categories: ["eligibility verification", "claims", "facility accreditation"],
    notes: "Existing fabric row: EXTERNAL_BLOCKED — per-facility credentials issued by NHIF during facility onboarding; none issued to BEYU yet.",
  }),
  A("OSHA", "Occupational Safety and Health Authority", "EMPLOYMENT", {
    short: "OSHA", website: "https://www.osha.go.tz", legacy: "OSHA", apiStatus: "NONE_PUBLISHED", agreement: "TRUE",
    mandate: "Workplace safety and health regulation, inspection, certification",
  }),
  A("TAESA", "TaESA", "EMPLOYMENT", {
    uncertain: true, notes: "Abbreviation used in BEYU architecture work — official identity to be verified during reconciliation (failure policy: UNCERTAIN).",
  }),
  A("PSRS", "Public Service Recruitment Secretariat", "PUBLIC_SERVICE", {
    type: "DEPARTMENT", parent: "PRESIDENT_OFFICE",
    mandate: "Public service recruitment and appointments",
    categories: ["recruitment verification"],
  }),
  A("PO_PUBLIC_SERVICE", "President's Office — Public Service Management", "PUBLIC_SERVICE", {
    type: "DEPARTMENT", parent: "PRESIDENT_OFFICE",
    mandate: "Public service management systems, civil service policy",
  }),
  A("TSC", "Teachers Service Commission", "EDUCATION", {
    type: "COMMISSION", website: "https://www.tsc.go.tz",
    mandate: "Employment, discipline and standards of teachers in public basic education",
    categories: ["teacher verification", "recruitment"],
  }),
  A("CMA_TZ", "CMA", "LABOUR_DISPUTES", {
    uncertain: true, notes: "Abbreviation used in BEYU architecture work (employment and justice contexts) — official identity to be verified during reconciliation (failure policy: UNCERTAIN).",
  }),
  A("LABOUR_DISPUTES_SERVICES", "Employment and Labour Dispute Services (Ministry of Labour)", "LABOUR_DISPUTES", {
    type: "DEPARTMENT", parent: "MINISTRY_LABOUR",
    mandate: "Labour dispute resolution, employment relations services",
  }),

  /* ---------------- HEALTH (§20) ---------------------------------------- */
  A("MOH", "Ministry of Health", "HEALTH", {
    type: "MINISTRY", website: "https://www.moh.go.tz", legacy: "DHIS2", apiStatus: "NONE_PUBLISHED",
    mandate: "Health policy, facility registration/licensing, health workforce, public health",
    categories: ["facility verification", "health workforce", "public health", "health research federation"],
    notes: "Existing fabric row tracks the DHIS2 national aggregate-reporting channel (EXTERNAL_BLOCKED — MoH authorization not issued). No protected health information access by registration.",
  }),
  A("TMDA", "Tanzania Medicines and Medical Devices Authority", "HEALTH", {
    short: "TMDA", website: "https://www.tmda.go.tz", legacy: "TMDA", apiStatus: "NONE_PUBLISHED", agreement: "TRUE",
    mandate: "Medicines and medical devices regulation: registration, inspection, product verification",
    categories: ["medicine/product verification", "pharmaceutical registration"],
  }),
  A("MCT", "Medical Council of Tanganyika", "PROFESSIONAL_CREDENTIALS", {
    type: "COUNCIL", consent: "TRUE",
    mandate: "Registration and discipline of medical practitioners",
    categories: ["professional credential verification"],
  }),
  A("TNMC", "Tanzania Nursing and Midwifery Council", "PROFESSIONAL_CREDENTIALS", {
    type: "COUNCIL", consent: "TRUE",
    mandate: "Registration and discipline of nurses and midwives",
  }),
  A("PHARMACY_COUNCIL", "Pharmacy Council of Tanzania", "PROFESSIONAL_CREDENTIALS", {
    type: "COUNCIL", consent: "TRUE",
    mandate: "Registration and discipline of pharmacists and pharmacy institutions",
  }),
  A("HLP_COUNCIL", "Health Laboratory Practitioners Council of Tanzania", "PROFESSIONAL_CREDENTIALS", {
    type: "COUNCIL", consent: "TRUE",
    mandate: "Registration and discipline of health laboratory practitioners",
  }),
  A("OPTOMETRY_REGULATOR", "Optometry / Optical Professional Regulator", "PROFESSIONAL_CREDENTIALS", {
    type: "COUNCIL", consent: "TRUE",
    uncertain: true, notes: "Regulator for optometry/optical professionals as discussed in BEYU architecture work — verify current official name during reconciliation.",
  }),
  A("MRI_COUNCIL", "Medical Radiology and Imaging Practitioners Council", "PROFESSIONAL_CREDENTIALS", {
    type: "COUNCIL", consent: "TRUE",
    mandate: "Registration and discipline of radiology and imaging practitioners",
  }),
  A("EHPRC", "Environmental Health Practitioners Registration Council", "PROFESSIONAL_CREDENTIALS", {
    type: "COUNCIL", consent: "TRUE",
    mandate: "Registration and discipline of environmental health practitioners",
  }),
  A("TAHC_COUNCIL", "Traditional and Alternative Health Practitioners Council", "PROFESSIONAL_CREDENTIALS", {
    type: "COUNCIL", consent: "TRUE",
    mandate: "Registration and discipline of traditional and alternative health practitioners",
  }),
  A("PHAB", "Private Hospitals Advisory Board", "HEALTH", {
    type: "BOARD",
    mandate: "Advisory and oversight for private hospitals",
  }),
  A("PHLB", "Private Health Laboratories Board", "HEALTH", {
    type: "BOARD",
    mandate: "Oversight for private health laboratories",
  }),
  A("NIMR", "National Institute for Medical Research", "HEALTH", {
    type: "INSTITUTION", website: "https://www.nimr.or.tz",
    mandate: "Medical research, reference laboratories, public health research federation",
  }),
  A("MSD", "Medical Supplies Division", "HEALTH", {
    type: "DEPARTMENT", parent: "MINISTRY_HEALTH",
    mandate: "Public procurement and supply of medical supplies",
  }),
  A("TACAIDS", "Tanzania AIDS Project (TACAIDS)", "HEALTH", {
    type: "INSTITUTION",
    mandate: "HIV/AIDS prevention, treatment and care programs",
  }),

  /* ---------------- AGRICULTURE (§21) ----------------------------------- */
  A("TPHPA", "TPHPA (Tanzania Pesticides and Healthcare Products Authority)", "AGRICULTURE", {
    domain: "AGRICULTURE",
    uncertain: true, notes: "As discussed in BEYU architecture work — verify current official name/status (pesticides/agrochemicals regulation) during reconciliation.",
  }),
  A("TFRA", "TFRA", "AGRICULTURE", {
    uncertain: true, notes: "Abbreviation used in BEYU architecture work (agriculture context) — official identity to be verified during reconciliation (failure policy: UNCERTAIN).",
  }),
  A("TARI", "Tanzania Agricultural Research Institute", "AGRICULTURE", {
    type: "INSTITUTION", website: "https://www.tari.go.tz",
    mandate: "Agricultural research, seed and technology development",
  }),
  A("IRRIGATION_COMMISSION", "Tanzania Irrigation Commission", "AGRICULTURE", {
    type: "COMMISSION",
    uncertain: true, notes: "Irrigation mandate (verify current official name/status — Irrigation Department functions) during reconciliation.",
  }),
  A("AGITF", "AGITF", "AGRICULTURE", {
    uncertain: true, notes: "Abbreviation used in BEYU architecture work (agriculture inputs context) — official identity to be verified during reconciliation (failure policy: UNCERTAIN).",
  }),
  A("NFRA", "NFRA (National Fertilizer Regulatory Authority)", "AGRICULTURE", {
    uncertain: true, notes: "Abbreviation used in BEYU architecture work (fertilizer regulation context) — official identity to be verified during reconciliation (failure policy: UNCERTAIN).",
  }),
  A("TCDC", "Tanzania Cashew Development Centre", "AGRICULTURE", {
    type: "INSTITUTION",
    mandate: "Cashew research, development and value-chain services",
  }),
  A("TZ_TOBACCO_BOARD", "Tobacco Board", "AGRICULTURE", {
    type: "BOARD", uncertain: true, notes: "Commodity board as discussed in BEYU architecture work — board status to be verified during reconciliation (recent sector reorganizations).",
  }),
  A("TZ_COTTON_BOARD", "Cotton Board", "AGRICULTURE", {
    type: "BOARD", uncertain: true, notes: "Commodity board as discussed in BEYU architecture work — verify current status during reconciliation.",
  }),
  A("TZ_COFFEE_BOARD", "Coffee Board", "AGRICULTURE", {
    type: "BOARD", uncertain: true, notes: "Commodity board as discussed in BEYU architecture work — verify current status during reconciliation.",
  }),
  A("TZ_TEA_BOARD", "Tea Board", "AGRICULTURE", {
    type: "BOARD", uncertain: true, notes: "Commodity board as discussed in BEYU architecture work — verify current status during reconciliation.",
  }),
  A("TZ_SUGAR_BOARD", "Sugar Board", "AGRICULTURE", {
    type: "BOARD", uncertain: true, notes: "Commodity board as discussed in BEYU architecture work — verify current status during reconciliation.",
  }),
  A("TZ_CASHEW_DEVELOPMENT", "Cashew Development Authority/Board", "AGRICULTURE", {
    type: "BOARD", uncertain: true, notes: "Cashew development functions (TCDC covers research) — verify current status during reconciliation.",
  }),
  A("TZ_SISAL_BOARD", "Sisal Board", "AGRICULTURE", {
    type: "BOARD", uncertain: true, notes: "Commodity board as discussed in BEYU architecture work — verify current status during reconciliation.",
  }),
  A("TZ_PYRETHRUM_BOARD", "Pyrethrum Board", "AGRICULTURE", {
    type: "BOARD", uncertain: true, notes: "Commodity board as discussed in BEYU architecture work — verify current status during reconciliation.",
  }),
  A("TZ_DAIRY_BOARD", "Dairy Board of Tanzania", "AGRICULTURE", {
    type: "BOARD",
    mandate: "Dairy industry development and regulation",
  }),
  A("TZ_MEAT_BOARD", "Meat Board", "LIVESTOCK", {
    type: "BOARD", uncertain: true, notes: "Commodity board as discussed in BEYU architecture work — verify current status during reconciliation.",
  }),
  A("TZ_CEREALS_PRODUCE", "Cereals and Other Produce Authority/Board", "AGRICULTURE", {
    type: "BOARD", uncertain: true, notes: "Commodity board as discussed in BEYU architecture work — verify current status during reconciliation.",
  }),

  /* ---------------- LIVESTOCK / VETERINARY (§22) ------------------------ */
  A("TLRI", "Tanzania Livestock Research Institute", "LIVESTOCK", {
    type: "INSTITUTION",
    mandate: "Livestock research, breeding, animal health research",
  }),
  A("TVLA", "Tanzania Veterinary Laboratory Agency", "LIVESTOCK", {
    type: "AGENCY",
    mandate: "Veterinary diagnostics and laboratory services",
  }),
  A("LIVESTOCK_TRAINING", "Livestock Training Agency", "LIVESTOCK", {
    type: "INSTITUTION",
    mandate: "Livestock and veterinary training",
  }),
  A("TVC", "Tanzania Veterinary Council", "PROFESSIONAL_CREDENTIALS", {
    type: "COUNCIL", consent: "TRUE",
    mandate: "Registration and discipline of veterinary practitioners",
  }),

  /* ---------------- FISHERIES (§23) ------------------------------------- */
  A("TAFIRI", "Tanzania Fisheries Research Institute", "FISHERIES", {
    type: "INSTITUTION",
    mandate: "Fisheries research and stock assessment",
  }),
  A("TFC", "Tanzania Fisheries Corporation", "FISHERIES", {
    type: "PUBLIC_CORPORATION",
    mandate: "Fisheries development, commercial fisheries services",
  }),
  A("FETA", "Fisheries Education and Training Agency", "FISHERIES", {
    type: "INSTITUTION",
    mandate: "Fisheries education and training",
  }),

  /* ---------------- UJENZI / CONSTRUCTION / ENGINEERING (§24) ----------- */
  A("CRB", "CRB (Construction/Engineering Registration Board)", "UJENZI", {
    type: "BOARD", uncertain: true, notes: "As discussed in BEYU architecture work — verify full official name (construction registration) during reconciliation.",
  }),
  A("ERB", "Engineering Registration Board", "UJENZI", {
    type: "BOARD",
    mandate: "Registration of engineering professionals and firms",
    categories: ["engineering registration", "contractor registration"],
  }),
  A("AQRB", "AQRB (Architects and Quantity Surveyors Registration Board)", "UJENZI", {
    type: "BOARD", uncertain: true, notes: "As discussed in BEYU architecture work — verify full official name during reconciliation.",
  }),
  A("NCC", "National Construction Council", "UJENZI", {
    type: "COUNCIL",
    mandate: "Coordination of construction sector policy and standards",
  }),
  A("TPRB", "Town Planners Registration Board", "UJENZI", {
    type: "BOARD",
    mandate: "Registration of town planners",
  }),
  A("VRB", "Valuers Registration Board", "UJENZI", {
    type: "BOARD",
    mandate: "Registration of property valuers",
  }),
  A("TBA", "TBA (Town Planning and Building Authority)", "UJENZI", {
    uncertain: true, notes: "Abbreviation used in BEYU architecture work — official identity to be verified during reconciliation (failure policy: UNCERTAIN).",
  }),
  A("TANROADS", "Tanzania Roads Agency", "TRANSPORT", {
    type: "AGENCY", website: "https://www.tanroads.go.tz",
    mandate: "Toll road management and maintenance, road infrastructure",
  }),
  A("TARURA", "Tanzania Rural and Urban Roads Agency", "TRANSPORT", {
    type: "AGENCY", website: "https://www.tarura.go.tz",
    mandate: "Rural and urban road management and maintenance",
  }),
  A("FIRE_RESCUE", "Tanzania Fire and Rescue Force", "DISASTER_EMERGENCY", {
    type: "PUBLIC_CORPORATION",
    mandate: "Fire suppression, rescue, fire-safety certification",
  }),
  A("NEMC", "National Environment Management Council", "ENVIRONMENT", {
    type: "COUNCIL", website: "https://www.nemc.or.tz",
    mandate: "Environmental impact assessment, pollution control, environmental licensing",
    categories: ["EIA systems", "environmental approvals"],
  }),
  A("SURVEY_DEPT", "Department of Survey", "GEOSPATIAL_LOCATION", {
    type: "DEPARTMENT", parent: "MINISTRY_LANDS_HOUSING",
    mandate: "Land surveying, geodetic control, spatial data",
  }),

  /* ---------------- LAND / PROPERTY (§25) ------------------------------- */
  A("LAND_REGISTRY", "Land Registry", "LAND", {
    type: "DEPARTMENT", parent: "MINISTRY_LANDS_HOUSING", consent: "TRUE", agreement: "TRUE",
    mandate: "Land title registration, registration of interests, official copies",
    categories: ["title verification", "land-use permitting"],
    notes: "Protected records; access only through authorized, purpose-limited channels.",
  }),
  A("NLUPC", "National Land Use Planning Commission", "LAND", {
    type: "COMMISSION",
    mandate: "National land use planning, land-use permitting",
  }),

  /* ---------------- WATER (§26) ------------------------------------------ */
  A("MINISTRY_WATER", "Ministry of Water", "WATER", {
    type: "MINISTRY",
    mandate: "Water resource management, water supply and sanitation policy",
    categories: ["water-use permits", "water resource management"],
  }),
  A("RUWASA", "Rural Water Supply and Sanitation Regulatory Authority", "WATER", {
    type: "REGULATOR",
    mandate: "Regulation of rural water supply and sanitation services",
  }),
  A("NATIONAL_WATER_FUND", "National Water Fund", "WATER", {
    type: "FUND",
    mandate: "Financing of water supply and sanitation investments",
  }),
  A("WB_PANGANI", "Pangani Basin Water Board", "WATER", { type: "BOARD", mandate: "Water resource management — Pangani basin" }),
  A("WB_RUVUMA", "Ruvuma Basin Water Board", "WATER", { type: "BOARD", mandate: "Water resource management — Ruvuma basin" }),
  A("WB_RUVU", "Ruvu Basin Water Board", "WATER", { type: "BOARD", mandate: "Water resource management — Ruvu basin" }),
  A("WB_GREAT_LAKES", "Great Lakes Basin Water Board", "WATER", { type: "BOARD", mandate: "Water resource management — Great Lakes basin" }),
  A("WB_RUFIJI", "Rufiji Basin Water Board", "WATER", { type: "BOARD", mandate: "Water resource management — Rufiji basin" }),
  A("EWURA", "Energy and Water Utilities Regulatory Authority", "ENERGY", {
    type: "REGULATOR", website: "https://www.ewura.or.tz",
    mandate: "Regulation of energy and water utilities: licensing, tariffs, service quality",
    categories: ["utility licensing", "tariff regulation"],
  }),

  /* ---------------- ENERGY / PETROLEUM (§27) ---------------------------- */
  A("REA", "Rural Energy Agency", "ENERGY", {
    type: "AGENCY",
    mandate: "Rural energy development and renewable energy promotion",
  }),
  A("TANESCO", "Tanzania Electric Supply Company (TANESCO)", "ENERGY", {
    type: "PUBLIC_CORPORATION", website: "https://www.tanesco.co.tz",
    mandate: "Electricity generation, transmission and distribution",
  }),
  A("TPDC", "Tanzania Petroleum Development Corporation", "ENERGY", {
    type: "PUBLIC_CORPORATION",
    mandate: "Upstream petroleum development",
  }),
  A("PURA", "PURA (Petroleum Upstream/Cadastre Authority)", "ENERGY", {
    uncertain: true, notes: "Abbreviation used in BEYU architecture work — verify official name (petroleum regulatory/cadastre functions) during reconciliation.",
  }),
  A("PBPA", "PBPA (Petroleum and Biofuels/Petroleum Board)", "ENERGY", {
    uncertain: true, notes: "Abbreviation used in BEYU architecture work — verify official name (petroleum/petroleum products regulation) during reconciliation.",
  }),
  A("TAECA", "Tanzania Atomic Energy Commission", "ENERGY", {
    type: "COMMISSION",
    mandate: "Regulation of atomic energy and radiation safety",
  }),

  /* ---------------- MINING (§28) ----------------------------------------- */
  A("MINING_COMMISSION", "Mining Commission of Tanzania", "MINING", {
    type: "COMMISSION", website: "https://www.miningcommission.go.tz",
    mandate: "Mineral licensing, inspection, mineral revenue, geoscience services",
    categories: ["mineral licensing", "inspection", "assay/laboratory systems"],
  }),
  A("GST", "Geological Survey of Tanzania", "MINING", {
    type: "INSTITUTION",
    mandate: "Geological mapping and earth-science information",
  }),
  A("TGC", "Tanzania Gemmological Centre", "MINING", {
    type: "INSTITUTION", website: "https://www.tgc.go.tz",
    mandate: "Gems and jewellery certification, gemstone trade standards",
  }),
  A("STAMICO", "School of Mining Technology (STAMICO)", "MINING", {
    type: "INSTITUTION",
    mandate: "Mining technical education and training",
  }),

  /* ---------------- ENVIRONMENT / NATURAL RESOURCES (§29) --------------- */
  A("TAWA", "Tanzania Wildlife Authority", "NATURAL_RESOURCES", {
    type: "AGENCY", website: "https://www.tawa.go.tz",
    mandate: "Wildlife management and conservation, wildlife licensing",
    categories: ["wildlife licensing"],
  }),
  A("TANZANIA_FOREST_SERVICES", "Tanzania Forest Services", "ENVIRONMENT", {
    type: "PUBLIC_CORPORATION",
    mandate: "Forest management, forest licensing, timber production",
    categories: ["forest licensing"],
  }),
  A("TANAPA", "Tanzania National Parks Authority", "NATURAL_RESOURCES", {
    type: "AGENCY", website: "https://www.tanapa.go.tz",
    mandate: "National parks management and conservation",
  }),
  A("NCAA_CULTURE", "National Council for Culture and Arts (NCAA)", "CULTURE", {
    type: "COUNCIL",
    uncertain: true, notes: "Culture and arts council as discussed in BEYU architecture work — verify current official name/status during reconciliation.",
  }),
  A("TAWIRI", "Tanzania Wildlife Research Institute", "NATURAL_RESOURCES", {
    type: "INSTITUTION",
    mandate: "Wildlife research",
  }),
  A("NENF", "National Environment Fund", "ENVIRONMENT", {
    type: "FUND",
    mandate: "Financing of environmental protection activities",
  }),

  /* ---------------- TRANSPORT (§30) -------------------------------------- */
  A("LATRA", "Land Transport Regulatory Authority", "TRANSPORT", {
    type: "AGENCY",
    mandate: "Land transport regulation: road transport licensing, vehicle registration, driver licensing",
    categories: ["vehicle registration", "driver licensing", "road transport licensing"],
  }),
  A("TCAA", "Tanzania Civil Aviation Authority", "TRANSPORT", {
    type: "AGENCY", website: "https://www.tcaa.go.tz",
    mandate: "Civil aviation regulation, airport authority functions, aviation licensing",
    categories: ["aviation licensing", "airport systems"],
  }),
  A("TAA", "Tanzania Ports Authority", "TRANSPORT", {
    type: "AGENCY",
    mandate: "Port management and services, maritime/shipping systems",
    categories: ["port systems", "maritime/shipping"],
  }),
  A("TPA", "TPA (Tanzania Ports/Transport Authority)", "TRANSPORT", {
    uncertain: true, notes: "Abbreviation used in BEYU architecture work — verify whether distinct from TAA during reconciliation (failure policy: UNCERTAIN).",
  }),
  A("TRC", "Tanzania Railways Corporation (TRC)", "TRANSPORT", {
    uncertain: true, notes: "Railway operator as discussed in BEYU architecture work — verify current official name during reconciliation.",
  }),
  A("TASAC", "TASAC", "TRANSPORT", {
    uncertain: true, notes: "Abbreviation used in BEYU architecture work — verify official identity (rail/transport) during reconciliation (failure policy: UNCERTAIN).",
  }),
  A("DART", "Dar es Salaam Rapid Transit", "TRANSPORT", {
    type: "PUBLIC_CORPORATION",
    mandate: "Urban rapid transit in Dar es Salaam",
  }),

  /* ---------------- COMMUNICATIONS / DIGITAL GOVERNMENT (§31) ----------- */
  A("EGA", "e-Government Agency (e-GA)", "DIGITAL_GOVERNMENT", {
    type: "AGENCY", website: "https://www.ega.go.tz",
    mandate: "e-Government policy, GovESB, government service directory, digital signature infrastructure, Huduma Pamoja coordination",
    categories: ["GovESB", "government service directory", "digital services"],
    notes: "The authoritative channel for most cross-organizational government integrations (see jurisdiction profile integration_regime).",
  }),
  A("TCRA", "Tanzania Communications Regulatory Authority", "COMMUNICATIONS", {
    type: "REGULATOR", website: "https://www.tcra.go.tz",
    mandate: "Spectrum management, telecommunications licensing, media/broadcast regulation",
    categories: ["spectrum", "telecom licensing", "media regulation"],
  }),
  A("ICT_COMMISSION", "ICT Commission", "DIGITAL_GOVERNMENT", {
    type: "COMMISSION", uncertain: true,
    notes: "As discussed in BEYU architecture work — verify current status (functions may be within e-GA/Ministry) during reconciliation.",
  }),
  A("UCSAF", "UCSAF", "DIGITAL_GOVERNMENT", {
    uncertain: true, notes: "Abbreviation used in BEYU architecture work (communications context) — official identity to be verified during reconciliation (failure policy: UNCERTAIN).",
  }),
  A("TANZANIA_POSTS", "Tanzania Posts Corporation", "POSTAL", {
    type: "PUBLIC_CORPORATION", website: "https://www.tanzaniaposts.co.tz",
    mandate: "Postal services, courier and digital postal services",
  }),
  A("GOVESB", "GovESB (Government Enterprise Service Bus)", "DIGITAL_GOVERNMENT", {
    type: "OTHER", parent: "EGA",
    mandate: "The government service bus platform for authorized inter-system integration",
    notes: "Platform, not an authority. Its regime requirements are recorded in the TZ jurisdiction profile (REQUIREMENTS_ONLY — not a compliance claim).",
  }),

  /* ---------------- EDUCATION (§32) -------------------------------------- */
  A("TCU", "Tanzania Commission for University Education (TCUE)", "EDUCATION", {
    type: "COMMISSION", website: "https://www.tcue.go.tz",
    mandate: "University establishment, accreditation, degree validation, higher-education registries",
    categories: ["degree validation", "university accreditation"],
  }),
  A("NECTA", "National Examinations Council of Tanzania", "EDUCATION", {
    type: "COUNCIL", website: "https://www.necta.go.tz",
    mandate: "National examinations, certificate verification",
    categories: ["credential verification"],
  }),
  A("NACTVET", "National Council for Technical and Vocational Education and Training", "EDUCATION", {
    type: "COUNCIL", website: "https://www.nactvet.go.tz",
    mandate: "TVET accreditation and standards",
  }),
  A("VETA", "Vocational Education and Training Authority", "EDUCATION", {
    type: "AGENCY", website: "https://www.veta.go.tz",
    mandate: "Vocational training institution licensing and regulation",
  }),
  A("TIE", "TIE (Teacher Education Institution/Authority)", "EDUCATION", {
    uncertain: true, notes: "Abbreviation used in BEYU architecture work — verify official identity (teacher education) during reconciliation (failure policy: UNCERTAIN).",
  }),
  A("HESLB", "Higher Education Students' Loan Board", "EDUCATION", {
    type: "BOARD", website: "https://www.heslb.go.tz",
    mandate: "Student loans for higher education",
  }),

  /* ---------------- TRADE / INDUSTRY / STANDARDS (§33) ------------------- */
  A("TBS", "Tanzania Bureau of Standards", "STANDARDS", {
    type: "AGENCY", website: "https://www.tbs.go.tz",
    mandate: "Standards, product certification, import/export conformity, weights and measures",
    categories: ["product certification", "import/export licensing", "weights and measures"],
  }),
  A("FCC", "Fair Competition Commission", "CONSUMER_PROTECTION", {
    type: "COMMISSION", website: "https://www.fcc.go.tz",
    mandate: "Competition policy, consumer protection enforcement",
  }),
  A("TANTRADE", "Tanzania Trade Development Agency (TanTrade)", "TRADE", {
    type: "AGENCY", uncertain: true,
    notes: "Trade development agency as discussed in BEYU architecture work — verify current official name/status during reconciliation.",
  }),
  A("WEIGHTS_MEASURES", "Weights and Measures Agency", "STANDARDS", {
    type: "AGENCY",
    uncertain: true, notes: "Weights and measures functions (may sit within TBS) — verify current structure during reconciliation.",
  }),

  /* ---------------- PROCUREMENT (§35) ------------------------------------ */
  A("PPRA", "Public Procurement Regulatory Authority (PPRA)", "GOVERNMENT_PROCUREMENT", {
    type: "AGENCY",
    mandate: "Public procurement regulation, supplier registry, procurement policy",
    categories: ["government supplier registry", "public contract systems"],
  }),
  A("GPSA", "Government Procurement Service Agency (GPSA)", "GOVERNMENT_PROCUREMENT", {
    type: "AGENCY",
    mandate: "Execution of public procurement on behalf of government",
  }),
  A("NEST", "NeST (National e-Procurement/Sourcing Platform)", "GOVERNMENT_PROCUREMENT", {
    type: "OTHER", uncertain: true,
    notes: "National e-procurement platform as discussed in BEYU architecture work — verify official name/status during reconciliation.",
  }),

  /* ---------------- TOURISM / CULTURE / SPORTS / MEDIA (§36) ------------- */
  A("TTB", "Tanzania Tourist Board", "TOURISM", {
    type: "BOARD",
    mandate: "Tourism promotion, tourism licensing, tourism levy",
    categories: ["tourism licensing", "tourism levy systems"],
  }),

  /* ---------------- LEGAL / JUSTICE (§37) -------------------------------- */
  A("JUDICIARY", "Judiciary of Tanzania", "LEGAL_JUSTICE", {
    type: "JUDICIARY", website: "https://www.judiciary.go.tz",
    mandate: "Courts of record and justice administration",
  }),
  A("COURT_OF_APPEAL", "Court of Appeal", "LEGAL_JUSTICE", { type: "JUDICIARY", parent: "JUDICIARY", mandate: "Appellate jurisdiction (highest court)" }),
  A("HIGH_COURT", "High Court (Commercial, Land and Labour Divisions)", "LEGAL_JUSTICE", { type: "JUDICIARY", parent: "JUDICIARY", mandate: "Original and appellate jurisdiction; Commercial, Land and Labour Divisions" }),
  A("RENT_MAGISTRATES_COURTS", "Resident Magistrates' Courts", "LEGAL_JUSTICE", { type: "JUDICIARY", parent: "JUDICIARY", mandate: "Criminal and civil jurisdiction at district level" }),
  A("DISTRICT_COURTS", "District Courts", "LEGAL_JUSTICE", { type: "JUDICIARY", parent: "JUDICIARY", mandate: "District-level jurisdiction" }),
  A("PRIMARY_COURTS", "Primary Courts", "LEGAL_JUSTICE", { type: "JUDICIARY", parent: "JUDICIARY", mandate: "Customary and primary jurisdiction" }),
  A("OAG", "Office of the Attorney General", "LEGAL_JUSTICE", { type: "DEPARTMENT", mandate: "Government legal advice and representation" }),
  A("DPP", "Director of Public Prosecutions", "LEGAL_JUSTICE", { type: "DEPARTMENT", mandate: "Criminal prosecution" }),
  A("LAW_SCHOOL", "Law School of Tanzania", "LEGAL_JUSTICE", { type: "INSTITUTION", mandate: "Legal professional training and admission" }),
  A("TLS", "Tanganyika Law Society", "LEGAL_JUSTICE", { type: "INSTITUTION", mandate: "Bar association; legal profession regulation" }),
  A("LAW_REFORM", "Law Reform Commission", "LEGAL_JUSTICE", { type: "COMMISSION", mandate: "Law review and reform" }),
  A("CHRAGG", "Human Rights Commission for the United Republic of Tanzania (CHRAGG)", "HUMAN_RIGHTS", {
    type: "COMMISSION", website: "https://www.chragg.go.tz",
    mandate: "Human rights promotion, protection and investigation",
  }),
  A("JSC", "Judicial Service Commission", "LEGAL_JUSTICE", { type: "COMMISSION", parent: "JUDICIARY", mandate: "Judicial appointments and discipline" }),
  A("ETHICS_SECRETARIAT", "Ethics Secretariat (Judiciary)", "LEGAL_JUSTICE", { type: "DEPARTMENT", parent: "JUDICIARY", mandate: "Judicial ethics enforcement" }),
  A("PRISONS", "Prisons of Tanzania", "LEGAL_JUSTICE", { type: "PUBLIC_CORPORATION", mandate: "Corrections and detention services" }),

  /* ---------------- GOVERNANCE / OVERSIGHT (§38) ------------------------- */
  A("NAOT", "Controller and Auditor General / National Audit Office for Tanzania (CAG/NAOT)", "GOVERNANCE", {
    type: "AGENCY", website: "https://www.naot.go.tz",
    mandate: "State audit, public financial accountability",
  }),
  A("PCCB", "PCCB (Public Complaints/Corruption Commission)", "ANTI_CORRUPTION", {
    type: "COMMISSION", uncertain: true,
    notes: "Anti-corruption/complaints commission as discussed in BEYU architecture work — verify official name (Public Complaints Commission lineage) during reconciliation.",
  }),
  A("PARLIAMENT", "Parliament of the United Republic of Tanzania", "GOVERNANCE", {
    type: "PARLIAMENT",
    mandate: "Legislature (National Assembly; the Senate is not currently in session — verify constitutional status)",
    notes: "Institutional inventory only — no political judgments.",
  }),
  A("PSC", "Public Service Commission", "PUBLIC_SERVICE", {
    type: "COMMISSION",
    mandate: "High-level public service appointments",
  }),
  A("NEC", "National Electoral Commission (current authoritative electoral body)", "GOVERNANCE", {
    type: "COMMISSION",
    uncertain: true, notes: "Current authoritative electoral body — verify against the constitutionally designated body during reconciliation.",
  }),

  /* ---------------- STATISTICS / RESEARCH / SCIENCE / TECHNOLOGY (§39) --- */
  A("NBS", "National Bureau of Statistics", "STATISTICS", {
    type: "AGENCY", website: "https://www.nbs.go.tz", cost: "PUBLIC_INFORMATION", apiStatus: "PUBLIC",
    mandate: "National statistics: census, indicators, open data",
    categories: ["public statistics", "open data"],
    notes: "Public statistics are public information — not a protected-data entitlement.",
  }),
  A("COSTECH", "Tanzania Commission for Science and Technology (COSTECH)", "RESEARCH_SCIENCE", {
    type: "COMMISSION", website: "https://www.costech.go.tz",
    mandate: "Science, technology and innovation policy; research institutions",
  }),

  /* ---------------- DISASTER / EMERGENCY / CLIMATE (§40) ----------------- */
  A("TMA", "Tanzania Meteorological Authority", "WEATHER_CLIMATE", {
    type: "AGENCY", website: "https://www.tma.go.tz", cost: "PUBLIC_INFORMATION", apiStatus: "PUBLIC",
    mandate: "Weather forecasting, climate information, meteorological services",
    notes: "Forecast information is public information; hazardous-weather products may be PUBLIC_SERVICE.",
  }),

  /* ---------------- COMMUNITY / SOCIAL SERVICES (§41) -------------------- */
  A("NCPWD", "National Commission for Persons with Disabilities (NCPWD)", "COMMUNITY_SOCIAL_SERVICES", {
    type: "COMMISSION", website: "https://www.ncpwd.go.tz",
    mandate: "Persons with disabilities: rights, inclusion, accessibility",
  }),

  /* ---------------- NGO / NONPROFIT / FOUNDATION (§42) ------------------- */
  A("NGO_BUREAU", "NGO Bureau (registration/regulatory system)", "NGOS_NONPROFIT", {
    type: "NGO_REGULATOR", uncertain: true,
    notes: "NGO registration and regulation — verify current host ministry/status during reconciliation. BRELA/RITA/TRA/NIDA/PDPC/NSSF/WCF/NHIF/OSHA interfaces for NGOs are the same authority records seeded above.",
  }),
  A("PDPC", "Personal Data Protection Commission", "DATA_GOVERNANCE", {
    type: "COMMISSION", website: "https://www.pdpc.go.tz",
    mandate: "Data protection regulation under PDPA 2022: controller registration, enforcement, data-subject rights",
    categories: ["controller registration", "data-subject rights", "cross-border transfer control"],
  }),

  /* ---------------- INTERNATIONAL / CROSS-BORDER (§46) ------------------- */
  A("EAC", "East African Community (EAC)", "INTERNATIONAL_CROSS_BORDER", {
    type: "INTL_AUTHORITY", website: "https://www.eac.int",
    mandate: "Regional bloc: single market, trade, cross-border frameworks (secretariat in Arusha)",
    notes: "External interface authority — capability negotiation required before any reliance (program §61).",
  }),
  A("SADC", "Southern African Development Community (SADC)", "INTERNATIONAL_CROSS_BORDER", {
    type: "INTL_AUTHORITY",
    mandate: "Regional bloc: trade, cross-border frameworks",
    notes: "External interface authority where applicable — verify current treaty posture during reconciliation.",
  }),
  A("ARCHIVES", "National Archives of Tanzania", "DOCUMENT_RECORDS", {
    type: "INSTITUTION",
    mandate: "National archives and public records",
    notes: "Access to records follows the Archives Act; public information only until authorized.",
  }),
];
