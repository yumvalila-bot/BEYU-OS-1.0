// ─────────────────────────────────────────────────────────────────────────────
// Standalone Healthcare Business Coverage Registry
// Tests whether BEYU Health OS can run as a complete platform for
// independent healthcare businesses (not embedded inside a hospital).
// ─────────────────────────────────────────────────────────────────────────────

export type BizStatus = "FULL" | "PARTIAL" | "ROADMAP";

export interface Capability {
  id: string;
  name: string;
  category: string;
  status: BizStatus;
  module: string;
  notes?: string;
}

export interface StandaloneBusiness {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  icon: string;
  color: string;
  /** Real-world TZ examples */
  examples: string[];
  /** Estimated number of active tenants of this type */
  activeTenants: number;
  /** Typical staff size */
  typicalSize: string;
  /** Regulator(s) */
  regulators: string[];
  capabilities: Capability[];
}

/* ─────────────────────────── 1. STANDALONE PHARMACY ─────────────────────────── */
const pharmacyCaps: Capability[] = [
  // Retail & POS
  { id: "p1", category: "Retail & POS", name: "Walk-in customer POS", module: "Pharmacy POS", status: "FULL" },
  { id: "p2", category: "Retail & POS", name: "Barcode scanning + receipt printer", module: "Pharmacy POS", status: "FULL" },
  { id: "p3", category: "Retail & POS", name: "M-Pesa, Tigo Pesa, cash & card payments", module: "Health Wallet", status: "FULL" },
  { id: "p4", category: "Retail & POS", name: "Multiple counters / cashier shifts", module: "Pharmacy POS", status: "FULL" },
  { id: "p5", category: "Retail & POS", name: "End-of-day cash reconciliation (Z-report)", module: "Finance", status: "FULL" },
  { id: "p6", category: "Retail & POS", name: "EFD / VFD tax-device integration", module: "Finance · TRA", status: "FULL" },

  // Prescription handling
  { id: "p10", category: "Prescriptions", name: "Accept e-prescriptions from any BEYU hospital", module: "Pharmacy", status: "FULL" },
  { id: "p11", category: "Prescriptions", name: "Manual paper Rx entry with image upload", module: "Pharmacy", status: "FULL" },
  { id: "p12", category: "Prescriptions", name: "Drug interaction check (Pharmacy AI)", module: "Pharmacy AI", status: "FULL" },
  { id: "p13", category: "Prescriptions", name: "Allergy / contraindication alerts", module: "Pharmacy AI", status: "FULL" },
  { id: "p14", category: "Prescriptions", name: "Controlled substance witnessed dispense + register", module: "Pharmacy", status: "FULL" },
  { id: "p15", category: "Prescriptions", name: "Refill management + reminders to customer", module: "Citizen App", status: "FULL" },

  // Inventory & supply
  { id: "p20", category: "Inventory", name: "Multi-batch / multi-expiry tracking (FEFO)", module: "Inventory", status: "FULL" },
  { id: "p21", category: "Inventory", name: "Auto-reorder triggers + supplier PO", module: "Procurement", status: "FULL" },
  { id: "p22", category: "Inventory", name: "Cold-chain monitoring (temp logging)", module: "Inventory", status: "FULL" },
  { id: "p23", category: "Inventory", name: "Narcotic register (TFDA Schedule II–V)", module: "Pharmacy", status: "FULL" },
  { id: "p24", category: "Inventory", name: "Inter-branch stock transfer", module: "Inventory", status: "FULL" },
  { id: "p25", category: "Inventory", name: "Stock-take with handheld scanner", module: "Inventory", status: "FULL" },

  // Customer management
  { id: "p30", category: "Customer", name: "Loyalty programme + points", module: "CRM", status: "PARTIAL", notes: "Loyalty engine ships v2026.7" },
  { id: "p31", category: "Customer", name: "Customer profile + purchase history", module: "CRM", status: "FULL" },
  { id: "p32", category: "Customer", name: "SMS reminders for chronic meds", module: "Citizen App", status: "FULL" },
  { id: "p33", category: "Customer", name: "Home delivery + courier integration", module: "Logistics", status: "FULL" },
  { id: "p34", category: "Customer", name: "Online ordering portal", module: "Citizen App", status: "FULL" },

  // Insurance
  { id: "p40", category: "Insurance", name: "NHIF real-time eligibility check", module: "NHIF Integration", status: "FULL" },
  { id: "p41", category: "Insurance", name: "NHIF claim submission + reconciliation", module: "Claims", status: "FULL" },
  { id: "p42", category: "Insurance", name: "Private insurer (Jubilee, AAR, Strategis)", module: "Claims", status: "FULL" },
  { id: "p43", category: "Insurance", name: "Co-pay calculation + receipt", module: "Billing", status: "FULL" },

  // Multi-branch / Chain
  { id: "p50", category: "Multi-Branch", name: "Multi-branch tenant model (chain ops)", module: "Tenant Isolation", status: "FULL" },
  { id: "p51", category: "Multi-Branch", name: "Centralized buying + branch-level selling", module: "Procurement", status: "FULL" },
  { id: "p52", category: "Multi-Branch", name: "Branch-vs-branch performance dashboards", module: "Analytics", status: "FULL" },
  { id: "p53", category: "Multi-Branch", name: "Group-level loyalty across branches", module: "CRM", status: "PARTIAL", notes: "Group loyalty syncs after v2026.7" },

  // Compliance
  { id: "p60", category: "Compliance", name: "Pharmacy Council of Tanzania (PCT) licence tracking", module: "HR Service", status: "FULL" },
  { id: "p61", category: "Compliance", name: "TFDA inspection-ready audit log", module: "Audit & SIEM", status: "FULL" },
  { id: "p62", category: "Compliance", name: "Continuing Pharmacy Education (CPE) tracker", module: "HR Service", status: "FULL" },
];

