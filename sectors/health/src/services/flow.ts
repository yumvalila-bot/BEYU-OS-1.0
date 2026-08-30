// ─────────────────────────────────────────────────────────────────────────────
// Patient Flow Service
// Color-coded priority system, real-time wait time tracking, VIP services.
// ─────────────────────────────────────────────────────────────────────────────

export type Priority = "VIP" | "EMERGENCY" | "URGENT" | "PRIORITY" | "ROUTINE" | "PEDIATRIC" | "ELDERLY" | "EXPECTANT";

export interface PriorityDef {
  id: Priority;
  label: string;
  color: string;            // hex
  bg: string;               // tailwind bg class
  text: string;             // tailwind text class
  border: string;           // tailwind border class
  ring: string;             // tailwind ring class for badges
  targetWaitMin: number;    // SLA in minutes
  description: string;
  icon: string;
}

/** Master priority/colour-coding palette used across queues, beds, dashboards. */
export const PRIORITIES: PriorityDef[] = [
  {
    id: "VIP", label: "VIP / Private", color: "#D4AF37",
    bg: "bg-gold-50", text: "text-gold-800", border: "border-gold-300", ring: "ring-gold-400",
    targetWaitMin: 5, icon: "star",
    description: "Private suite patients · concierge service · dedicated coordinator",
  },
  {
    id: "EMERGENCY", label: "Emergency", color: "#dc2626",
    bg: "bg-rose-50", text: "text-rose-800", border: "border-rose-300", ring: "ring-rose-400",
    targetWaitMin: 0, icon: "warning",
    description: "Life-threatening · seen immediately · ESI 1",
  },
  {
    id: "URGENT", label: "Urgent", color: "#ea580c",
    bg: "bg-orange-50", text: "text-orange-800", border: "border-orange-300", ring: "ring-orange-400",
    targetWaitMin: 15, icon: "zap",
    description: "Serious · seen within 15 min · ESI 2",
  },
  {
    id: "PRIORITY", label: "Priority", color: "#b45309",
    bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-300", ring: "ring-amber-400",
    targetWaitMin: 30, icon: "zap",
    description: "Time-sensitive · seen within 30 min · ESI 3",
  },
  {
    id: "ROUTINE", label: "Routine", color: "#059669",
    bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-300", ring: "ring-emerald-400",
    targetWaitMin: 90, icon: "check",
    description: "Standard appointment · ESI 4–5",
  },
  {
    id: "PEDIATRIC", label: "Pediatric Priority", color: "#7c3aed",
    bg: "bg-violet-50", text: "text-violet-800", border: "border-violet-300", ring: "ring-violet-400",
    targetWaitMin: 20, icon: "users",
    description: "Child < 5 years · expedited intake",
  },
  {
    id: "ELDERLY", label: "Elderly / Frail", color: "#0891b2",
    bg: "bg-cyan-50", text: "text-cyan-800", border: "border-cyan-300", ring: "ring-cyan-400",
    targetWaitMin: 30, icon: "heart",
    description: "≥ 75 years or frailty score ≥ 5 · priority seating",
  },
  {
    id: "EXPECTANT", label: "Expectant Mother", color: "#be123c",
    bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", ring: "ring-rose-300",
    targetWaitMin: 15, icon: "heart",
    description: "Pregnant ≥ 28 weeks · priority queue",
  },
];

export function priority(id: Priority) { return PRIORITIES.find((p) => p.id === id)!; }

/* ─────────────────────────── Wait Time Status ─────────────────────────── */

export type WaitStatus = "ON-TIME" | "WARNING" | "BREACH";

/** Compute wait status from elapsed minutes vs SLA. */
export function waitStatus(elapsedMin: number, targetMin: number): WaitStatus {
  if (elapsedMin <= targetMin) return "ON-TIME";
  if (elapsedMin <= targetMin * 1.5) return "WARNING";
  return "BREACH";
}

