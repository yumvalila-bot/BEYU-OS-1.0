import { I } from "./Icons";
import {
  type Employee, type ShiftCode,
  EMPLOYEES, byId, byDepartment, onShift, shiftLabel, shiftColor, expiringCredentials,
} from "../services/hr";

/* ─────────────────────── Avatar ─────────────────────── */

export function StaffAvatar({ e, size = 32, ring = false }: { e: Employee; size?: number; ring?: boolean }) {
  const initials = e.name.replace(/^Dr\.\s*/, "").split(" ").map((n) => n[0]).slice(0, 2).join("");
  return (
    <div
      className={`relative rounded-full text-white flex items-center justify-center font-semibold shrink-0 ${ring ? "ring-2 ring-gold-400/40" : ""}`}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${e.avatarColor}, ${e.avatarColor}cc)`, fontSize: size * 0.36 }}
      title={e.name}
    >
      {initials}
      {e.online && (
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
      )}
    </div>
  );
}

/* ─────────────────────── Chip (inline employee reference) ─────────────────────── */

export function StaffChip({ e, sub }: { e: Employee | undefined; sub?: string }) {
  if (!e) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 transition cursor-pointer">
      <StaffAvatar e={e} size={20} />
      <span className="text-xs">
        <span className="font-medium text-navy-800">{e.name}</span>
        {sub && <span className="text-slate-500"> · {sub}</span>}
      </span>
    </span>
  );
}

/* ─────────────────────── Compact actor link (for audit / signatures) ─────────────────────── */

export function StaffActor({ id, action }: { id: string; action?: string }) {
  const e = byId(id);
  if (!e) return <span className="text-xs font-mono text-slate-500">{id}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <StaffAvatar e={e} size={18} />
      <span className="text-xs font-medium text-navy-800">{e.name}</span>
      {action && <span className="text-[10px] text-slate-500">· {action}</span>}
    </span>
  );
}

/* ─────────────────────── Shift badge ─────────────────────── */

export function ShiftBadge({ shift }: { shift: ShiftCode }) {
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background: shiftColor(shift) }}>
      {shiftLabel(shift).toUpperCase()}
    </span>
  );
}

/* ─────────────────────── Credential badge ─────────────────────── */

export function CredentialBadge({ e }: { e: Employee }) {
  if (!e.credential) return null;
  const c = e.credential;
  const color =
    c.status === "Active" ? "bg-emerald-100 text-emerald-700" :
    c.status === "Expiring" ? "bg-amber-100 text-amber-800" :
    "bg-rose-100 text-rose-700";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${color}`} title={`${c.type} · ${c.number} · expires ${c.expires}`}>
      ✓ {c.type}
    </span>
  );
}

/* ─────────────────────── Team Roster card (for clinical screens) ─────────────────────── */