/* ─────────────────────────── 2. STANDALONE LABORATORY ─────────────────────────── */
const labCaps: Capability[] = [
  { id: "l1", category: "Reception", name: "Walk-in client registration", module: "Patient Reg", status: "FULL" },
  { id: "l2", category: "Reception", name: "Test catalogue + price list display", module: "LIS", status: "FULL" },
  { id: "l3", category: "Reception", name: "Online test booking (Citizen App)", module: "Citizen App", status: "FULL" },
  { id: "l4", category: "Reception", name: "Walk-in cash receipt + EFD print", module: "Billing", status: "FULL" },

  { id: "l10", category: "Specimen", name: "Barcoded specimen label printing", module: "LIS", status: "FULL" },
  { id: "l11", category: "Specimen", name: "Phlebotomy queue management", module: "LIS", status: "FULL" },
  { id: "l12", category: "Specimen", name: "Specimen routing + chain of custody", module: "LIS", status: "FULL" },
  { id: "l13", category: "Specimen", name: "External referral (send-out to ref lab)", module: "LIS", status: "FULL" },
  { id: "l14", category: "Specimen", name: "Home / corporate sample collection", module: "Logistics", status: "FULL" },

  { id: "l20", category: "Analyzer", name: "Bi-directional analyzer interfacing (HL7)", module: "LIS", status: "FULL" },
  { id: "l21", category: "Analyzer", name: "Auto-validation rules + auto-release", module: "LIS", status: "FULL" },
  { id: "l22", category: "Analyzer", name: "Critical value flagging + call-back log", module: "LIS", status: "FULL" },

  { id: "l30", category: "Quality", name: "QC runs · Westgard rules", module: "LIS", status: "FULL" },
  { id: "l31", category: "Quality", name: "Levey-Jennings charts", module: "LIS", status: "FULL" },
  { id: "l32", category: "Quality", name: "EQA / proficiency tracking", module: "LIS", status: "FULL" },
  { id: "l33", category: "Quality", name: "ISO 15189 audit-ready logs", module: "Audit & SIEM", status: "FULL" },

  { id: "l40", category: "Reports", name: "PDF report with logo + signatory", module: "LIS", status: "FULL" },
  { id: "l41", category: "Reports", name: "Result delivery via SMS / email / app", module: "Citizen App", status: "FULL" },
  { id: "l42", category: "Reports", name: "B2B referring-doctor portal", module: "Clinical App", status: "FULL" },
  { id: "l43", category: "Reports", name: "Cumulative report (trending values)", module: "LIS", status: "FULL" },

  { id: "l50", category: "Business", name: "Corporate accounts (companies, NGOs)", module: "Billing", status: "FULL" },
  { id: "l51", category: "Business", name: "Mobile clinic / outreach campaigns", module: "Operations", status: "FULL" },
  { id: "l52", category: "Business", name: "Insurance pre-authorization", module: "Claims", status: "FULL" },
  { id: "l53", category: "Business", name: "NHIF claims for laboratory services", module: "NHIF Integration", status: "FULL" },
  { id: "l54", category: "Business", name: "Branch network management", module: "Tenant Isolation", status: "FULL" },

  { id: "l60", category: "Compliance", name: "HLB (Health Laboratory Board) licensing", module: "HR Service", status: "FULL" },
  { id: "l61", category: "Compliance", name: "Biohazard waste log + manifest", module: "Inventory", status: "FULL" },
  { id: "l62", category: "Compliance", name: "Reagent expiry + lot traceability", module: "Inventory", status: "FULL" },
];

