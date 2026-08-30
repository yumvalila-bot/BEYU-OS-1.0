// ─────────────────────────────────────────────────────────────────────────────
// BEYU MANDATORY COMPLIANCE PACK — TANZANIA
// Auto-stamped transaction model + full regulatory library (20 sections).
// ─────────────────────────────────────────────────────────────────────────────

/* ═══════════════════════════════════════════════════════════════════════════
   PART 1 — AUTO-STAMPED TRANSACTION MODEL
   Every action across BEYU Health OS automatically generates this record.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface TransactionStamp {
  /** Sequential immutable transaction ID */
  txId: string;
  /** ISO timestamp at the millisecond */
  timestamp: string;
  /** Local clock as displayed */
  localTime: string;
  /** User ID of the actor (employee, patient, system, AI agent) */
  userId: string;
  /** Human-readable name of the actor */
  userName: string;
  /** Role at time of action */
  userRole: string;
  /** Professional licence (MCT / TNMC / PCT / HLB) — null for non-clinical */
  licenseNumber: string | null;
  /** Facility / Tenant ID */
  facilityId: string;
  /** Facility name */
  facilityName: string;
  /** Department / clinical area */
  department: string;
  /** Geolocation (lat,lng + city) */
  location: { lat: number; lng: number; city: string; ip: string };
  /** What was done */
  action: string;
  /** Target resource (e.g. patient MRN) */
  resource: string;
  /** Outcome */
  result: "SUCCESS" | "DENIED" | "WARNING" | "ERROR";
  /** Hive AI agent involved (if any) */
  aiAgent?: string;
  /** Smart-contract anchor txn (if any) */
  chainHash?: string;
  /** SHA-256 of the record */
  recordHash: string;
}

