// ─────────────────────────────────────────────────────────────────────────────
// BEYU VIP SCHEME
// Full membership scheme: tiers, services, schedule, treatment plans,
// concierge management and billing.
// ─────────────────────────────────────────────────────────────────────────────

export type VIPTier = "PLATINUM" | "GOLD" | "SILVER";

export interface VIPTierDef {
  id: VIPTier;
  label: string;
  color: string;
  gradient: string;
  ringColor: string;
  annualFee: string;       // TZS
  setupFee: string;
  maxDependents: number;
  priorityRank: number;    // 1 = highest
  slaWaitMin: number;
  benefits: string[];
  description: string;
  tagline: string;
}

export const VIP_TIERS: VIPTierDef[] = [
  {
    id: "PLATINUM", label: "Platinum", color: "#0B1D3A", ringColor: "#D4AF37",
    gradient: "linear-gradient(135deg, #0B1D3A, #1E3A8A)",
    annualFee: "TZS 24,000,000", setupFee: "TZS 5,000,000",
    maxDependents: 8, priorityRank: 1, slaWaitMin: 5,
    description: "Reserved for heads of state, ambassadors, top executives and their families.",
    tagline: "Diplomatic-grade care",
    benefits: [
      "Personal Health Concierge (24/7 phone line)",
      "Private suite (en-suite, companion bed, butler service)",
      "Private entrance + valet parking",
      "Executive chef menu (halal · keto · diabetic · vegan)",
      "Express lab (TAT < 45 min)",
      "Global 2nd opinion (Cleveland, Mayo, Apollo)",
      "Air-ambulance medevac (TZ · KE · EU · US)",
      "Annual executive medical (2 days, all-inclusive)",
      "Wellness spa access (unlimited)",
      "Hospital transport (chauffeured)",
      "Interpreter on demand (12 languages)",
      "Home medication delivery (same day, nationwide)",
      "Fast-track queue (≤ 5 min any service)",
      "Dedicated VIP lounge",
      "Annual genomic screening",
      "Priority OR scheduling (24h notice)",
      "Family member coverage (up to 8 dependents)",
    ],
  },
  {
    id: "GOLD", label: "Gold", color: "#D4AF37", ringColor: "#b48a24",
    gradient: "linear-gradient(135deg, #D4AF37, #b48a24)",
    annualFee: "TZS 12,000,000", setupFee: "TZS 2,500,000",
    maxDependents: 4, priorityRank: 2, slaWaitMin: 10,
    description: "Executives, senior professionals and prosperous families seeking elevated care.",
    tagline: "Executive healthcare",
    benefits: [
      "Personal Health Concierge (business hours)",
      "Premium room (private, en-suite)",
      "Priority entrance",
      "Premium menu options",
      "Priority lab (TAT < 90 min)",
      "Regional 2nd opinion (Aga Khan Nairobi, Apollo Bangalore)",
      "Annual executive medical (1 day)",
      "Wellness spa access (10 visits / year)",
      "Hospital transport (on request)",
      "Interpreter on demand (English + Swahili + French)",
      "Home medication delivery (Dar es Salaam, next day)",
      "Fast-track queue (≤ 10 min)",
      "VIP lounge access",
      "Priority specialist appointments (48h)",
      "Family member coverage (up to 4 dependents)",
    ],
  },
  {
    id: "SILVER", label: "Silver", color: "#94a3b8", ringColor: "#64748b",
    gradient: "linear-gradient(135deg, #cbd5e1, #94a3b8)",
    annualFee: "TZS 4,800,000", setupFee: "TZS 1,000,000",
    maxDependents: 2, priorityRank: 3, slaWaitMin: 20,
    description: "Professionals and busy families who value time and elevated service.",
    tagline: "Time-saver tier",
    benefits: [
      "Member services line (business hours)",
      "Private room (when available)",
      "Standard menu options",
      "Standard lab",
      "Annual health check (half-day)",
      "Fast-track queue (≤ 20 min)",
      "VIP lounge access (when available)",
      "Priority appointments (5 working days)",
      "Family member coverage (up to 2 dependents)",
    ],
  },
];

export function tier(id: VIPTier) { return VIP_TIERS.find(t => t.id === id)!; }