/* ─────────────────────────── 3. STANDALONE RADIOLOGY CENTRE ─────────────────────────── */
const radCaps: Capability[] = [
  { id: "r1", category: "Reception", name: "Walk-in + referred patient registration", module: "Patient Reg", status: "FULL" },
  { id: "r2", category: "Reception", name: "Modality scheduling (X-Ray, US, CT, MRI, Mammo)", module: "RIS", status: "FULL" },
  { id: "r3", category: "Reception", name: "Online appointment booking", module: "Citizen App", status: "FULL" },
  { id: "r4", category: "Reception", name: "Pre-exam safety screening (MRI, contrast)", module: "RIS", status: "FULL" },

  { id: "r10", category: "Acquisition", name: "DICOM modality worklist (MWL)", module: "RIS", status: "FULL" },
  { id: "r11", category: "Acquisition", name: "PACS archive + retrieval", module: "PACS", status: "FULL" },
  { id: "r12", category: "Acquisition", name: "Patient dose tracking (CT, fluoro)", module: "RIS", status: "FULL" },
  { id: "r13", category: "Acquisition", name: "Contrast reaction log", module: "EMR", status: "FULL" },

  { id: "r20", category: "Reporting", name: "Web DICOM viewer (zoom, W/L, MPR)", module: "PACS", status: "FULL" },
  { id: "r21", category: "Reporting", name: "Structured reporting templates", module: "RIS", status: "FULL" },
  { id: "r22", category: "Reporting", name: "Voice dictation (Ambient AI)", module: "Voice AI", status: "FULL" },
  { id: "r23", category: "Reporting", name: "AI triage (CXR pneumonia, CT bleed, fracture)", module: "Radiology AI", status: "FULL" },
  { id: "r24", category: "Reporting", name: "Tele-radiology · remote reading", module: "PACS", status: "FULL" },
  { id: "r25", category: "Reporting", name: "Double-read peer review", module: "RIS", status: "FULL" },

  { id: "r30", category: "Distribution", name: "Patient portal image + report download", module: "Citizen App", status: "FULL" },
  { id: "r31", category: "Distribution", name: "Referring physician portal", module: "Clinical App", status: "FULL" },
  { id: "r32", category: "Distribution", name: "DICOM CD / USB burning (legacy)", module: "PACS", status: "FULL" },
  { id: "r33", category: "Distribution", name: "Cloud share link with expiry", module: "PACS", status: "FULL" },

  { id: "r40", category: "Business", name: "B2B contracts with hospitals & insurers", module: "Billing", status: "FULL" },
  { id: "r41", category: "Business", name: "Per-modality pricing matrix", module: "Billing", status: "FULL" },
  { id: "r42", category: "Business", name: "NHIF + private insurance claims", module: "Claims", status: "FULL" },
  { id: "r43", category: "Business", name: "Mobile mammography unit support", module: "Operations", status: "PARTIAL", notes: "Mobile-unit kit ships v2026.8" },

  { id: "r50", category: "Compliance", name: "Radiation safety officer tracking", module: "HR Service", status: "FULL" },
  { id: "r51", category: "Compliance", name: "TAEC (Tanzania Atomic Energy Commission) licensing", module: "Vault", status: "FULL" },
  { id: "r52", category: "Compliance", name: "Equipment QA + calibration register", module: "Asset Mgmt", status: "FULL" },
];