export function waitStatusStyle(s: WaitStatus) {
  switch (s) {
    case "ON-TIME": return { color: "text-emerald-700", bg: "bg-emerald-100", dot: "bg-emerald-500", label: "ON TIME" };
    case "WARNING": return { color: "text-amber-700", bg: "bg-amber-100", dot: "bg-amber-500", label: "AT RISK" };
    case "BREACH":  return { color: "text-rose-700", bg: "bg-rose-100", dot: "bg-rose-500", label: "SLA BREACH" };
  }
}

/* ─────────────────────────── Queue Entries ─────────────────────────── */

export interface QueueEntry {
  ticket: string;
  patient: string;
  mrn: string;
  age: number;
  sex: "M" | "F";
  priority: Priority;
  arrivedAt: string;        // "08:32"
  elapsedMin: number;       // mins waited so far
  stage: "Reception" | "Triage" | "Waiting" | "In Consult" | "Lab" | "Pharmacy" | "Discharged";
  department: string;
  destination: string;      // e.g. "Dr. Mwangi · OPD-3"
  insurance: "VIP" | "NHIF" | "AAR" | "Jubilee" | "Self-pay" | "Corporate";
  notes?: string;
  vipTier?: "Platinum" | "Gold" | "Silver";
}

export const QUEUE: QueueEntry[] = [
  // VIPs
  { ticket: "V-001", patient: "Hon. Salma Kikwete", mrn: "BEYU-100501", age: 58, sex: "F",
    priority: "VIP", arrivedAt: "08:55", elapsedMin: 3,
    stage: "Triage", department: "OPD · Private Wing", destination: "Dr. M. Achieng · Suite 1",
    insurance: "VIP", vipTier: "Platinum", notes: "Concierge: Asha Mwita · vehicle parked at private entrance" },
  { ticket: "V-002", patient: "Mr. Reginald Mengi", mrn: "BEYU-100502", age: 64, sex: "M",
    priority: "VIP", arrivedAt: "09:10", elapsedMin: 4,
    stage: "Waiting", department: "Cardiology · Private", destination: "Dr. John Doe · Cardio Suite",
    insurance: "VIP", vipTier: "Gold", notes: "Pre-arrival labs ✓ · refreshments served" },

  // Emergency
  { ticket: "E-101", patient: "Unknown male, ~40s", mrn: "BEYU-100503", age: 40, sex: "M",
    priority: "EMERGENCY", arrivedAt: "09:14", elapsedMin: 0,
    stage: "In Consult", department: "Emergency · Resus", destination: "Dr. R. Mhina · Resus Bay 1",
    insurance: "Self-pay", notes: "Pedestrian RTA · GCS 7 · trauma activation" },

  // Urgent
  { ticket: "U-202", patient: "Saidi Hassan", mrn: "BEYU-100504", age: 52, sex: "M",
    priority: "URGENT", arrivedAt: "09:08", elapsedMin: 12,
    stage: "Triage", department: "Emergency", destination: "ER Cubicle 3",
    insurance: "NHIF", notes: "Acute chest pain · diaphoretic" },
  { ticket: "U-203", patient: "Asha Ramadhani", mrn: "BEYU-100505", age: 28, sex: "F",
    priority: "URGENT", arrivedAt: "09:06", elapsedMin: 14,
    stage: "Triage", department: "Gynae · Emergency", destination: "ER Cubicle 4",
    insurance: "NHIF", notes: "Severe lower abdo pain · ?ectopic" },

  // Expectant
  { ticket: "M-301", patient: "Neema Mwangi", mrn: "BEYU-100484", age: 27, sex: "F",
    priority: "EXPECTANT", arrivedAt: "08:30", elapsedMin: 16,
    stage: "Waiting", department: "ANC", destination: "Dr. Tumaini Mtui · ANC-2",
    insurance: "NHIF", notes: "32 weeks · routine ANC visit 4" },

  // Pediatric
  { ticket: "P-401", patient: "Baraka Juma", mrn: "BEYU-100485", age: 9, sex: "M",
    priority: "PEDIATRIC", arrivedAt: "08:25", elapsedMin: 22,
    stage: "Lab", department: "Pediatrics", destination: "Lab · Phlebotomy 2",
    insurance: "NHIF", notes: "Post-pneumonia follow-up · FBC + CRP" },

  // Elderly
  { ticket: "S-501", patient: "Bibi Fatuma Ally", mrn: "BEYU-100506", age: 78, sex: "F",
    priority: "ELDERLY", arrivedAt: "08:42", elapsedMin: 38,
    stage: "Waiting", department: "OPD · Internal Med", destination: "Dr. Neema Mwangi · OPD-3",
    insurance: "NHIF", notes: "Frailty score 6 · wheelchair · daughter present" },

  // Priority
  { ticket: "R-601", patient: "Joseph Mwakyusa", mrn: "BEYU-100483", age: 58, sex: "M",
    priority: "PRIORITY", arrivedAt: "08:15", elapsedMin: 28,
    stage: "Waiting", department: "Cardiology", destination: "Cardio-1",
    insurance: "Self-pay", notes: "Chest pain follow-up · ECG completed" },
  { ticket: "R-602", patient: "Mary Joseph", mrn: "BEYU-100507", age: 41, sex: "F",
    priority: "PRIORITY", arrivedAt: "08:48", elapsedMin: 22,
    stage: "In Consult", department: "OPD", destination: "Dr. Neema Mwangi · OPD-3",
    insurance: "Jubilee", notes: "Severe headache · neuro exam pending" },

  // Routine — some breaching to demonstrate
  { ticket: "G-701", patient: "Amina Hassan", mrn: "BEYU-100482", age: 34, sex: "F",
    priority: "ROUTINE", arrivedAt: "07:45", elapsedMin: 65,
    stage: "Pharmacy", department: "OPD", destination: "Pharmacy Counter 2",
    insurance: "NHIF", notes: "OPD consult complete · awaiting meds" },
  { ticket: "G-702", patient: "Esther Lema", mrn: "BEYU-100488", age: 38, sex: "F",
    priority: "ROUTINE", arrivedAt: "07:30", elapsedMin: 102,
    stage: "Waiting", department: "OPD", destination: "Dr. Neema Mwangi · OPD-3",
    insurance: "Jubilee", notes: "Routine OPD · headache · waiting since 07:30" },
  { ticket: "G-703", patient: "Daniel Kessy", mrn: "BEYU-100487", age: 45, sex: "M",
    priority: "ROUTINE", arrivedAt: "08:50", elapsedMin: 18,
    stage: "Triage", department: "Dental", destination: "Dental Chair 2",
    insurance: "NHIF", notes: "RCT visit 2 · scheduled" },
  { ticket: "G-704", patient: "Hassan Mohamed", mrn: "BEYU-100489", age: 62, sex: "M",
    priority: "ROUTINE", arrivedAt: "08:20", elapsedMin: 35,
    stage: "Waiting", department: "Oncology", destination: "Onco Day-Care",
    insurance: "NHIF", notes: "Cycle 3 chemo · pre-meds reviewed" },
  { ticket: "G-705", patient: "Erick Mushi", mrn: "BEYU-100490", age: 51, sex: "M",
    priority: "ROUTINE", arrivedAt: "07:50", elapsedMin: 95,
    stage: "Waiting", department: "OPD", destination: "Dr. Halima Omar · OPD-5",
    insurance: "Self-pay", notes: "Follow-up · diabetes review" },
];