/* ─────────────────────────── VIP Members ─────────────────────────── */

export interface VIPMember {
  id: string;                 // VIP-xxxx
  mrn: string;
  name: string;
  title: string;              // honorific
  tier: VIPTier;
  joined: string;
  expires: string;
  status: "ACTIVE" | "EXPIRING" | "EXPIRED" | "PENDING";
  coordinatorId: string;      // employee id
  dependents: number;
  totalVisits: number;
  lifetimeValueM: number;     // TZS millions
  preferences: string[];
  language: string;
  emergencyContact: string;
  nextAppt?: { date: string; service: string };
  organization?: string;
  flags?: string[];           // VVIP, Diplomatic Immunity, Allergy etc.
}

export const VIP_MEMBERS: VIPMember[] = [
  {
    id: "VIP-0001", mrn: "BEYU-100501", name: "Hon. Salma Kikwete",
    title: "Hon.", tier: "PLATINUM", joined: "2024-09-12", expires: "2026-09-12",
    status: "ACTIVE", coordinatorId: "EMP-10040", dependents: 4,
    totalVisits: 28, lifetimeValueM: 84.2, language: "Swahili + English",
    organization: "Office of the Speaker",
    preferences: ["South wing entrance", "Halal meals", "Female nurse", "No press exposure"],
    emergencyContact: "+255 754 100 800 · Personal Aide",
    nextAppt: { date: "Today 09:30", service: "Cardiology · Suite 1" },
    flags: ["VVIP", "Press-sensitive"],
  },
  {
    id: "VIP-0002", mrn: "BEYU-100502", name: "Mr. Reginald Mengi",
    title: "Mr.", tier: "GOLD", joined: "2025-01-08", expires: "2026-01-08",
    status: "EXPIRING", coordinatorId: "EMP-10040", dependents: 3,
    totalVisits: 14, lifetimeValueM: 42.6, language: "English + Swahili",
    organization: "Mengi Holdings Group",
    preferences: ["Private suite #3", "Chef's keto menu", "Daily progress brief", "Espresso bar"],
    emergencyContact: "+255 754 100 801 · Group Secretary",
    nextAppt: { date: "Today 09:45", service: "Cardio Suite" },
  },
  {
    id: "VIP-0003", mrn: "BEYU-100508", name: "Amb. Helen Mtui",
    title: "Amb.", tier: "PLATINUM", joined: "2024-06-22", expires: "2026-06-22",
    status: "ACTIVE", coordinatorId: "EMP-10040", dependents: 6,
    totalVisits: 22, lifetimeValueM: 96.4, language: "French + English + Swahili",
    organization: "Ministry of Foreign Affairs",
    preferences: ["French interpreter", "Wellness spa", "Tele-2nd-opinion", "Anonymous booking"],
    emergencyContact: "+255 754 100 802 · Embassy Liaison",
    nextAppt: { date: "Tomorrow 10:00", service: "Annual Executive Medical" },
    flags: ["Diplomatic Immunity"],
  },
  {
    id: "VIP-0004", mrn: "BEYU-100509", name: "Mr. Bakari Mwakikolo",
    title: "Mr.", tier: "GOLD", joined: "2025-04-18", expires: "2026-04-18",
    status: "ACTIVE", coordinatorId: "EMP-10042", dependents: 2,
    totalVisits: 8, lifetimeValueM: 18.4, language: "Swahili + English",
    organization: "Mwakikolo Construction Ltd",
    preferences: ["Hospital transport", "Home med delivery", "WhatsApp updates"],
    emergencyContact: "+255 754 100 803 · Wife",
  },
  {
    id: "VIP-0005", mrn: "BEYU-100510", name: "Mrs. Latifa Mwalimu",
    title: "Mrs.", tier: "SILVER", joined: "2025-08-04", expires: "2026-08-04",
    status: "ACTIVE", coordinatorId: "EMP-10042", dependents: 2,
    totalVisits: 5, lifetimeValueM: 6.8, language: "Swahili",
    organization: "Mwalimu Group",
    preferences: ["Fast-track only", "SMS reminders"],
    emergencyContact: "+255 754 100 804 · Daughter",
  },
  {
    id: "VIP-0006", mrn: "BEYU-100511", name: "Dr. Patrick Okello",
    title: "Dr.", tier: "GOLD", joined: "2025-11-22", expires: "2026-11-22",
    status: "ACTIVE", coordinatorId: "EMP-10040", dependents: 3,
    totalVisits: 6, lifetimeValueM: 22.4, language: "English",
    organization: "Self · Private Practice",
    preferences: ["Late-evening appointments", "Specialist consults"],
    emergencyContact: "+255 754 100 805 · Wife",
    nextAppt: { date: "Fri 16:00", service: "Annual Physical" },
  },
  {
    id: "VIP-0007", mrn: "BEYU-100512", name: "Mr. Adam Lipumba",
    title: "Mr.", tier: "PLATINUM", joined: "2025-02-15", expires: "2026-02-15",
    status: "EXPIRED", coordinatorId: "EMP-10040", dependents: 5,
    totalVisits: 38, lifetimeValueM: 142.6, language: "Swahili + English",
    organization: "Lipumba Industries",
    preferences: ["Suite 1", "Private chef", "Press security"],
    emergencyContact: "+255 754 100 806 · Personal Assistant",
    flags: ["Renewal pending"],
  },
  {
    id: "VIP-0008", mrn: "BEYU-100513", name: "Mrs. Janet Karume",
    title: "Mrs.", tier: "SILVER", joined: "2026-04-28", expires: "2027-04-28",
    status: "PENDING", coordinatorId: "EMP-10042", dependents: 1,
    totalVisits: 0, lifetimeValueM: 0, language: "Swahili",
    organization: "Karume Tours",
    preferences: ["First-time member", "Wants annual check"],
    emergencyContact: "+255 754 100 807 · Son",
    flags: ["Onboarding in progress"],
  },
];