/* ─────────────────────────── 4. OPTICAL SHOP + EYE CLINIC ─────────────────────────── */
const opticalCaps: Capability[] = [
  { id: "o1", category: "Reception", name: "Walk-in customer registration", module: "Patient Reg", status: "FULL" },
  { id: "o2", category: "Reception", name: "Eye exam appointment scheduling", module: "Appointments", status: "FULL" },
  { id: "o3", category: "Reception", name: "Insurance verification at intake", module: "NHIF Integration", status: "FULL" },

  { id: "o10", category: "Optometry", name: "Refraction (sphere · cylinder · axis · add)", module: "Optometry Suite", status: "FULL" },
  { id: "o11", category: "Optometry", name: "OCT (Optical Coherence Tomography)", module: "Optometry Suite", status: "FULL" },
  { id: "o12", category: "Optometry", name: "Visual fields perimetry", module: "Optometry Suite", status: "FULL" },
  { id: "o13", category: "Optometry", name: "Tonometry (IOP) — glaucoma screen", module: "Optometry Suite", status: "FULL" },
  { id: "o14", category: "Optometry", name: "Fundus imaging + AI grading (diabetic retinopathy)", module: "Optometry Suite", status: "FULL" },
  { id: "o15", category: "Optometry", name: "Colour vision + slit-lamp findings", module: "Optometry Suite", status: "FULL" },
  { id: "o16", category: "Optometry", name: "Contact lens fitting record", module: "Optometry Suite", status: "FULL" },

  { id: "o20", category: "Optical Shop", name: "Frames catalogue with photos + brand", module: "Optical Shop", status: "FULL" },
  { id: "o21", category: "Optical Shop", name: "Lens options (single vision, bifocal, progressive)", module: "Optical Shop", status: "FULL" },
  { id: "o22", category: "Optical Shop", name: "Lens coatings & tints config", module: "Optical Shop", status: "FULL" },
  { id: "o23", category: "Optical Shop", name: "Prescription glazing workflow", module: "Optical Shop", status: "FULL" },
  { id: "o24", category: "Optical Shop", name: "Try-on photo capture", module: "Optical Shop", status: "PARTIAL", notes: "AR virtual try-on in v2026.9" },
  { id: "o25", category: "Optical Shop", name: "POS + EFD receipt", module: "Pharmacy POS", status: "FULL" },
  { id: "o26", category: "Optical Shop", name: "Lab order to external glazing lab", module: "Optical Shop", status: "FULL" },

  { id: "o30", category: "Sales", name: "Spectacle ready-for-pickup notifications", module: "Citizen App", status: "FULL" },
  { id: "o31", category: "Sales", name: "Layaway / instalment plans", module: "Billing", status: "FULL" },
  { id: "o32", category: "Sales", name: "Warranty registration + claim handling", module: "Optical Shop", status: "FULL" },
  { id: "o33", category: "Sales", name: "Recall every 12 months (eye check)", module: "Citizen App", status: "FULL" },

  { id: "o40", category: "Business", name: "Multi-branch chain operations", module: "Tenant Isolation", status: "FULL" },
  { id: "o41", category: "Business", name: "NHIF eyewear benefit processing", module: "NHIF Integration", status: "FULL" },
  { id: "o42", category: "Business", name: "School / corporate eye-screening campaigns", module: "Operations", status: "FULL" },
  { id: "o43", category: "Business", name: "Optometry referral to ophthalmology", module: "Clinical App", status: "FULL" },

  { id: "o50", category: "Compliance", name: "Optometrist registration tracking (MCT)", module: "HR Service", status: "FULL" },
  { id: "o51", category: "Compliance", name: "Frames inventory + serial tracking", module: "Inventory", status: "FULL" },
];

