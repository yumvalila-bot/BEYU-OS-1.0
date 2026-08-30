// Mock data powering BEYU Health OS demo dashboards.
export const TENANTS = [
  { id: "MUH-DSM-01", name: "Muhimbili National Hospital", city: "Dar es Salaam", type: "National", beds: 1500, color: "#0B1D3A" },
  { id: "AGA-DSM-02", name: "Aga Khan Hospital", city: "Dar es Salaam", type: "Private", beds: 170, color: "#0B5345" },
  { id: "ARU-MED-03", name: "Arusha Lutheran Medical Centre", city: "Arusha", type: "Faith-Based", beds: 220, color: "#7B341E" },
  { id: "BEY-CLN-04", name: "BEYU Family Clinic — Mwanza", city: "Mwanza", type: "Clinic", beds: 40, color: "#1E3A8A" },
  { id: "MOI-REG-05", name: "Moshi Regional Referral Hospital", city: "Moshi", type: "Regional", beds: 480, color: "#581C87" },
];

export const ROLES = [
  { id: "trustee", label: "Trustee (BEYU Family Trust)", title: "Trustee Command", subtitle: "Supreme constitutional authority" },
  { id: "board", label: "Board Member (Holding Co.)", title: "Board Room", subtitle: "Strategic governance & resolutions" },
  { id: "ceo", label: "CEO / Hospital Director", title: "Executive Command Center", subtitle: "Strategic oversight across all divisions" },
  { id: "doctor", label: "Doctor (Clinician)", title: "Clinical Workstation", subtitle: "Patient care, EMR & telemedicine" },
  { id: "nurse", label: "Nurse / Ward Officer", title: "Nursing Workstation", subtitle: "Wards, vitals & medication" },
  { id: "admin", label: "Hospital Admin", title: "Operations Console", subtitle: "Tenant ops, staff & resources" },
  { id: "pharmacy", label: "Pharmacist", title: "Pharmacy Console", subtitle: "Dispensing, stock & interactions" },
  { id: "lab", label: "Lab Technologist", title: "Laboratory (LIS)", subtitle: "Specimens, runs & results" },
  { id: "finance", label: "Accountant / CFO", title: "Financial Intelligence", subtitle: "Revenue, claims & GL" },
  { id: "patient", label: "Patient", title: "Patient Portal", subtitle: "Your health, your records" },
] as const;