/* ─────────────────────────── VIP Schedule ─────────────────────────── */

export interface VIPAppointment {
  id: string;
  memberId: string;
  date: string;          // YYYY-MM-DD
  time: string;          // HH:mm
  service: string;
  location: string;
  duration: number;      // minutes
  doctor: string;        // employee id
  status: "SCHEDULED" | "CONFIRMED" | "IN-PROGRESS" | "COMPLETED" | "NO-SHOW";
  coordinatorNotes?: string;
  transportRequested?: boolean;
  interpreterRequested?: boolean;
}

export const VIP_APPOINTMENTS: VIPAppointment[] = [
  { id: "VAP-1001", memberId: "VIP-0001", date: "2026-05-04", time: "09:30", service: "Cardiology Review",
    location: "Private Cardio Suite 1", duration: 60, doctor: "EMP-10003", status: "IN-PROGRESS",
    coordinatorNotes: "Pre-arrival labs ✓ · refreshments served", transportRequested: true },
  { id: "VAP-1002", memberId: "VIP-0002", date: "2026-05-04", time: "09:45", service: "Echo + Stress Test",
    location: "Cardio Suite 2", duration: 90, doctor: "EMP-10001", status: "CONFIRMED",
    coordinatorNotes: "Chef breakfast · keto" },
  { id: "VAP-1003", memberId: "VIP-0003", date: "2026-05-05", time: "10:00", service: "Annual Executive Medical (Day 1)",
    location: "Executive Health Suite", duration: 480, doctor: "EMP-10003", status: "SCHEDULED",
    coordinatorNotes: "French interpreter booked · full body MRI · genomics", interpreterRequested: true },
  { id: "VAP-1004", memberId: "VIP-0006", date: "2026-05-08", time: "16:00", service: "Annual Physical Examination",
    location: "Executive Health Suite", duration: 180, doctor: "EMP-10010", status: "SCHEDULED" },
  { id: "VAP-1005", memberId: "VIP-0001", date: "2026-05-12", time: "11:00", service: "Wellness Spa Session",
    location: "Spa Wing · Treatment Room 2", duration: 120, doctor: "EMP-10022", status: "SCHEDULED" },
  { id: "VAP-1006", memberId: "VIP-0002", date: "2026-05-15", time: "14:00", service: "Follow-up Consult",
    location: "Private Cardio Suite 1", duration: 30, doctor: "EMP-10001", status: "SCHEDULED",
    transportRequested: true },
  { id: "VAP-1007", memberId: "VIP-0004", date: "2026-05-18", time: "09:00", service: "Specialist Referral (Ortho)",
    location: "Ortho Suite", duration: 45, doctor: "EMP-10010", status: "SCHEDULED" },
];