/* ─────────────────────────── KPIs ─────────────────────────── */

export const FLOW_KPIS = {
  inQueue: QUEUE.filter((q) => q.stage !== "Discharged").length,
  avgWaitMin: Math.round(QUEUE.reduce((s, q) => s + q.elapsedMin, 0) / QUEUE.length),
  vipServed: 18,         // today
  slaBreaches: QUEUE.filter((q) => waitStatus(q.elapsedMin, priority(q.priority).targetWaitMin) === "BREACH").length,
  emergencyToday: 24,
  longestWaitMin: Math.max(...QUEUE.map((q) => q.elapsedMin)),
};

/* ─────────────────────────── VIP Services ─────────────────────────── */

export const VIP_SERVICES = [
  { id: "concierge", name: "Personal Health Concierge", desc: "Dedicated coordinator end-to-end", icon: "user", tier: "Platinum" },
  { id: "private-entry", name: "Private Entrance & Valet", desc: "Discreet vehicle drop-off at south wing", icon: "building", tier: "Platinum" },
  { id: "suite", name: "Private Suite", desc: "Luxury en-suite room · companion bed", icon: "building", tier: "Platinum" },
  { id: "chef", name: "Executive Chef Menu", desc: "Personalised meals · halal · keto · DM-friendly", icon: "star", tier: "Platinum" },
  { id: "express-lab", name: "Express Lab (< 45 min)", desc: "Priority specimen routing & analyzer", icon: "lab", tier: "Platinum" },
  { id: "tele-2nd-opinion", name: "Global 2nd Opinion", desc: "Cleveland Clinic / Apollo specialist tele-consult", icon: "phone", tier: "Platinum" },
  { id: "spa", name: "Wellness Spa Access", desc: "On-site spa · physiotherapy lounge", icon: "heart", tier: "Gold" },
  { id: "transport", name: "Hospital Transport", desc: "Chauffeured pickup within Dar es Salaam", icon: "truck", tier: "Gold" },
  { id: "interpreter", name: "Interpreter on Demand", desc: "12 languages including Arabic, Mandarin, French", icon: "globe", tier: "Gold" },
  { id: "concierge-pharmacy", name: "Home Medication Delivery", desc: "Same-day delivery anywhere in Tanzania", icon: "pill", tier: "Gold" },
  { id: "fast-track", name: "Fast-Track Queue", desc: "≤ 5 min wait at any service point", icon: "zap", tier: "Silver" },
  { id: "lounge", name: "VIP Lounge", desc: "Private waiting area · refreshments · wifi", icon: "star", tier: "Silver" },
];