export function TeamRoster({ department, title, max = 6 }: { department: string; title?: string; max?: number }) {
  const team = byDepartment(department).slice(0, max);
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-display text-lg text-navy-800">{title || `${department} Team`}</div>
          <div className="text-xs text-slate-500">{team.filter((e) => e.online).length} on duty · {team.length} total</div>
        </div>
        <button className="text-xs text-gold-700 hover:underline font-semibold">View HR →</button>
      </div>
      <div className="space-y-2">
        {team.map((e) => (
          <div key={e.id} className="flex items-center gap-3 p-2 rounded hover:bg-slate-50">
            <StaffAvatar e={e} size={36} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-navy-800 truncate">{e.name}</div>
              <div className="text-[11px] text-slate-500 truncate">{e.role}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <ShiftBadge shift={e.shift} />
              {e.credential && (
                <span className={`text-[9px] tracking-wider ${
                  e.credential.status === "Active" ? "text-emerald-600" :
                  e.credential.status === "Expiring" ? "text-amber-600" : "text-rose-600"
                }`}>{e.credential.status.toUpperCase()}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────── Shift Coverage strip (small) ─────────────────────── */

export function ShiftCoverage({ department }: { department: string }) {
  const team = byDepartment(department);
  const day = team.filter((e) => e.shift === "DAY").length;
  const night = team.filter((e) => e.shift === "NIGHT").length;
  const oncall = team.filter((e) => e.shift === "ON-CALL").length;
  const off = team.filter((e) => e.shift === "OFF" || e.shift === "LEAVE").length;
  const total = team.length;

  return (
    <div className="card p-4">
      <div className="text-[10px] tracking-widest text-slate-500 mb-2">SHIFT COVERAGE · {department.toUpperCase()}</div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { l: "Day", v: day, c: "#557345" },
          { l: "Night", v: night, c: "#1E3A8A" },
          { l: "On-Call", v: oncall, c: "#b45309" },
          { l: "Off / Leave", v: off, c: "#94a3b8" },
        ].map((s) => (
          <div key={s.l} className="rounded bg-slate-50 py-2">
            <div className="font-display text-lg" style={{ color: s.c }}>{s.v}</div>
            <div className="text-[10px] text-slate-500">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-slate-400 mt-2 text-center">{total} staff assigned to this department</div>
    </div>
  );
}

/* ─────────────────────── Witnessed Dispense (HR-aware) ─────────────────────── */

export function WitnessRequired({ controlled = false }: { controlled?: boolean }) {
  const pharmacists = EMPLOYEES.filter((e) => e.cadre === "Allied" && e.department === "Pharmacy" && e.online);
  if (!controlled) return null;
  return (
    <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 text-xs">
      <div className="flex items-center gap-2 text-violet-700 font-semibold mb-2">
        <I.shield size={14} stroke="#7c3aed" /> CONTROLLED · WITNESS REQUIRED
      </div>
      <div className="text-slate-700">
        Choose a second pharmacist to co-sign:
      </div>
      <div className="flex gap-2 mt-2 flex-wrap">
        {pharmacists.map((p) => (
          <button key={p.id} className="flex items-center gap-1.5 px-2 py-1 rounded bg-white border border-violet-200 hover:bg-violet-100">
            <StaffAvatar e={p} size={18} />
            <span className="text-[11px] text-navy-800">{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────── Surgical Team for Theatre ─────────────────────── */

export function SurgicalTeam() {
  const surgeon = byId("EMP-10003"); // Achieng
  const anaesthetist = byId("EMP-10012"); // Mhina
  const scrub = byId("EMP-10022"); // Asha (theatre nurse)
  const runner = byId("EMP-10024");
  return (
    <div className="card p-5">
      <div className="font-display text-lg text-navy-800 mb-3">Surgical Team — Current Case</div>
      <div className="space-y-2">
        {[
          { role: "Surgeon", e: surgeon },
          { role: "Anaesthetist", e: anaesthetist },
          { role: "Scrub Nurse", e: scrub },
          { role: "Circulating Nurse", e: runner },
        ].map((r) => r.e && (
          <div key={r.role} className="flex items-center gap-3 p-2 rounded bg-slate-50">
            <StaffAvatar e={r.e} size={32} />
            <div className="flex-1">
              <div className="text-[10px] tracking-widest text-slate-500">{r.role.toUpperCase()}</div>
              <div className="text-sm font-semibold text-navy-800">{r.e.name}</div>
            </div>
            <CredentialBadge e={r.e} />
          </div>
        ))}
      </div>
      <div className="mt-3 text-[10px] text-slate-400">All team members credentialed & briefed · WHO checklist active</div>
    </div>
  );
}

/* ─────────────────────── My HR Widget (for Patient Profile / Settings) ─────────────────────── */

export function MyHRPanel({ id }: { id: string }) {
  const e = byId(id) || EMPLOYEES[0];
  return (
    <div className="card p-5">
      <div className="font-display text-lg text-navy-800 mb-3">My HR</div>
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded bg-slate-50 p-3">
            <div className="font-display text-xl text-navy-800">{e.leaveBalance}</div>
            <div className="text-[10px] tracking-widest text-slate-500">LEAVE DAYS</div>
          </div>
          <div className="rounded bg-slate-50 p-3">
            <div className="font-display text-xl" style={{ color: e.cpdHours >= e.cpdRequired ? "#059669" : "#b45309" }}>
              {e.cpdHours}/{e.cpdRequired}
            </div>
            <div className="text-[10px] tracking-widest text-slate-500">CPD HOURS</div>
          </div>
          <div className="rounded bg-slate-50 p-3">
            <div className="font-display text-xl text-violet-700">{e.esopGrant ? `${(e.esopGrant / 1000).toFixed(0)}k` : "—"}</div>
            <div className="text-[10px] tracking-widest text-slate-500">ESOP OPTIONS</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-outline text-xs !py-2">Request Leave</button>
          <button className="btn-outline text-xs !py-2">Download Payslip</button>
          <button className="btn-outline text-xs !py-2">CPD Log</button>
          <button className="btn-primary text-xs !py-2">My Contract</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── Credential Expiry Banner (universal warning) ─────────────────────── */

export function CredentialAlertBanner() {
  const exp = expiringCredentials(90);
  if (exp.length === 0) return null;
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
      <I.warning size={18} stroke="#b45309" />
      <div className="flex-1 text-sm text-amber-900">
        <strong>HR alert:</strong> {exp.length} staff credentials expire within 90 days.
      </div>
      <div className="flex -space-x-2">
        {exp.slice(0, 5).map((e) => <StaffAvatar key={e.id} e={e} size={26} ring />)}
      </div>
      <button className="text-xs text-amber-800 font-semibold hover:underline">Review →</button>
    </div>
  );
}

/* ─────────────────────── On-Duty Strip (for clinical headers) ─────────────────────── */

export function OnDutyStrip({ department }: { department?: string }) {
  const team = department ? byDepartment(department).filter((e) => e.online) : onShift("DAY").slice(0, 8);
  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-navy-800 text-white">
      <I.users size={16} stroke="#D4AF37" />
      <span className="text-[10px] tracking-widest text-white/60">ON DUTY{department ? ` · ${department.toUpperCase()}` : ""}</span>
      <div className="flex -space-x-2 flex-1">
        {team.slice(0, 8).map((e) => <StaffAvatar key={e.id} e={e} size={26} ring />)}
        {team.length > 8 && (
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-semibold">
            +{team.length - 8}
          </div>
        )}
      </div>
    </div>
  );
}
