// ─────────────────────────────────────────────────────────────────────────────
// HR Service — centralized employee data, roster, credentials, leave and helpers.
// Used by clinical, operations, audit, AI, finance and settings modules.
// ─────────────────────────────────────────────────────────────────────────────

export type ShiftCode = "DAY" | "NIGHT" | "ON-CALL" | "OFF" | "LEAVE";

export interface Employee {
  id: string;            // EMP-xxxx — also used as the audit "actor" key
  name: string;
  role: string;          // Title
  cadre: "Doctor" | "Nurse" | "Allied" | "Admin" | "Executive" | "Support";
  department: string;
  tenant: string;        // e.g. MUH-DSM-01
  email: string;
  phone: string;
  credential?: { type: string; number: string; expires: string; status: "Active" | "Expiring" | "Expired" };
  shift: ShiftCode;
  leaveBalance: number;  // days remaining
  cpdHours: number;      // YTD
  cpdRequired: number;
  esopGrant?: number;
  startDate: string;
  managerId?: string;
  online: boolean;
  avatarColor: string;
}

const C = {
  navy: "#0B1D3A", gold: "#D4AF37", sage: "#557345",
  violet: "#7c3aed", cyan: "#0891b2", rose: "#be123c",
  amber: "#b45309", indigo: "#1E3A8A", teal: "#0d9488",
};