export interface VIPPatient {
  mrn: string;
  name: string;
  tier: "Platinum" | "Gold" | "Silver";
  joined: string;
  coordinator: string;       // employee id
  preferences: string[];
  totalVisits: number;
  lifetimeValue: string;     // TZS
  nextAppt?: string;
}

export const VIP_PATIENTS: VIPPatient[] = [
  { mrn: "BEYU-100501", name: "Hon. Salma Kikwete", tier: "Platinum", joined: "2024-09-12",
    coordinator: "EMP-10040", preferences: ["South wing entrance", "Halal meals", "Female nurse"],
    totalVisits: 28, lifetimeValue: "TZS 84.2M", nextAppt: "Today 09:30 · Cardiology" },
  { mrn: "BEYU-100502", name: "Mr. Reginald Mengi", tier: "Gold", joined: "2025-01-08",
    coordinator: "EMP-10040", preferences: ["Private suite #3", "Chef's keto menu", "Daily progress brief"],
    totalVisits: 14, lifetimeValue: "TZS 42.6M", nextAppt: "Today 09:45 · Cardio Suite" },
  { mrn: "BEYU-100508", name: "Amb. Helen Mtui", tier: "Platinum", joined: "2024-06-22",
    coordinator: "EMP-10040", preferences: ["Interpreter (French)", "Wellness spa", "Tele-2nd-opinion"],
    totalVisits: 22, lifetimeValue: "TZS 96.4M", nextAppt: "Tomorrow 10:00 · Annual exam" },
  { mrn: "BEYU-100509", name: "Mr. Bakari Mwakikolo", tier: "Gold", joined: "2025-04-18",
    coordinator: "EMP-10042", preferences: ["Hospital transport", "Home med delivery"],
    totalVisits: 8, lifetimeValue: "TZS 18.4M" },
  { mrn: "BEYU-100510", name: "Mrs. Latifa Mwalimu", tier: "Silver", joined: "2025-08-04",
    coordinator: "EMP-10042", preferences: ["Fast-track only"],
    totalVisits: 5, lifetimeValue: "TZS 6.8M" },
];