/* ─────────────────────────── VIP Treatment Plans ─────────────────────────── */

export interface TreatmentMilestone {
  date: string;
  title: string;
  done: boolean;
  notes?: string;
}

export interface VIPTreatmentPlan {
  id: string;
  memberId: string;
  diagnosis: string;
  startedOn: string;
  leadPhysician: string;     // employee id
  status: "ACTIVE" | "COMPLETED" | "ON-HOLD";
  goals: string[];
  milestones: TreatmentMilestone[];
  estimatedCostM: number;     // TZS millions
}

export const VIP_PLANS: VIPTreatmentPlan[] = [
  {
    id: "TP-2001", memberId: "VIP-0001", diagnosis: "Hypertension + LV diastolic dysfunction",
    startedOn: "2024-10-15", leadPhysician: "EMP-10003", status: "ACTIVE", estimatedCostM: 24.6,
    goals: [
      "Achieve BP < 130/80 consistently",
      "Reverse mild LV diastolic dysfunction (Echo improvement)",
      "Optimize cardiovascular risk profile",
      "Maintain stress resilience via wellness programme",
    ],
    milestones: [
      { date: "2024-10-15", title: "Initial cardiology workup + Echo", done: true },
      { date: "2024-11-01", title: "Treatment plan & medication initiation", done: true },
      { date: "2025-02-12", title: "3-month review · 24h BP monitoring", done: true, notes: "BP 138/86 → 128/78" },
      { date: "2025-08-04", title: "6-month review · repeat Echo", done: true, notes: "LV function improving" },
      { date: "2026-02-10", title: "Annual review · genomic screening", done: true },
      { date: "2026-05-04", title: "Quarterly review", done: false },
      { date: "2026-08-04", title: "Repeat Echo + 24h BP", done: false },
    ],
  },
  {
    id: "TP-2002", memberId: "VIP-0002", diagnosis: "Post-PCI follow-up · Type 2 DM",
    startedOn: "2025-03-04", leadPhysician: "EMP-10001", status: "ACTIVE", estimatedCostM: 38.2,
    goals: [
      "Maintain stent patency · no MACE events",
      "HbA1c < 7.0%",
      "Weight loss 8 kg (BMI 30 → 27)",
      "Functional capacity > 7 METs",
    ],
    milestones: [
      { date: "2025-03-04", title: "Post-PCI baseline", done: true },
      { date: "2025-06-04", title: "3-month stress test + DM panel", done: true, notes: "HbA1c 7.8 → 7.2" },
      { date: "2025-09-04", title: "6-month review · CAC scoring", done: true },
      { date: "2025-12-04", title: "9-month review · echo + lipids", done: true },
      { date: "2026-03-04", title: "Annual review · keto programme launch", done: true, notes: "Lost 4.2 kg" },
      { date: "2026-05-04", title: "Today · echo + stress test", done: false },
    ],
  },
  {
    id: "TP-2003", memberId: "VIP-0003", diagnosis: "Preventive wellness programme",
    startedOn: "2024-07-01", leadPhysician: "EMP-10003", status: "ACTIVE", estimatedCostM: 18.4,
    goals: [
      "Annual executive medical with no missed findings",
      "Maintain optimal fitness (VO₂max > 35)",
      "Genomic risk-based screening compliance 100%",
      "Travel medicine readiness (always up-to-date)",
    ],
    milestones: [
      { date: "2024-07-01", title: "Programme enrolment + genomics baseline", done: true },
      { date: "2025-01-15", title: "Mid-year fitness assessment", done: true },
      { date: "2025-07-01", title: "Annual executive medical", done: true, notes: "All clear" },
      { date: "2025-12-04", title: "Travel medicine refresh (yellow fever)", done: true },
      { date: "2026-05-05", title: "Annual executive medical (Day 1)", done: false },
      { date: "2026-05-06", title: "Annual executive medical (Day 2) + genomics", done: false },
    ],
  },
];

/* ─────────────────────────── VIP Suites ─────────────────────────── */