export const MODULES = [
  { id: "emr", name: "EMR / EHR", group: "Clinical", desc: "Electronic medical records & longitudinal patient history" },
  { id: "opd", name: "OPD", group: "Clinical", desc: "Outpatient registration, queuing & consultation" },
  { id: "ipd", name: "IPD", group: "Clinical", desc: "Inpatient admission, ward & discharge management" },
  { id: "icu", name: "ICU", group: "Clinical", desc: "Critical care monitoring & protocols" },
  { id: "er", name: "Emergency (ER)", group: "Clinical", desc: "Triage, trauma & rapid response" },
  { id: "theatre", name: "Theatre / OR", group: "Clinical", desc: "Surgical scheduling, kits & checklist" },
  { id: "dental", name: "Dental + AI", group: "Clinical", desc: "Odontogram, imaging AI & treatment plans" },
  { id: "tele", name: "Telemedicine", group: "Clinical", desc: "Secure video, e-prescriptions & vitals" },

  { id: "lis", name: "LIS — Laboratory", group: "Diagnostics", desc: "Order entry, analyzers, QC & reporting" },
  { id: "ris", name: "RIS / PACS", group: "Diagnostics", desc: "Radiology workflow & DICOM imaging" },
  { id: "path", name: "Pathology", group: "Diagnostics", desc: "Histopathology workflow & sign-out" },

  { id: "hr", name: "Human Resources", group: "ERP", desc: "Staff, credentials, leave & rosters" },
  { id: "payroll", name: "Payroll", group: "ERP", desc: "Salaries, statutory & EFD compliance" },
  { id: "proc", name: "Procurement", group: "ERP", desc: "Suppliers, RFQs & purchase orders" },
  { id: "inv", name: "Inventory", group: "ERP", desc: "Stores, bin levels & expiry tracking" },
  { id: "assets", name: "Asset Management", group: "ERP", desc: "Equipment registry & maintenance" },
  { id: "finance", name: "Finance & GL", group: "ERP", desc: "Accounting, budgeting & dashboards" },
  { id: "rcm", name: "Revenue Cycle", group: "ERP", desc: "Charge capture, claims & denials" },

  { id: "clinical-ai", name: "Clinical AI Co-Pilot", group: "AI", desc: "Differential, dosing & guidelines" },
  { id: "dental-ai", name: "Dental Imaging AI", group: "AI", desc: "Caries, perio & cephalometric analysis" },
  { id: "radiology-ai", name: "Radiology AI", group: "AI", desc: "CXR, CT triage & fracture detection" },
  { id: "triage-ai", name: "Triage AI", group: "AI", desc: "Acuity scoring & queue prioritization" },
  { id: "pharma-ai", name: "Pharmacy AI", group: "AI", desc: "Interactions, allergies & PK/PD" },
  { id: "voice-ai", name: "Voice / Ambient AI", group: "AI", desc: "Hands-free notes & dictation" },
  { id: "coding-ai", name: "Coding AI (ICD-11)", group: "AI", desc: "Auto-coding & claim optimization" },

  { id: "compliance", name: "Compliance", group: "Governance", desc: "MTUHA, ISO, HIPAA & GDPR controls" },
  { id: "audit", name: "Audit & SIEM", group: "Governance", desc: "Immutable logs, alerts & forensics" },
  { id: "cyber", name: "Cybersecurity", group: "Governance", desc: "Zero-trust, IDS & vulnerability mgmt" },
  { id: "ai-gov", name: "AI Governance", group: "Governance", desc: "Hive policy, kill-switch & overrides" },
  { id: "nhif", name: "NHIF Integration", group: "Governance", desc: "Eligibility, claims & reconciliation" },

  { id: "vault", name: "Corporate Vault", group: "Corporate", desc: "Incorporation, resolutions, minutes, written approvals" },
  { id: "compliance-corp", name: "Compliance Calendar", group: "Corporate", desc: "BRELA annual returns, TRA, UBO, sector approvals" },
  { id: "protection", name: "Basic Protection", group: "Corporate", desc: "Insurance, supplier terms, employee contracts, data protection" },
  { id: "founding", name: "Founding Documents", group: "Corporate", desc: "Founders agreement, SHA, trust deed, exit clauses" },
  { id: "cap-table", name: "Cap Table & ESOP", group: "Corporate", desc: "Share classes, SAFEs, ESOP grants & vesting" },
  { id: "ip-nda", name: "IP, NDA & Trademarks", group: "Corporate", desc: "IP assignment, mutual NDAs, trademark registrations" },
  { id: "employment-corp", name: "Employment Library", group: "Corporate", desc: "Offer letters, contracts, HR policy handbook" },
  { id: "public-policies", name: "Public Policies", group: "Corporate", desc: "Terms of service, privacy policy, acceptable use" },
  { id: "investor", name: "Investor Materials", group: "Corporate", desc: "Pitch deck, financial model, term sheets, data room" },
  { id: "smart-contracts", name: "Smart Contracts (On-Chain)", group: "Corporate", desc: "DocSign, ESOP vesting, consent, cap table on EVM" },
];

export const PATIENTS = [
  { mrn: "BEYU-100482", name: "Amina Hassan", age: 34, sex: "F", dept: "OPD", insurance: "NHIF", status: "Triaged", priority: "Routine", visit: "Follow-up" },
  { mrn: "BEYU-100483", name: "Joseph Mwakyusa", age: 58, sex: "M", dept: "Cardiology", insurance: "Self-Pay", status: "In Consult", priority: "Urgent", visit: "Chest pain" },
  { mrn: "BEYU-100484", name: "Neema Mwangi", age: 27, sex: "F", dept: "ANC", insurance: "NHIF", status: "Waiting", priority: "Routine", visit: "ANC visit 3" },
  { mrn: "BEYU-100485", name: "Baraka Juma", age: 9, sex: "M", dept: "Pediatrics", insurance: "NHIF", status: "Admitted", priority: "Stable", visit: "Pneumonia" },
  { mrn: "BEYU-100486", name: "Fatuma Ally", age: 71, sex: "F", dept: "ICU", insurance: "AAR", status: "Critical", priority: "Critical", visit: "Sepsis" },
  { mrn: "BEYU-100487", name: "Daniel Kessy", age: 45, sex: "M", dept: "Dental", insurance: "NHIF", status: "Scheduled", priority: "Routine", visit: "RCT prep" },
  { mrn: "BEYU-100488", name: "Esther Lema", age: 38, sex: "F", dept: "OPD", insurance: "Jubilee", status: "Triaged", priority: "Routine", visit: "Headache" },
  { mrn: "BEYU-100489", name: "Hassan Mohamed", age: 62, sex: "M", dept: "Oncology", insurance: "NHIF", status: "In Treatment", priority: "Urgent", visit: "Cycle 3 chemo" },
];