/* ─────────────────────────── 5. STANDALONE DIALYSIS CLINIC ─────────────────────────── */
const dialysisCaps: Capability[] = [
  { id: "d1", category: "Patient", name: "Chronic patient enrolment + dialysis ID", module: "Patient Reg", status: "FULL" },
  { id: "d2", category: "Patient", name: "Pre-dialysis assessment & weight", module: "EMR", status: "FULL" },
  { id: "d3", category: "Patient", name: "Vascular access record (AVF, AVG, CVC)", module: "EMR", status: "FULL" },
  { id: "d4", category: "Patient", name: "Hepatitis B/C + HIV serology tracking", module: "LIS", status: "FULL" },

  { id: "d10", category: "Scheduling", name: "Chair / machine roster (3 shifts × 4 days)", module: "Appointments", status: "FULL" },
  { id: "d11", category: "Scheduling", name: "Auto-recurrence (MWF / TTS patterns)", module: "Appointments", status: "FULL" },
  { id: "d12", category: "Scheduling", name: "Hep-positive isolation chair allocation", module: "Appointments", status: "FULL" },
  { id: "d13", category: "Scheduling", name: "No-show & cancellation tracking", module: "Appointments", status: "FULL" },

  { id: "d20", category: "Session", name: "HD session record (UF, flow, blood pressure)", module: "EMR · Dialysis", status: "FULL" },
  { id: "d21", category: "Session", name: "Pre · intra · post-dialysis observations", module: "EMR · Dialysis", status: "FULL" },
  { id: "d22", category: "Session", name: "Anticoagulation protocol (heparin / citrate)", module: "EMR · Dialysis", status: "FULL" },
  { id: "d23", category: "Session", name: "Kt/V & URR calculations", module: "EMR · Dialysis", status: "FULL" },
  { id: "d24", category: "Session", name: "Dialyser reuse log + reprocessing", module: "Inventory", status: "FULL" },
  { id: "d25", category: "Session", name: "Machine alarm / event log", module: "Asset Mgmt", status: "FULL" },
  { id: "d26", category: "Session", name: "Peritoneal dialysis (CAPD) recording", module: "EMR · Dialysis", status: "FULL" },

  { id: "d30", category: "Outcomes", name: "Monthly bloods (Hb, K, Ca, PO4, PTH)", module: "LIS", status: "FULL" },
  { id: "d31", category: "Outcomes", name: "Dry weight & BP trend charts", module: "EMR", status: "FULL" },
  { id: "d32", category: "Outcomes", name: "Hospitalisation / mortality tracking", module: "Analytics", status: "FULL" },
  { id: "d33", category: "Outcomes", name: "Renal transplant referral workflow", module: "Clinical App", status: "FULL" },

  { id: "d40", category: "Business", name: "NHIF dialysis package billing (per session)", module: "NHIF Integration", status: "FULL" },
  { id: "d41", category: "Business", name: "Private insurer dialysis programme support", module: "Claims", status: "FULL" },
  { id: "d42", category: "Business", name: "Per-session vs monthly-cap billing models", module: "Billing", status: "FULL" },
  { id: "d43", category: "Business", name: "EPO + ESA dispensing per session", module: "Pharmacy", status: "FULL" },
  { id: "d44", category: "Business", name: "Patient transport coordination", module: "Logistics", status: "PARTIAL", notes: "Transport dispatch v2026.8" },

  { id: "d50", category: "Compliance", name: "Nephrologist + dialysis nurse credentials", module: "HR Service", status: "FULL" },
  { id: "d51", category: "Compliance", name: "Water-quality testing log (AAMI)", module: "Inventory", status: "FULL" },
  { id: "d52", category: "Compliance", name: "Machine PPM + bicarbonate disinfection log", module: "Asset Mgmt", status: "FULL" },
  { id: "d53", category: "Compliance", name: "Renal registry reporting", module: "Reports", status: "FULL" },
];