/** Live sample of auto-stamped transactions powering the demo. */
export const TRANSACTIONS: TransactionStamp[] = [
  {
    txId: "TX-2026-05-04-014218-001", timestamp: "2026-05-04T14:42:18.412Z", localTime: "14:42:18",
    userId: "EMP-10010", userName: "Dr. Neema Mwangi", userRole: "Medical Officer",
    licenseNumber: "MCT/MD-2019-4412",
    facilityId: "MUH-DSM-01", facilityName: "Muhimbili National Hospital", department: "OPD",
    location: { lat: -6.7924, lng: 39.2083, city: "Dar es Salaam", ip: "10.42.1.22" },
    action: "PRESCRIBE_MEDICATION", resource: "RX-08828 · Amoxicillin 500mg TDS × 7d · BEYU-100482",
    result: "SUCCESS", chainHash: "0x8f4ab9...e012",
    recordHash: "sha256:2af9c1...41ec",
  },
  {
    txId: "TX-2026-05-04-014212-002", timestamp: "2026-05-04T14:42:12.001Z", localTime: "14:42:12",
    userId: "AI-TRIAGE-v2", userName: "Hive Triage AI", userRole: "AI Agent (governed)",
    licenseNumber: null,
    facilityId: "MUH-DSM-01", facilityName: "Muhimbili National Hospital", department: "Emergency",
    location: { lat: -6.7924, lng: 39.2083, city: "Dar es Salaam", ip: "internal" },
    action: "ESCALATE_TO_ICU", resource: "BEYU-100486 · NEWS 9",
    result: "SUCCESS", aiAgent: "triage-ai-v2", chainHash: "0x9b5cd2...f103",
    recordHash: "sha256:3bf0d2...52fd",
  },
  {
    txId: "TX-2026-05-04-014205-003", timestamp: "2026-05-04T14:42:05.880Z", localTime: "14:42:05",
    userId: "EMP-10020", userName: "Grace Mushi", userRole: "Senior Nurse",
    licenseNumber: "TNMC/RN-2015-9214",
    facilityId: "MUH-DSM-01", facilityName: "Muhimbili National Hospital", department: "Ward A",
    location: { lat: -6.7924, lng: 39.2083, city: "Dar es Salaam", ip: "10.42.2.7" },
    action: "RECORD_VITALS", resource: "BEYU-100485 · 4 patients · BP/HR/SpO₂/Temp",
    result: "SUCCESS",
    recordHash: "sha256:4ca1e3...63ge",
  },
  {
    txId: "TX-2026-05-04-014152-004", timestamp: "2026-05-04T14:41:52.221Z", localTime: "14:41:52",
    userId: "EMP-10030", userName: "Ahmed Bakari", userRole: "Chief Pharmacist",
    licenseNumber: "PCT/PH-2014-1827",
    facilityId: "MUH-DSM-01", facilityName: "Muhimbili National Hospital", department: "Pharmacy",
    location: { lat: -6.7924, lng: 39.2083, city: "Dar es Salaam", ip: "10.42.5.12" },
    action: "DISPENSE_CONTROLLED", resource: "Fentanyl 25mcg/h patch · BEYU-100489 · co-signed by EMP-10031",
    result: "SUCCESS", chainHash: "0xacde74...221b",
    recordHash: "sha256:5dc2f4...74hf",
  },
  {
    txId: "TX-2026-05-04-014150-005", timestamp: "2026-05-04T14:41:50.500Z", localTime: "14:41:50",
    userId: "SYS-NHIF-Gateway", userName: "NHIF Claims Gateway", userRole: "System Integration",
    licenseNumber: null,
    facilityId: "MUH-DSM-01", facilityName: "Muhimbili National Hospital", department: "Billing",
    location: { lat: -6.7924, lng: 39.2083, city: "Dar es Salaam", ip: "internal" },
    action: "SUBMIT_NHIF_CLAIM", resource: "CLM-44132 · TZS 1,840,000 · BEYU-100489",
    result: "SUCCESS", chainHash: "0xbef185...3320",
    recordHash: "sha256:6ed3g5...85ig",
  },
  {
    txId: "TX-2026-05-04-014132-006", timestamp: "2026-05-04T14:41:32.910Z", localTime: "14:41:32",
    userId: "EMP-10032", userName: "Lucy Mtui", userRole: "Lab Technologist",
    licenseNumber: "HLB/MLS-2017-2241",
    facilityId: "MUH-DSM-01", facilityName: "Muhimbili National Hospital", department: "Laboratory",
    location: { lat: -6.7924, lng: 39.2083, city: "Dar es Salaam", ip: "10.42.3.4" },
    action: "RELEASE_LAB_RESULT", resource: "LIS-22842 · Blood culture E.coli · CRITICAL",
    result: "SUCCESS", chainHash: "0xcfa296...4431",
    recordHash: "sha256:7fe4h6...96jh",
  },
  {
    txId: "TX-2026-05-04-014118-007", timestamp: "2026-05-04T14:41:18.044Z", localTime: "14:41:18",
    userId: "EMP-10003", userName: "Dr. M. Achieng", userRole: "Chief Medical Officer",
    licenseNumber: "MCT/MD-S-2015-882",
    facilityId: "AGA-DSM-02", facilityName: "Aga Khan Hospital (switched from MUH)", department: "Cross-tenant",
    location: { lat: -6.7611, lng: 39.2785, city: "Dar es Salaam", ip: "10.42.1.4" },
    action: "TENANT_SWITCH", resource: "MUH-DSM-01 → AGA-DSM-02",
    result: "WARNING", chainHash: "0xdfb3a7...5542",
    recordHash: "sha256:8gf5i7...a7ki",
  },
  {
    txId: "TX-2026-05-04-014048-008", timestamp: "2026-05-04T14:40:48.700Z", localTime: "14:40:48",
    userId: "BEYU-100484", userName: "Neema Mwangi (Patient)", userRole: "Patient (Citizen App)",
    licenseNumber: null,
    facilityId: "PORTAL", facilityName: "BEYU Citizen App", department: "Patient Portal",
    location: { lat: -6.8023, lng: 39.2456, city: "Dar es Salaam", ip: "M-Pesa SIM" },
    action: "GRANT_CONSENT", resource: "Share records → ARU-MED-03 (Arusha LMC) for ANC referral",
    result: "SUCCESS", chainHash: "0xefc4b8...6653",
    recordHash: "sha256:9hg6j8...b8lj",
  },
  {
    txId: "TX-2026-05-04-014032-009", timestamp: "2026-05-04T14:40:32.122Z", localTime: "14:40:32",
    userId: "UNKNOWN-203.0.113.42", userName: "Unidentified", userRole: "External attacker",
    licenseNumber: null,
    facilityId: "PERIMETER", facilityName: "Edge Gateway", department: "WAF",
    location: { lat: -23.5505, lng: -46.6333, city: "São Paulo, BR", ip: "203.0.113.42" },
    action: "AUTH_FAILURE", resource: "WebAuthn challenge · attempt 3/3",
    result: "DENIED",
    recordHash: "sha256:aih7k9...c9mk",
  },
  {
    txId: "TX-2026-05-04-014015-010", timestamp: "2026-05-04T14:40:15.001Z", localTime: "14:40:15",
    userId: "SYS-MPI", userName: "MPI Reconciler", userRole: "System (AI-assisted)",
    licenseNumber: null,
    facilityId: "GLOBAL", facilityName: "Global Identity Engine", department: "Identity",
    location: { lat: 0, lng: 0, city: "Multi-region", ip: "internal" },
    action: "MERGE_DUPLICATE_MRN", resource: "BEYU-099812 ⇆ BEYU-100501 (similarity 0.97)",
    result: "SUCCESS", aiAgent: "mpi-reconciler-v1", chainHash: "0xfdb5c9...7764",
    recordHash: "sha256:bji8l0...da4l",
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   PART 2 — TANZANIA MANDATORY COMPLIANCE LIBRARY
   Every regulation BEYU Health OS observes — with implementation mapping.
   ═══════════════════════════════════════════════════════════════════════════ */

export type ComplianceStatus = "COMPLIANT" | "PARTIAL" | "IN-PROGRESS";
export type Authority = "MoH" | "TMDA" | "MCT" | "TNMC" | "PCT" | "TCRA" | "PDPC" | "NHIF" | "BoT" | "TAEC" | "TBS" | "ISO" | "WHO" | "Multi";

export interface Regulation {
  id: string;
  name: string;
  authority: Authority;
  status: ComplianceStatus;
  /** How BEYU Health OS implements / enforces this */
  beyuImplementation: string;
  /** Linked modules */
  modules?: string[];
}

export interface ComplianceSection {
  id: string;
  letter: string;        // A-T
  title: string;
  description: string;
  icon: string;
  color: string;
  regulations: Regulation[];
}

export const COMPLIANCE_PACK: ComplianceSection[] = [
  // ───── A. NATIONAL LAWS ─────
  {
    id: "national", letter: "A", title: "National Laws", icon: "scale", color: "#0B1D3A",
    description: "Foundational laws of the United Republic of Tanzania",
    regulations: [
      { id: "n1", name: "Constitution of the United Republic of Tanzania", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "All processing respects constitutional right to privacy & dignity. Patient consent is the default." },
      { id: "n2", name: "Personal Data Protection Act, 2022", authority: "PDPC", status: "COMPLIANT",
        beyuImplementation: "DPO appointed · DPIA per processing activity · field-level encryption · patient consent ledger on-chain · cross-border transfer gated by BeyuConsent.sol",
        modules: ["Security Ops", "Consent Ledger"] },
      { id: "n3", name: "Cybercrimes Act, 2015", authority: "TCRA", status: "COMPLIANT",
        beyuImplementation: "WAF · IDS · IP rate-limiting · cybercrime liaison procedure · all access logged to immutable SIEM",
        modules: ["Security Ops", "Audit"] },
      { id: "n4", name: "Electronic Transactions Act", authority: "TCRA", status: "COMPLIANT",
        beyuImplementation: "All e-transactions auto-stamped (this very module) · signature timestamps · chain-anchored proof",
        modules: ["Compliance"] },
      { id: "n5", name: "Access to Information Act, 2016", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Subject-access request workflow · 30-day SLA · patient-portal self-service for own records" },
      { id: "n6", name: "e-Government Act", authority: "TCRA", status: "COMPLIANT",
        beyuImplementation: "Integrations with DHIS2, NIDA, NHIF · government API standards followed" },
      { id: "n7", name: "Evidence Act (Electronic Records & Signatures)", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Cryptographic SHA-256 hashes + on-chain anchoring → admissible electronic evidence" },
      { id: "n8", name: "Anti-Money Laundering Act", authority: "BoT", status: "COMPLIANT",
        beyuImplementation: "KYC on tenants · payment monitoring · suspicious-transaction reporting hook" },
      { id: "n9", name: "Employment and Labour Relations Act", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "HR module enforces statutory leave, hours, contracts (DOC-HR-001 template)" },
      { id: "n10", name: "Occupational Safety and Health Act", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Staff incident reporting · IPC surveillance · biohazard tracking" },
    ],
  },

  // ───── B. HEALTH SECTOR LAWS ─────
  {
    id: "health-laws", letter: "B", title: "Health Sector Laws", icon: "heart", color: "#dc2626",
    description: "Statutes governing health services in Tanzania",
    regulations: [
      { id: "b1", name: "Public Health Act, 2009", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Notifiable disease reporting · IDSR integration · outbreak surveillance" },
      { id: "b2", name: "Pharmacy Act, 2011", authority: "PCT", status: "COMPLIANT",
        beyuImplementation: "PCT-licensed dispensing · controlled-substance register · prescription validity checks" },
      { id: "b3", name: "TMDA Act", authority: "TMDA", status: "COMPLIANT",
        beyuImplementation: "Drug registry imported from TMDA · only registered medicines dispensable · device tracking" },
      { id: "b4", name: "National Health Insurance Fund Act", authority: "NHIF", status: "COMPLIANT",
        beyuImplementation: "Real-time eligibility · claim submission · reconciliation · accreditation maintained" },
      { id: "b5", name: "Universal Health Insurance legislation", authority: "MoH", status: "IN-PROGRESS",
        beyuImplementation: "Architecture ready · awaiting enactment for full activation" },
      { id: "b6", name: "Mental Health legislation", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Mental health module · risk assessment · confidentiality enforced" },
      { id: "b7", name: "HIV and AIDS Prevention and Control Act", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "ART register · contact tracing with consent · special PHI confidentiality flags" },
      { id: "b8", name: "Medical, Dental and Allied Health Professionals legislation", authority: "MCT", status: "COMPLIANT",
        beyuImplementation: "Practitioner license validated on every clinical action (visible in transaction stamps)" },
      { id: "b9", name: "Nursing and Midwifery legislation", authority: "TNMC", status: "COMPLIANT",
        beyuImplementation: "TNMC license validated · scope of practice enforced via RBAC" },
      { id: "b10", name: "Traditional and Alternative Medicine legislation", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Separate practitioner category · supports referrals to/from conventional care" },
      { id: "b11", name: "Private Health Laboratories legislation", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "HLB license tracked for every lab tenant · QC + EQA enforced" },
      { id: "b12", name: "Hospital and Health Facility licensing laws", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Facility licence status tracked per tenant · audit-ready" },
    ],
  },

  // ───── C. MoH COMPLIANCE ─────
  {
    id: "moh", letter: "C", title: "Ministry of Health Compliance", icon: "building", color: "#1E3A8A",
    description: "MoH strategies, architectures and standards",
    regulations: [
      { id: "c1", name: "National Digital Health Strategy", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Architecture aligned to Tanzania Digital Health Investment Roadmap" },
      { id: "c2", name: "Health Sector Strategic Plan", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Service delivery model maps to HSSP V indicators" },
      { id: "c3", name: "National eHealth / Digital Health Architecture", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "FHIR R5 + HL7 v2 native · DHIS2 sync · NIDA + NHIF integrations" },
      { id: "c4", name: "National Health Information Systems Guidelines", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "MTUHA forms 1-12 auto-generated · DHIS2 push" },
      { id: "c5", name: "National Referral Guidelines", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Referral workflow follows tier-1→6 escalation rules" },
      { id: "c6", name: "National IPC Guidelines", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "IPC module · hand-hygiene audits · HAI surveillance" },
      { id: "c7", name: "National Patient Safety Guidelines", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Incident reporting · M&M review module · WHO surgical checklist" },
      { id: "c8", name: "Health Facility Licensing Standards", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Tenant onboarding validates licence" },
      { id: "c9", name: "Health Facility Accreditation Standards", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Quality dashboard maps to MoH accreditation indicators" },
    ],
  },

  // ───── D. CLINICAL COMPLIANCE ─────
  {
    id: "clinical", letter: "D", title: "Clinical Compliance", icon: "emr", color: "#dc2626",
    description: "Clinical guidelines & standards of care",
    regulations: [
      { id: "d1", name: "Tanzania Standard Treatment Guidelines (STG)", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "STG embedded in Clinical Decision Support · Hive Co-Pilot enforces" },
      { id: "d2", name: "National Essential Medicines List (NEMLIT)", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "NEMLIT forms the default formulary; non-list items require approval" },
      { id: "d3", name: "Antimicrobial Stewardship Guidelines", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Restricted antibiotics require AMS approval · usage dashboards" },
      { id: "d4", name: "Clinical Audit Guidelines", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Clinical audit module · case sampling · reporting" },
      { id: "d5", name: "Maternal and Newborn Care Guidelines", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Live partograph · maternal indicators · perinatal death surveillance" },
      { id: "d6", name: "Integrated Management of Childhood Illness (IMCI)", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Pediatrics module follows IMCI protocols + EPI schedules" },
      { id: "d7", name: "Emergency Care Guidelines", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "ESI triage · trauma activation · ambulance coordination" },
      { id: "d8", name: "Critical Care Guidelines", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "ICU dashboard · NEWS scoring · sepsis-6 bundle compliance" },
      { id: "d9", name: "Surgical Safety Guidelines", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "WHO Surgical Safety Checklist enforced before incision (Theatre module)" },
    ],
  },

  // ───── E. PCT ─────
  {
    id: "pct", letter: "E", title: "Pharmacy Council of Tanzania", icon: "pill", color: "#0d9488",
    description: "PCT requirements for pharmacy practice",
    regulations: [
      { id: "e1", name: "Pharmacist Registration Requirements", authority: "PCT", status: "COMPLIANT",
        beyuImplementation: "PCT licence # mandatory on every Rx · expiry tracked · renewal reminders" },
      { id: "e2", name: "Pharmacy Premises Registration Requirements", authority: "PCT", status: "COMPLIANT",
        beyuImplementation: "Tenant premises licence verified" },
      { id: "e3", name: "Good Pharmacy Practice (GPP)", authority: "PCT", status: "COMPLIANT",
        beyuImplementation: "GPP workflow embedded in dispensing module" },
      { id: "e4", name: "Pharmacy Inspection Standards", authority: "PCT", status: "COMPLIANT",
        beyuImplementation: "Inspection-ready audit log · narcotic register on demand" },
      { id: "e5", name: "Continuing Pharmacy Education (CPD)", authority: "PCT", status: "COMPLIANT",
        beyuImplementation: "CPD tracker per pharmacist · alerts at 80% of requirement" },
      { id: "e6", name: "Dispensing Standards", authority: "PCT", status: "COMPLIANT",
        beyuImplementation: "Counselling fields mandatory · barcode scanning · double-check for high-risk meds" },
      { id: "e7", name: "Controlled Medicines Requirements", authority: "PCT", status: "COMPLIANT",
        beyuImplementation: "Schedule II-V witnessed dispense · running balance · stock-take" },
      { id: "e8", name: "Prescription Management Standards", authority: "PCT", status: "COMPLIANT",
        beyuImplementation: "e-Rx with prescriber license, dose, route, frequency, indication" },
      { id: "e9", name: "Pharmacy Record-Keeping Requirements", authority: "PCT", status: "COMPLIANT",
        beyuImplementation: "Records retained 7 years · inspection-ready export" },
    ],
  },

  // ───── F. TMDA ─────
  {
    id: "tmda", letter: "F", title: "TMDA Compliance", icon: "shield", color: "#7c3aed",
    description: "Tanzania Medicines & Medical Devices Authority",
    regulations: [
      { id: "f1", name: "Medicines Registration Regulations", authority: "TMDA", status: "COMPLIANT",
        beyuImplementation: "Drug formulary synced with TMDA registry · unregistered items blocked" },
      { id: "f2", name: "Medical Devices Regulations", authority: "TMDA", status: "COMPLIANT",
        beyuImplementation: "Device registry · UDI tracking · class-based controls" },
      { id: "f3", name: "In Vitro Diagnostics Regulations", authority: "TMDA", status: "COMPLIANT",
        beyuImplementation: "IVD reagents tracked in LIS module · lot/expiry" },
      { id: "f4", name: "Pharmacovigilance Regulations", authority: "TMDA", status: "COMPLIANT",
        beyuImplementation: "Yellow-card ADR reporting integrated · auto-suggest from EMR signals" },
      { id: "f5", name: "Materiovigilance Requirements", authority: "TMDA", status: "COMPLIANT",
        beyuImplementation: "Device incident reporting workflow" },
      { id: "f6", name: "Recall Management Requirements", authority: "TMDA", status: "COMPLIANT",
        beyuImplementation: "Batch-level traceability · 1-click recall notification to all dispensed patients" },
      { id: "f7", name: "Post-Marketing Surveillance Requirements", authority: "TMDA", status: "COMPLIANT",
        beyuImplementation: "Anonymous outcome data feeds TMDA PMS pipeline" },
      { id: "f8", name: "Good Distribution Practice (GDP)", authority: "TMDA", status: "COMPLIANT",
        beyuImplementation: "Cold-chain monitoring · temperature logging" },
      { id: "f9", name: "Good Storage Practice (GSP)", authority: "TMDA", status: "COMPLIANT",
        beyuImplementation: "Storage condition validation · expiry monitoring" },
      { id: "f10", name: "Good Pharmacy Practice Alignment", authority: "TMDA", status: "COMPLIANT",
        beyuImplementation: "GPP module enforces TMDA requirements" },
      { id: "f11", name: "ADR Reporting Requirements", authority: "TMDA", status: "COMPLIANT",
        beyuImplementation: "Mandatory ADR form on suspected reaction · auto-submission to TMDA" },
    ],
  },

  // ───── G. MCT ─────
  {
    id: "mct", letter: "G", title: "Medical Council of Tanganyika", icon: "users", color: "#1E3A8A",
    description: "MCT licensure and ethics",
    regulations: [
      { id: "g1", name: "Practitioner Licensing Requirements", authority: "MCT", status: "COMPLIANT",
        beyuImplementation: "MCT licence # appears on every clinical action stamp" },
      { id: "g2", name: "Specialist Registration Requirements", authority: "MCT", status: "COMPLIANT",
        beyuImplementation: "Specialist scope respected for restricted procedures" },
      { id: "g3", name: "Medical Ethics Requirements", authority: "MCT", status: "COMPLIANT",
        beyuImplementation: "Ethics module · informed consent · conflict-of-interest declarations" },
      { id: "g4", name: "CPD Requirements", authority: "MCT", status: "COMPLIANT",
        beyuImplementation: "CPD log per practitioner · alerts at 80% of annual requirement" },
      { id: "g5", name: "Scope of Practice Requirements", authority: "MCT", status: "COMPLIANT",
        beyuImplementation: "RBAC enforces scope · actions outside scope are blocked" },
      { id: "g6", name: "Medical Records Standards", authority: "MCT", status: "COMPLIANT",
        beyuImplementation: "Records meet MCT standards · attestation & sign-off enforced" },
    ],
  },

  // ───── H. TNMC ─────
  {
    id: "tnmc", letter: "H", title: "Tanzania Nursing & Midwifery Council", icon: "users", color: "#0891b2",
    description: "Nursing and midwifery practice standards",
    regulations: [
      { id: "h1", name: "Nurse Registration Requirements", authority: "TNMC", status: "COMPLIANT",
        beyuImplementation: "TNMC licence validated · renewal tracking · expiry warnings" },
      { id: "h2", name: "Midwife Registration Requirements", authority: "TNMC", status: "COMPLIANT",
        beyuImplementation: "Midwife scope enforced for maternity workflows" },
      { id: "h3", name: "Nursing Documentation Standards", authority: "TNMC", status: "COMPLIANT",
        beyuImplementation: "Nursing-note templates · vitals capture · handover module" },
      { id: "h4", name: "CPD Requirements", authority: "TNMC", status: "COMPLIANT",
        beyuImplementation: "CPD log per nurse · annual cycle tracking" },
      { id: "h5", name: "Scope of Practice Requirements", authority: "TNMC", status: "COMPLIANT",
        beyuImplementation: "RBAC scoped by cadre · restricted actions blocked" },
    ],
  },

  // ───── I. LABORATORY ─────
  {
    id: "lab", letter: "I", title: "Laboratory Compliance", icon: "lab", color: "#7c3aed",
    description: "Laboratory quality & safety standards",
    regulations: [
      { id: "i1", name: "ISO 15189", authority: "ISO", status: "COMPLIANT",
        beyuImplementation: "QMS aligned to ISO 15189 · QC/EQA tracked · audit-ready" },
      { id: "i2", name: "National Laboratory Guidelines", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "MoH lab guidelines followed" },
      { id: "i3", name: "External Quality Assessment (EQA)", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "EQA proficiency runs tracked · failed runs trigger review" },
      { id: "i4", name: "Internal Quality Control (IQC)", authority: "ISO", status: "COMPLIANT",
        beyuImplementation: "Daily QC with Westgard rules · Levey-Jennings charts" },
      { id: "i5", name: "Specimen Tracking", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Barcoded chain-of-custody from collection to result release" },
      { id: "i6", name: "Equipment Calibration", authority: "ISO", status: "COMPLIANT",
        beyuImplementation: "Calibration schedule tracked in Asset Mgmt · alerts on overdue" },
      { id: "i7", name: "Laboratory Safety Standards", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "PPE tracking · incident reporting · biosafety procedures" },
      { id: "i8", name: "Biosafety Guidelines", authority: "WHO", status: "COMPLIANT",
        beyuImplementation: "Biosafety level enforced per specimen type · waste manifest" },
    ],
  },

  // ───── J. RADIOLOGY ─────
  {
    id: "rad", letter: "J", title: "Radiology Compliance", icon: "monitor", color: "#1E3A8A",
    description: "Radiation safety and imaging standards",
    regulations: [
      { id: "j1", name: "Radiation Protection Regulations", authority: "TAEC", status: "COMPLIANT",
        beyuImplementation: "TAEC licensing tracked · radiation safety officer assigned per facility" },
      { id: "j2", name: "DICOM Standards", authority: "ISO", status: "COMPLIANT",
        beyuImplementation: "Full DICOM 3.x conformance · modality worklist · structured reporting" },
      { id: "j3", name: "Imaging Record Retention", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Image retention 10 years · WORM storage · audit-ready" },
      { id: "j4", name: "Equipment Calibration Standards", authority: "TAEC", status: "COMPLIANT",
        beyuImplementation: "QA schedule per modality · calibration log per machine" },
      { id: "j5", name: "Radiation Exposure Monitoring", authority: "TAEC", status: "COMPLIANT",
        beyuImplementation: "Patient dose tracking per study · cumulative dose alerts · staff badge readings" },
      { id: "j6", name: "Radiology Reporting Standards", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Structured reports · double-read peer review · turnaround KPI" },
    ],
  },

  // ───── K. DIALYSIS ─────
  {
    id: "dialysis", letter: "K", title: "Dialysis Compliance", icon: "heart", color: "#be123c",
    description: "Renal care standards",
    regulations: [
      { id: "k1", name: "Renal Care Guidelines", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "KDIGO-aligned protocols · Kt/V & URR auto-calculated" },
      { id: "k2", name: "Dialysis Safety Standards", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Hep-positive isolation chairs · safety alarms · machine event log" },
      { id: "k3", name: "Water Quality Standards (AAMI)", authority: "ISO", status: "COMPLIANT",
        beyuImplementation: "AAMI water-quality testing log · monthly endotoxin & culture" },
      { id: "k4", name: "Infection Prevention Standards", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Hepatitis B/C + HIV screening · isolation protocols" },
      { id: "k5", name: "Dialysis Equipment Maintenance", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Bicarbonate disinfection log · PPM schedule · QA per machine" },
    ],
  },

  // ───── L. OPTOMETRY ─────
  {
    id: "optometry", letter: "L", title: "Optical & Optometry", icon: "scan", color: "#b45309",
    description: "Eye care and optical dispensing standards",
    regulations: [
      { id: "l1", name: "Optometry Practice Standards", authority: "MCT", status: "COMPLIANT",
        beyuImplementation: "Optometry suite with refraction, OCT, visual fields, tonometry, fundus" },
      { id: "l2", name: "Ophthalmic Record Standards", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Structured ophthalmic records · imaging linked" },
      { id: "l3", name: "Optical Dispensing Standards", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Frames + lenses + glazing workflow · prescription validation" },
      { id: "l4", name: "Contact Lens Practice Standards", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "CL fitting records · trial-period reviews · safety counselling" },
      { id: "l5", name: "Medical Device Tracking", authority: "TMDA", status: "COMPLIANT",
        beyuImplementation: "Frames + lens serial tracking · UDI" },
    ],
  },

  // ───── M. INSURANCE & CLAIMS ─────
  {
    id: "insurance", letter: "M", title: "Insurance & Claims", icon: "shield", color: "#D4AF37",
    description: "Insurance regulatory requirements",
    regulations: [
      { id: "m1", name: "NHIF Claims Rules", authority: "NHIF", status: "COMPLIANT",
        beyuImplementation: "Real-time eligibility · automated claim build · denial-prediction AI" },
      { id: "m2", name: "NHIF Accreditation", authority: "NHIF", status: "COMPLIANT",
        beyuImplementation: "Tenant accreditation status tracked" },
      { id: "m3", name: "Insurance Regulatory Authority Requirements", authority: "BoT", status: "COMPLIANT",
        beyuImplementation: "Compliant with TIRA insurance reporting" },
      { id: "m4", name: "Private Insurance Claim Standards", authority: "Multi", status: "COMPLIANT",
        beyuImplementation: "Jubilee, AAR, Strategis claim formats supported" },
      { id: "m5", name: "Fraud Prevention Requirements", authority: "Multi", status: "COMPLIANT",
        beyuImplementation: "AI fraud detection · duplicate-claim blocking · biometric verification" },
    ],
  },

  // ───── N. PUBLIC HEALTH ─────
  {
    id: "ph", letter: "N", title: "Public Health Compliance", icon: "globe", color: "#dc2626",
    description: "Public health surveillance and reporting",
    regulations: [
      { id: "p1", name: "Notifiable Disease Reporting", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Auto-detection of 28 notifiable conditions · IDSR push" },
      { id: "p2", name: "Disease Surveillance Guidelines", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Sentinel surveillance · cluster detection AI" },
      { id: "p3", name: "HIV Program Reporting", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "ART register · MTUHA HIV forms · NACP reporting" },
      { id: "p4", name: "TB Program Reporting", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "DOTS register · NTLP reporting" },
      { id: "p5", name: "Malaria Program Reporting", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Malaria surveillance · NMCP indicators" },
      { id: "p6", name: "Immunization Program Reporting", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "EPI tracker · IVAC integration" },
      { id: "p7", name: "Maternal Death Surveillance", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Maternal death notification · review workflow" },
      { id: "p8", name: "Perinatal Death Surveillance", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Perinatal death surveillance · MDSR-aligned" },
    ],
  },

  // ───── O. INFOSEC ─────
  {
    id: "infosec", letter: "O", title: "Information Security & Privacy", icon: "lock", color: "#7c3aed",
    description: "ISO standards for info security & health information",
    regulations: [
      { id: "o1", name: "ISO 27001 (ISMS)", authority: "ISO", status: "COMPLIANT",
        beyuImplementation: "ISMS certified · annual surveillance audit" },
      { id: "o2", name: "ISO 27002", authority: "ISO", status: "COMPLIANT",
        beyuImplementation: "Control objectives implemented platform-wide" },
      { id: "o3", name: "ISO 27799 (Health Info Mgmt)", authority: "ISO", status: "COMPLIANT",
        beyuImplementation: "Health-specific controls applied to all PHI" },
      { id: "o4", name: "ISO 27017 (Cloud)", authority: "ISO", status: "COMPLIANT",
        beyuImplementation: "Cloud-specific controls for AWS EKS deployments" },
      { id: "o5", name: "ISO 27018 (PII in Cloud)", authority: "ISO", status: "COMPLIANT",
        beyuImplementation: "PII protections in cloud · GDPR & DPA-aligned" },
      { id: "o6", name: "Patient Consent Requirements", authority: "PDPC", status: "COMPLIANT",
        beyuImplementation: "BeyuConsent.sol records every consent on-chain · revocable" },
      { id: "o7", name: "Health Information Confidentiality", authority: "PDPC", status: "COMPLIANT",
        beyuImplementation: "Field-level AES-256 · row-level tenant isolation · need-to-know access" },
      { id: "o8", name: "Audit Logging Requirements", authority: "ISO", status: "COMPLIANT",
        beyuImplementation: "Every transaction auto-stamped (this module) · 7-year immutable retention" },
      { id: "o9", name: "Backup & Disaster Recovery", authority: "ISO", status: "COMPLIANT",
        beyuImplementation: "RPO < 15 min · RTO < 4 hours · multi-region · chaos tested" },
    ],
  },

  // ───── P. INTEROPERABILITY ─────
  {
    id: "interop", letter: "P", title: "Digital Health Interoperability", icon: "globe", color: "#0891b2",
    description: "Standards for data exchange",
    regulations: [
      { id: "ip1", name: "HL7 v2", authority: "ISO", status: "COMPLIANT", beyuImplementation: "HL7 v2.x ADT, ORM, ORU, MDM message handlers" },
      { id: "ip2", name: "HL7 FHIR R4/R5", authority: "ISO", status: "COMPLIANT", beyuImplementation: "Native FHIR R5 API · R4 backward compat" },
      { id: "ip3", name: "DICOM", authority: "ISO", status: "COMPLIANT", beyuImplementation: "Full DICOM 3.x conformance" },
      { id: "ip4", name: "ICD-10", authority: "WHO", status: "COMPLIANT", beyuImplementation: "ICD-10 supported for legacy reporting" },
      { id: "ip5", name: "ICD-11", authority: "WHO", status: "COMPLIANT", beyuImplementation: "ICD-11 native · Coding AI suggests codes" },
      { id: "ip6", name: "SNOMED CT", authority: "ISO", status: "COMPLIANT", beyuImplementation: "SNOMED CT terminology service" },
      { id: "ip7", name: "LOINC", authority: "ISO", status: "COMPLIANT", beyuImplementation: "LOINC codes for all lab tests" },
      { id: "ip8", name: "National HIE Standards", authority: "MoH", status: "COMPLIANT", beyuImplementation: "Aligned to Tanzania HIE blueprint" },
    ],
  },

  // ───── Q. QUALITY & ACCREDITATION ─────
  {
    id: "quality", letter: "Q", title: "Quality & Accreditation", icon: "star", color: "#D4AF37",
    description: "Clinical quality & patient safety",
    regulations: [
      { id: "q1", name: "Joint Commission Principles", authority: "ISO", status: "COMPLIANT", beyuImplementation: "JCI-aligned International Patient Safety Goals embedded" },
      { id: "q2", name: "Quality Improvement Standards", authority: "MoH", status: "COMPLIANT", beyuImplementation: "PDSA cycles · clinical audit module" },
      { id: "q3", name: "Clinical Governance Standards", authority: "MoH", status: "COMPLIANT", beyuImplementation: "Clinical governance committee dashboards" },
      { id: "q4", name: "Risk Management Standards", authority: "ISO", status: "COMPLIANT", beyuImplementation: "Enterprise risk register · CRO dashboards" },
      { id: "q5", name: "Patient Safety Standards", authority: "WHO", status: "COMPLIANT", beyuImplementation: "WHO Patient Safety Solutions implemented" },
      { id: "q6", name: "Incident Reporting Standards", authority: "MoH", status: "COMPLIANT", beyuImplementation: "Anonymous incident reporting · root-cause analysis" },
      { id: "q7", name: "Mortality & Morbidity Review", authority: "MoH", status: "COMPLIANT", beyuImplementation: "M&M review module · monthly committee" },
    ],
  },

  // ───── R. AI GOVERNANCE ─────
  {
    id: "ai-gov", letter: "R", title: "AI Governance", icon: "brain", color: "#7c3aed",
    description: "Hive AI clinical decision support governance",
    regulations: [
      { id: "r1", name: "AI Clinical Decision Support Governance", authority: "Multi", status: "COMPLIANT", beyuImplementation: "Hive Runtime governance policies · CMO sign-off" },
      { id: "r2", name: "Human Oversight Requirements", authority: "Multi", status: "COMPLIANT", beyuImplementation: "Human-in-the-loop for all clinical actions · override always available" },
      { id: "r3", name: "Explainability Requirements", authority: "Multi", status: "COMPLIANT", beyuImplementation: "Every AI suggestion includes confidence score + source attribution" },
      { id: "r4", name: "AI Audit Trails", authority: "Multi", status: "COMPLIANT", beyuImplementation: "Every AI decision auto-stamped (see Transactions tab)" },
      { id: "r5", name: "AI Risk Management Framework", authority: "Multi", status: "COMPLIANT", beyuImplementation: "Risk-based agent classification · kill-switch · throttling" },
      { id: "r6", name: "Model Validation Requirements", authority: "Multi", status: "COMPLIANT", beyuImplementation: "14-day sandbox validation · A/B testing · drift monitoring" },
      { id: "r7", name: "Clinical Safety Assurance Requirements", authority: "Multi", status: "COMPLIANT", beyuImplementation: "DCB 0129 / DCB 0160-aligned clinical safety case for every agent" },
    ],
  },

  // ───── S. FINANCIAL ─────
  {
    id: "fin", letter: "S", title: "Financial & Payment Compliance", icon: "cash", color: "#0d9488",
    description: "Payment and financial compliance",
    regulations: [
      { id: "s1", name: "PCI-DSS", authority: "ISO", status: "COMPLIANT", beyuImplementation: "PCI-DSS Level 1 compliance for card payments · tokenized PANs" },
      { id: "s2", name: "Bank of Tanzania Digital Payment Requirements", authority: "BoT", status: "COMPLIANT", beyuImplementation: "BoT-licensed PSP partnerships · transaction reporting" },
      { id: "s3", name: "Mobile Money Integration Requirements", authority: "BoT", status: "COMPLIANT", beyuImplementation: "M-Pesa · Tigo Pesa · Airtel Money · BoT-compliant settlement" },
      { id: "s4", name: "Financial Audit Standards", authority: "Multi", status: "COMPLIANT", beyuImplementation: "GL + audit trail · external audit-ready · IFRS-aligned" },
      { id: "s5", name: "Revenue Cycle Audit Requirements", authority: "NHIF", status: "COMPLIANT", beyuImplementation: "End-to-end RCM audit trail · denial pattern analysis" },
    ],
  },

  // ───── T. RECORDS & LEGAL EVIDENCE ─────
  {
    id: "records", letter: "T", title: "Records & Legal Evidence", icon: "doc", color: "#0B1D3A",
    description: "Records management and legal admissibility",
    regulations: [
      { id: "t1", name: "EMR Retention Requirements", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Adult records: 10 years from last encounter. Paediatric: 25 years. Permanent: oncology, mental health" },
      { id: "t2", name: "Electronic Signature Requirements", authority: "TCRA", status: "COMPLIANT",
        beyuImplementation: "Cryptographic signatures · biometric MFA · chain-anchored proof" },
      { id: "t3", name: "Legal Hold Requirements", authority: "Multi", status: "COMPLIANT",
        beyuImplementation: "Legal-hold workflow · prevents deletion of subject records" },
      { id: "t4", name: "Medical Records Management Standards", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "HIM module · ROI workflow · ICD coding" },
      { id: "t5", name: "Document Archiving Standards", authority: "ISO", status: "COMPLIANT",
        beyuImplementation: "WORM storage · checksums · long-term archive" },
      { id: "t6", name: "Digital Evidence Admissibility", authority: "MoH", status: "COMPLIANT",
        beyuImplementation: "Chain-of-custody preserved · cryptographic proof · expert-witness ready" },
    ],
  },
];

/* ─────────────────────────── KPIs ─────────────────────────── */

export const COMPLIANCE_KPIS = (() => {
  const allReg = COMPLIANCE_PACK.flatMap(s => s.regulations);
  return {
    sections: COMPLIANCE_PACK.length,
    totalRegs: allReg.length,
    compliant: allReg.filter(r => r.status === "COMPLIANT").length,
    partial: allReg.filter(r => r.status === "PARTIAL").length,
    inProgress: allReg.filter(r => r.status === "IN-PROGRESS").length,
    pct: Math.round((allReg.filter(r => r.status === "COMPLIANT").length / allReg.length) * 100),
    transactionsToday: 48712,
    transactionsAnchored: 32184,
    auditEventsThisMonth: 1248000,
  };
})();