export interface VIPSuite {
  id: string;
  name: string;
  type: "Presidential" | "Executive" | "Premium" | "Standard VIP";
  tierAccess: VIPTier[];
  amenities: string[];
  status: "OCCUPIED" | "AVAILABLE" | "CLEANING" | "MAINTENANCE";
  occupant?: string;          // member id if occupied
  ratePerNight: string;
}

export const VIP_SUITES: VIPSuite[] = [
  { id: "S-PRES-01", name: "Presidential Suite 1", type: "Presidential", tierAccess: ["PLATINUM"],
    amenities: ["Master bedroom + companion suite", "Private conference room", "Butler 24/7", "Bulletproof glass", "Press-restricted floor", "Helicopter pad access"],
    status: "OCCUPIED", occupant: "VIP-0001", ratePerNight: "TZS 2,800,000" },
  { id: "S-PRES-02", name: "Presidential Suite 2", type: "Presidential", tierAccess: ["PLATINUM"],
    amenities: ["Master bedroom + 2 companion rooms", "Dining room with chef station", "Butler 24/7", "Diplomatic security wing"],
    status: "AVAILABLE", ratePerNight: "TZS 2,800,000" },
  { id: "S-EXEC-01", name: "Executive Suite 1", type: "Executive", tierAccess: ["PLATINUM", "GOLD"],
    amenities: ["King bed + companion bed", "Lounge + workspace", "Private nurse station", "Premium menu"],
    status: "OCCUPIED", occupant: "VIP-0002", ratePerNight: "TZS 1,400,000" },
  { id: "S-EXEC-02", name: "Executive Suite 2", type: "Executive", tierAccess: ["PLATINUM", "GOLD"],
    amenities: ["King bed", "Lounge", "Premium menu"],
    status: "CLEANING", ratePerNight: "TZS 1,400,000" },
  { id: "S-EXEC-03", name: "Executive Suite 3", type: "Executive", tierAccess: ["PLATINUM", "GOLD"],
    amenities: ["Queen bed", "Lounge", "Premium menu"],
    status: "AVAILABLE", ratePerNight: "TZS 1,400,000" },
  { id: "S-PREM-01", name: "Premium Room 1", type: "Premium", tierAccess: ["GOLD", "SILVER"],
    amenities: ["Single bed", "En-suite", "Standard menu"], status: "AVAILABLE", ratePerNight: "TZS 600,000" },
  { id: "S-PREM-02", name: "Premium Room 2", type: "Premium", tierAccess: ["GOLD", "SILVER"],
    amenities: ["Single bed", "En-suite"], status: "AVAILABLE", ratePerNight: "TZS 600,000" },
  { id: "S-PREM-03", name: "Premium Room 3", type: "Premium", tierAccess: ["GOLD", "SILVER"],
    amenities: ["Single bed", "En-suite"], status: "MAINTENANCE", ratePerNight: "TZS 600,000" },
];

/* ─────────────────────────── VIP Scheme KPIs ─────────────────────────── */

export const VIP_KPIS = {
  totalMembers: VIP_MEMBERS.length,
  platinum: VIP_MEMBERS.filter(m => m.tier === "PLATINUM").length,
  gold: VIP_MEMBERS.filter(m => m.tier === "GOLD").length,
  silver: VIP_MEMBERS.filter(m => m.tier === "SILVER").length,
  active: VIP_MEMBERS.filter(m => m.status === "ACTIVE").length,
  expiringSoon: VIP_MEMBERS.filter(m => m.status === "EXPIRING").length,
  pending: VIP_MEMBERS.filter(m => m.status === "PENDING").length,
  totalLTV: VIP_MEMBERS.reduce((s, m) => s + m.lifetimeValueM, 0),
  apptsToday: VIP_APPOINTMENTS.filter(a => a.date === "2026-05-04").length,
  apptsThisWeek: VIP_APPOINTMENTS.length,
  suitesOccupancy: Math.round((VIP_SUITES.filter(s => s.status === "OCCUPIED").length / VIP_SUITES.length) * 100),
  activePlans: VIP_PLANS.filter(p => p.status === "ACTIVE").length,
  servedToday: 18,
  avgWaitMin: 4,
  satisfactionScore: 96,
};