export const EMPLOYEES: Employee[] = [
  // Executive
  { id: "EMP-10001", name: "Dr. John Doe", role: "Chief Executive Officer", cadre: "Executive", department: "Executive",
    tenant: "MUH-DSM-01", email: "john.doe@beyu.health", phone: "+255 754 100 001",
    credential: { type: "MCT License", number: "MD-2002-04412", expires: "2027-08-12", status: "Active" },
    shift: "DAY", leaveBalance: 18, cpdHours: 48, cpdRequired: 40, esopGrant: 0, startDate: "2024-06-01", online: true, avatarColor: C.navy },
  { id: "EMP-10002", name: "Edith Sanga", role: "Chief Financial Officer", cadre: "Executive", department: "Finance",
    tenant: "MUH-DSM-01", email: "edith.sanga@beyu.health", phone: "+255 754 100 002",
    credential: { type: "CPA (T)", number: "CPA-2010-2284", expires: "2027-12-31", status: "Active" },
    shift: "DAY", leaveBalance: 22, cpdHours: 42, cpdRequired: 40, esopGrant: 90000, startDate: "2024-08-12", online: false, avatarColor: C.gold, managerId: "EMP-10001" },
  { id: "EMP-10003", name: "Dr. M. Achieng", role: "Chief Medical Officer", cadre: "Executive", department: "Clinical",
    tenant: "MUH-DSM-01", email: "m.achieng@beyu.health", phone: "+255 754 100 003",
    credential: { type: "MCT Specialist", number: "MD-S-2015-882", expires: "2028-03-04", status: "Active" },
    shift: "DAY", leaveBalance: 14, cpdHours: 64, cpdRequired: 50, esopGrant: 120000, startDate: "2024-08-12", online: true, avatarColor: C.rose, managerId: "EMP-10001" },
  { id: "EMP-10004", name: "Daniel Kessy", role: "Chief Technology Officer", cadre: "Executive", department: "Digital",
    tenant: "MUH-DSM-01", email: "d.kessy@beyu.health", phone: "+255 754 100 004",
    shift: "DAY", leaveBalance: 16, cpdHours: 32, cpdRequired: 0, esopGrant: 80000, startDate: "2024-09-01", online: true, avatarColor: C.violet, managerId: "EMP-10001" },

  // Doctors
  { id: "EMP-10010", name: "Dr. Neema Mwangi", role: "Medical Officer · OPD", cadre: "Doctor", department: "OPD",
    tenant: "MUH-DSM-01", email: "n.mwangi@beyu.health", phone: "+255 754 100 010",
    credential: { type: "MCT License", number: "MD-2019-4412", expires: "2026-08-15", status: "Expiring" },
    shift: "DAY", leaveBalance: 21, cpdHours: 28, cpdRequired: 40, startDate: "2024-09-12", online: true, avatarColor: C.indigo, managerId: "EMP-10003" },
  { id: "EMP-10011", name: "Dr. Halima Omar", role: "Pediatrician", cadre: "Doctor", department: "Pediatrics",
    tenant: "MUH-DSM-01", email: "h.omar@beyu.health", phone: "+255 754 100 011",
    credential: { type: "MCT Specialist", number: "MD-S-2017-1182", expires: "2027-06-22", status: "Active" },
    shift: "DAY", leaveBalance: 19, cpdHours: 38, cpdRequired: 50, startDate: "2024-10-01", online: true, avatarColor: C.rose, managerId: "EMP-10003" },
  { id: "EMP-10012", name: "Dr. R. Mhina", role: "Intensivist", cadre: "Doctor", department: "ICU",
    tenant: "MUH-DSM-01", email: "r.mhina@beyu.health", phone: "+255 754 100 012",
    credential: { type: "MCT Specialist", number: "MD-S-2014-0721", expires: "2028-01-18", status: "Active" },
    shift: "ON-CALL", leaveBalance: 11, cpdHours: 52, cpdRequired: 50, startDate: "2024-10-12", online: true, avatarColor: C.navy, managerId: "EMP-10003" },
  { id: "EMP-10013", name: "Dr. Salim Said", role: "Dentist", cadre: "Doctor", department: "Dental",
    tenant: "MUH-DSM-01", email: "s.said@beyu.health", phone: "+255 754 100 013",
    credential: { type: "MCT License", number: "DD-2018-2241", expires: "2026-05-30", status: "Expiring" },
    shift: "DAY", leaveBalance: 24, cpdHours: 18, cpdRequired: 40, esopGrant: 50000, startDate: "2025-01-15", online: false, avatarColor: C.cyan, managerId: "EMP-10003" },

  // Nurses
  { id: "EMP-10020", name: "Grace Mushi", role: "Senior Nurse · Ward A", cadre: "Nurse", department: "Ward A",
    tenant: "MUH-DSM-01", email: "g.mushi@beyu.health", phone: "+255 754 100 020",
    credential: { type: "TNMC License", number: "RN-2015-9214", expires: "2027-04-30", status: "Active" },
    shift: "DAY", leaveBalance: 16, cpdHours: 30, cpdRequired: 30, esopGrant: 30000, startDate: "2024-11-01", online: true, avatarColor: C.sage, managerId: "EMP-10003" },
  { id: "EMP-10021", name: "Mary Joseph", role: "Nurse · ICU", cadre: "Nurse", department: "ICU",
    tenant: "MUH-DSM-01", email: "m.joseph@beyu.health", phone: "+255 754 100 021",
    credential: { type: "TNMC License", number: "RN-2018-7712", expires: "2027-09-12", status: "Active" },
    shift: "NIGHT", leaveBalance: 18, cpdHours: 22, cpdRequired: 30, startDate: "2025-02-15", online: true, avatarColor: C.indigo, managerId: "EMP-10020" },
  { id: "EMP-10022", name: "Asha Ramadhani", role: "Nurse · Theatre", cadre: "Nurse", department: "Theatre",
    tenant: "MUH-DSM-01", email: "a.ramadhani@beyu.health", phone: "+255 754 100 022",
    credential: { type: "TNMC + Scrub Cert", number: "RN-2016-3324", expires: "2026-11-04", status: "Active" },
    shift: "DAY", leaveBalance: 20, cpdHours: 28, cpdRequired: 30, startDate: "2025-03-01", online: true, avatarColor: C.amber, managerId: "EMP-10020" },
  { id: "EMP-10023", name: "Tumaini Mtui", role: "Nurse · Maternity", cadre: "Nurse", department: "Maternity",
    tenant: "MUH-DSM-01", email: "t.mtui@beyu.health", phone: "+255 754 100 023",
    credential: { type: "TNMC + Midwife", number: "RN-M-2017-2014", expires: "2027-02-28", status: "Active" },
    shift: "DAY", leaveBalance: 12, cpdHours: 32, cpdRequired: 30, startDate: "2025-04-01", online: true, avatarColor: C.rose, managerId: "EMP-10020" },
  { id: "EMP-10024", name: "Anna Komba", role: "Nurse · ER", cadre: "Nurse", department: "Emergency",
    tenant: "MUH-DSM-01", email: "a.komba@beyu.health", phone: "+255 754 100 024",
    credential: { type: "TNMC + ACLS", number: "RN-2019-5544", expires: "2026-12-31", status: "Active" },
    shift: "NIGHT", leaveBalance: 15, cpdHours: 26, cpdRequired: 30, startDate: "2025-05-10", online: true, avatarColor: C.violet, managerId: "EMP-10020" },

  // Allied
  { id: "EMP-10030", name: "Ahmed Bakari", role: "Chief Pharmacist", cadre: "Allied", department: "Pharmacy",
    tenant: "MUH-DSM-01", email: "a.bakari@beyu.health", phone: "+255 754 100 030",
    credential: { type: "PCT License", number: "PH-2014-1827", expires: "2027-10-12", status: "Active" },
    shift: "DAY", leaveBalance: 22, cpdHours: 36, cpdRequired: 30, esopGrant: 25000, startDate: "2024-12-01", online: true, avatarColor: C.gold, managerId: "EMP-10001" },
  { id: "EMP-10031", name: "Fatma Karim", role: "Dispensing Pharmacist", cadre: "Allied", department: "Pharmacy",
    tenant: "MUH-DSM-01", email: "f.karim@beyu.health", phone: "+255 754 100 031",
    credential: { type: "PCT License", number: "PH-2020-3309", expires: "2027-03-19", status: "Active" },
    shift: "DAY", leaveBalance: 18, cpdHours: 24, cpdRequired: 30, startDate: "2025-06-01", online: true, avatarColor: C.teal, managerId: "EMP-10030" },
  { id: "EMP-10032", name: "Lucy Mtui", role: "Lab Technologist", cadre: "Allied", department: "Laboratory",
    tenant: "MUH-DSM-01", email: "l.mtui@beyu.health", phone: "+255 754 100 032",
    credential: { type: "HLB License", number: "MLS-2017-2241", expires: "2027-08-04", status: "Active" },
    shift: "DAY", leaveBalance: 20, cpdHours: 30, cpdRequired: 30, startDate: "2024-12-15", online: true, avatarColor: C.cyan, managerId: "EMP-10001" },
  { id: "EMP-10033", name: "Peter Kileo", role: "Senior Radiographer", cadre: "Allied", department: "Radiology",
    tenant: "MUH-DSM-01", email: "p.kileo@beyu.health", phone: "+255 754 100 033",
    credential: { type: "HLB License", number: "RAD-2016-1140", expires: "2027-05-22", status: "Active" },
    shift: "DAY", leaveBalance: 17, cpdHours: 28, cpdRequired: 30, startDate: "2025-01-04", online: true, avatarColor: C.violet, managerId: "EMP-10001" },

  // Admin / Support
  { id: "EMP-10040", name: "Halima Said", role: "HR Director", cadre: "Admin", department: "Human Resources",
    tenant: "MUH-DSM-01", email: "h.said@beyu.health", phone: "+255 754 100 040",
    shift: "DAY", leaveBalance: 21, cpdHours: 20, cpdRequired: 20, startDate: "2024-09-01", online: true, avatarColor: C.amber, managerId: "EMP-10001" },
  { id: "EMP-10041", name: "Joseph Tesha", role: "General Counsel", cadre: "Admin", department: "Legal",
    tenant: "MUH-DSM-01", email: "j.tesha@beyu.health", phone: "+255 754 100 041",
    shift: "DAY", leaveBalance: 19, cpdHours: 24, cpdRequired: 20, startDate: "2024-10-01", online: true, avatarColor: C.navy, managerId: "EMP-10001" },
  { id: "EMP-10042", name: "Edward Kileo", role: "Chief Operating Officer", cadre: "Executive", department: "Operations",
    tenant: "MUH-DSM-01", email: "e.kileo@beyu.health", phone: "+255 754 100 042",
    shift: "DAY", leaveBalance: 18, cpdHours: 22, cpdRequired: 20, esopGrant: 70000, startDate: "2024-08-15", online: true, avatarColor: C.sage, managerId: "EMP-10001" },
];