export const APPOINTMENTS = [
  { time: "08:30", patient: "Amina Hassan", type: "Follow-up", doctor: "Dr. Neema Mwangi", room: "OPD-3" },
  { time: "09:00", patient: "Joseph Mwakyusa", type: "Cardiology", doctor: "Dr. John Doe", room: "Cardio-1" },
  { time: "09:30", patient: "Esther Lema", type: "Consultation", doctor: "Dr. Neema Mwangi", room: "OPD-3" },
  { time: "10:00", patient: "Daniel Kessy", type: "Dental — RCT", doctor: "Dr. Salim Said", room: "Dental-2" },
  { time: "10:30", patient: "Baraka Juma", type: "Pediatric Review", doctor: "Dr. Halima Omar", room: "Peds-1" },
  { time: "11:15", patient: "Hassan Mohamed", type: "Oncology Cycle 3", doctor: "Dr. M. Achieng", room: "Onco-Day" },
];

export const KPIS_CEO = [
  { label: "Active Patients (MTD)", value: "12,458", delta: "+12.5%", positive: true },
  { label: "Appointments Today", value: "3,214", delta: "+8.3%", positive: true },
  { label: "Revenue (TZS)", value: "324.6M", delta: "+15.7%", positive: true },
  { label: "NHIF Claim Success", value: "92.4%", delta: "+4.2%", positive: true },
  { label: "Bed Occupancy", value: "78%", delta: "−2.1%", positive: false },
  { label: "Avg Length of Stay", value: "3.4 d", delta: "−0.6 d", positive: true },
];

export const REVENUE_SERIES = [
  { m: "Jan", v: 140 }, { m: "Feb", v: 165 }, { m: "Mar", v: 198 },
  { m: "Apr", v: 182 }, { m: "May", v: 220 }, { m: "Jun", v: 245 },
  { m: "Jul", v: 268 }, { m: "Aug", v: 252 }, { m: "Sep", v: 289 },
  { m: "Oct", v: 305 }, { m: "Nov", v: 318 }, { m: "Dec", v: 324 },
];

export const TOP_SERVICES = [
  { name: "Outpatient (OPD)", value: 5642 },
  { name: "Laboratory", value: 3128 },
  { name: "Pharmacy", value: 2987 },
  { name: "Imaging / Radiology", value: 1456 },
  { name: "Dental", value: 982 },
  { name: "Surgery / Theatre", value: 412 },
];

export const ACTIVITIES = [
  { who: "MPI Engine", what: "New patient registered — BEYU-100489", when: "2 min ago", type: "ok" },
  { who: "Scheduler", what: "Appointment scheduled with Dr. Doe", when: "10 min ago", type: "info" },
  { who: "Billing", what: "Invoice INV-77821 generated (TZS 184,000)", when: "15 min ago", type: "info" },
  { who: "NHIF Gateway", what: "Claim CLM-44128 submitted successfully", when: "25 min ago", type: "ok" },
  { who: "Payments", what: "M-Pesa payment received TZS 65,500", when: "2 hours ago", type: "ok" },
  { who: "AI Governance", what: "Radiology AI suggestion accepted by Dr. Achieng", when: "3 hours ago", type: "ai" },
  { who: "Audit", what: "Tenant context switch logged — AGA-DSM-02", when: "5 hours ago", type: "warn" },
];

export const NOTIFICATIONS = [
  { title: "Critical lab alert — Patient BEYU-100486", time: "1m", severity: "critical" },
  { title: "NHIF batch 44-A reconciled (412 claims)", time: "12m", severity: "ok" },
  { title: "Theatre OR-2 ready for 11:00 procedure", time: "30m", severity: "info" },
  { title: "Low stock: Amoxicillin 500mg < 200 units", time: "1h", severity: "warn" },
];

export const STAFF = [
  { name: "Dr. John Doe", role: "Chief Medical Officer", dept: "Executive", on: true },
  { name: "Dr. Neema Mwangi", role: "Medical Officer", dept: "OPD", on: true },
  { name: "Grace Mushi", role: "Senior Nurse", dept: "Ward A", on: true },
  { name: "Dr. Salim Said", role: "Dentist", dept: "Dental", on: false },
  { name: "Dr. M. Achieng", role: "Oncologist", dept: "Oncology", on: true },
  { name: "Ahmed Bakari", role: "Pharmacist", dept: "Pharmacy", on: true },
  { name: "Lucy Mtui", role: "Lab Technologist", dept: "Laboratory", on: true },
  { name: "Edith Sanga", role: "Accountant", dept: "Finance", on: false },
];