export const STANDALONE_BUSINESSES: StandaloneBusiness[] = [
  {
    id: "pharmacy", shortName: "Pharmacy", name: "Standalone Retail Pharmacy",
    tagline: "From single-counter chemist to nationwide chain",
    icon: "pill", color: "#0d9488",
    examples: ["MedPlus", "Pharmacy Plus", "Shoppers", "single-owner chemists"],
    activeTenants: 184, typicalSize: "3 — 40 staff",
    regulators: ["PCT (Pharmacy Council of Tanzania)", "TFDA / TMDA"],
    capabilities: pharmacyCaps,
  },
  {
    id: "lab", shortName: "Laboratory", name: "Standalone Medical Laboratory",
    tagline: "Independent labs serving hospitals, clinics & walk-ins",
    icon: "lab", color: "#7c3aed",
    examples: ["Lancet Laboratories", "Pathcare", "specialty molecular labs"],
    activeTenants: 92, typicalSize: "8 — 80 staff",
    regulators: ["HLB (Health Laboratory Board)", "ISO 15189"],
    capabilities: labCaps,
  },
  {
    id: "radiology", shortName: "Radiology", name: "Standalone Imaging / Radiology Centre",
    tagline: "Diagnostic imaging as a standalone business",
    icon: "monitor", color: "#1E3A8A",
    examples: ["X-Ray & ultrasound clinics", "CT/MRI centres", "mammography units"],
    activeTenants: 38, typicalSize: "6 — 30 staff",
    regulators: ["TAEC (Atomic Energy)", "MCT (radiologists)"],
    capabilities: radCaps,
  },
  {
    id: "optical", shortName: "Optical Shop", name: "Optical Shop + Eye Clinic",
    tagline: "Eye exams, frames, lenses & contact lenses",
    icon: "scan", color: "#b45309",
    examples: ["OptiPlus", "Vision Specialists", "independent opticians"],
    activeTenants: 56, typicalSize: "4 — 25 staff",
    regulators: ["MCT (optometrists)", "Council of Allied Health"],
    capabilities: opticalCaps,
  },
  {
    id: "dialysis", shortName: "Dialysis Centre", name: "Standalone Dialysis Clinic",
    tagline: "Chronic renal care & dialysis as a business",
    icon: "heart", color: "#be123c",
    examples: ["Davita-style satellite units", "private nephrology clinics"],
    activeTenants: 18, typicalSize: "10 — 35 staff",
    regulators: ["MCT (nephrologists)", "TNMC (dialysis nurses)", "MoH dialysis programme"],
    capabilities: dialysisCaps,
  },
];

export function bizStats(b: StandaloneBusiness) {
  const total = b.capabilities.length;
  const full = b.capabilities.filter(c => c.status === "FULL").length;
  const partial = b.capabilities.filter(c => c.status === "PARTIAL").length;
  const roadmap = b.capabilities.filter(c => c.status === "ROADMAP").length;
  return {
    total, full, partial, roadmap,
    pct: Math.round(((full + partial * 0.5) / total) * 100),
    fullPct: Math.round((full / total) * 100),
  };
}

export function overallStats() {
  const totals = STANDALONE_BUSINESSES.reduce((acc, b) => {
    const s = bizStats(b);
    acc.total += s.total; acc.full += s.full; acc.partial += s.partial; acc.roadmap += s.roadmap;
    return acc;
  }, { total: 0, full: 0, partial: 0, roadmap: 0 });
  return {
    ...totals,
    pct: Math.round(((totals.full + totals.partial * 0.5) / totals.total) * 100),
  };
}