// ─────────────────────────── Helpers ───────────────────────────

export function byId(id: string) { return EMPLOYEES.find((e) => e.id === id); }
export function byName(name: string) { return EMPLOYEES.find((e) => e.name === name || e.name.includes(name)); }
export function byDepartment(dept: string) { return EMPLOYEES.filter((e) => e.department === dept); }
export function byCadre(c: Employee["cadre"]) { return EMPLOYEES.filter((e) => e.cadre === c); }

export function onShift(shift: ShiftCode = "DAY") {
  return EMPLOYEES.filter((e) => e.shift === shift && e.online);
}

export function expiringCredentials(daysAhead = 90) {
  const now = new Date("2026-05-04");
  return EMPLOYEES.filter((e) => {
    if (!e.credential) return false;
    const exp = new Date(e.credential.expires);
    const diff = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= daysAhead;
  });
}

export function shiftLabel(s: ShiftCode): string {
  return { DAY: "Day", NIGHT: "Night", "ON-CALL": "On-Call", OFF: "Off", LEAVE: "Leave" }[s];
}

export function shiftColor(s: ShiftCode): string {
  return ({ DAY: "#557345", NIGHT: "#1E3A8A", "ON-CALL": "#b45309", OFF: "#94a3b8", LEAVE: "#7c3aed" } as Record<ShiftCode, string>)[s];
}

export const HR_KPIS = {
  headcount: EMPLOYEES.length,
  doctors: byCadre("Doctor").length + byCadre("Executive").filter(e => e.role.toLowerCase().includes("medical")).length,
  nurses: byCadre("Nurse").length,
  allied: byCadre("Allied").length,
  onShiftToday: onShift("DAY").length,
  onLeaveToday: EMPLOYEES.filter((e) => e.shift === "LEAVE").length,
  credentialsExpiring: expiringCredentials(90).length,
  cpdCompliant: EMPLOYEES.filter((e) => e.cpdRequired > 0 && e.cpdHours >= e.cpdRequired).length,
};
