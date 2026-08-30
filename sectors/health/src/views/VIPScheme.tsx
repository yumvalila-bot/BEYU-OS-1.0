import { useState } from "react";
import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { LineChart, BarChart, DonutChart, ProgressBar } from "../components/Charts";
import { Classification } from "../components/Security";
import { StaffChip } from "../components/HRWidgets";
import { byId } from "../services/hr";
import {
  VIP_TIERS, VIP_MEMBERS, VIP_APPOINTMENTS, VIP_PLANS, VIP_SUITES, VIP_KPIS,
  tier, type VIPTier, type VIPMember, type VIPTreatmentPlan,
} from "../services/vip";
import { VIPTierBadge } from "../components/Flow";

/* ═══════════════════════════════════════════════════════════════════════════
   BEYU VIP SCHEME — Comprehensive concierge healthcare programme
   ═══════════════════════════════════════════════════════════════════════════ */

export function VIPSchemeScreen() {
  const [tab, setTab] = useState<"overview" | "members" | "schedule" | "priorities" | "treatment" | "suites" | "billing">("overview");

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="BEYU VIP Scheme"
        subtitle="End-to-end concierge healthcare programme · Platinum · Gold · Silver"
        actions={
          <>
            <Classification level="CONFIDENTIAL" />
            <button className="btn-outline text-sm">Brochure</button>
            <button className="btn-gold text-sm">+ Enrol VIP Member</button>
          </>
        }
      />

      {/* HERO */}
      <div className="card p-6 mb-6 relative overflow-hidden text-white">
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0B1D3A 0%, #1E3A8A 50%, #b48a24 100%)" }} />
        <div className="absolute inset-0 bg-dot opacity-15" />
        <div className="relative grid lg:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <div className="text-[11px] tracking-[0.4em] text-gold-400 font-bold flex items-center gap-2">
              <I.star size={14} stroke="#D4AF37" /> BEYU VIP SCHEME · DIPLOMATIC-GRADE CARE
            </div>
            <h2 className="font-display text-4xl mt-2">
              When time, privacy & precision are <span className="text-gold-400">non-negotiable</span>
            </h2>
            <p className="text-white/75 mt-3 max-w-2xl text-sm">
              An invitation-only health membership combining the BEYU Hive AI clinical platform with
              personal concierge, executive suites, global second opinions, air-medevac and annual
              executive medicals.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              {VIP_TIERS.map(t => <VIPTierBadge key={t.id} tier={t.label as "Platinum" | "Gold" | "Silver"} />)}
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">Invitation only</span>
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/15">24/7 Concierge</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center min-w-[280px]">
            {[
              { l: "Members", v: VIP_KPIS.totalMembers.toString() },
              { l: "Active", v: VIP_KPIS.active.toString() },
              { l: "Suites Occupancy", v: `${VIP_KPIS.suitesOccupancy}%` },
              { l: "Satisfaction", v: `${VIP_KPIS.satisfactionScore}%` },
              { l: "LTV (TZS M)", v: VIP_KPIS.totalLTV.toFixed(0) },
              { l: "Avg Wait", v: `${VIP_KPIS.avgWaitMin}m` },
            ].map(s => (
              <div key={s.l} className="rounded-lg bg-white/10 border border-white/15 px-3 py-2">
                <div className="font-display text-xl text-gold-300">{s.v}</div>
                <div className="text-[9px] tracking-widest text-white/60 mt-0.5">{s.l.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-5">
        {[
          { id: "overview", l: "Scheme Overview" },
          { id: "members", l: "Members" },
          { id: "schedule", l: "VIP Schedule" },
          { id: "priorities", l: "Priorities & Fast-Track" },
          { id: "treatment", l: "Treatment Plans" },
          { id: "suites", l: "Suites & Rooms" },
          { id: "billing", l: "Membership Billing" },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-3 py-2 rounded-md text-xs font-semibold transition ${tab === t.id ? "bg-white text-navy-800 shadow" : "text-slate-500"}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "members" && <MembersTab />}
      {tab === "schedule" && <ScheduleTab />}
      {tab === "priorities" && <PrioritiesTab />}
      {tab === "treatment" && <TreatmentTab />}
      {tab === "suites" && <SuitesTab />}
      {tab === "billing" && <BillingTab />}
    </div>
  );
}

/* ─────────────────── Overview ─────────────────── */

function OverviewTab() {
  return (
    <>
      {/* The 3 Tiers */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {VIP_TIERS.map(t => (
          <div key={t.id} className="card overflow-hidden">
            <div className="p-6 text-white relative" style={{ background: t.gradient }}>
              <div className="absolute inset-0 bg-dot opacity-15" />
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] tracking-[0.3em] font-bold text-white/80">{t.label.toUpperCase()} TIER</div>
                  <I.star size={20} stroke="#D4AF37" />
                </div>
                <div className="font-display text-2xl">{t.label}</div>
                <div className="text-sm italic text-white/85 mt-0.5">{t.tagline}</div>
                <div className="mt-4">
                  <div className="text-[10px] text-white/60 tracking-widest">ANNUAL FEE</div>
                  <div className="font-display text-2xl text-gold-300">{t.annualFee}</div>
                  <div className="text-[10px] text-white/60 mt-1">+ {t.setupFee} setup</div>
                </div>
              </div>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-600 mb-3">{t.description}</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="rounded bg-slate-50 px-2 py-2 text-center">
                  <div className="font-display text-base" style={{ color: t.color }}>≤ {t.slaWaitMin}m</div>
                  <div className="text-[9px] tracking-widest text-slate-500">WAIT SLA</div>
                </div>
                <div className="rounded bg-slate-50 px-2 py-2 text-center">
                  <div className="font-display text-base" style={{ color: t.color }}>{t.maxDependents}</div>
                  <div className="text-[9px] tracking-widest text-slate-500">DEPENDENTS</div>
                </div>
                <div className="rounded bg-slate-50 px-2 py-2 text-center">
                  <div className="font-display text-base" style={{ color: t.color }}>{t.benefits.length}</div>
                  <div className="text-[9px] tracking-widest text-slate-500">BENEFITS</div>
                </div>
              </div>
              <div className="text-[10px] tracking-widest text-slate-500 font-semibold mb-2">INCLUDES</div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {t.benefits.map(b => (
                  <div key={b} className="flex items-start gap-2 text-xs">
                    <I.check size={11} stroke={t.color} className="mt-0.5 shrink-0" />
                    <span className="text-slate-700">{b}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Scheme KPIs */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { l: "Platinum Members", v: VIP_KPIS.platinum, c: "#0B1D3A" },
          { l: "Gold Members", v: VIP_KPIS.gold, c: "#D4AF37" },
          { l: "Silver Members", v: VIP_KPIS.silver, c: "#94a3b8" },
          { l: "Expiring < 30 days", v: VIP_KPIS.expiringSoon, c: "#b45309" },
        ].map(k => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Member Tier Distribution</div>
          <div className="flex justify-center">
            <DonutChart value={VIP_KPIS.totalMembers} max={50} label="MEMBERS" color="#D4AF37" />
          </div>
          <div className="space-y-1.5 mt-3 text-xs">
            {VIP_TIERS.map(t => (
              <div key={t.id} className="flex items-center gap-2">
                <span className="w-2 h-5 rounded" style={{ background: t.color }} />
                <span className="flex-1 text-slate-700">{t.label}</span>
                <span className="font-mono font-bold text-navy-800">{VIP_MEMBERS.filter(m => m.tier === t.id).length}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">VIP Revenue (12-mo · TZS M)</div>
          <LineChart
            data={[
              { m: "Jun", v: 42 }, { m: "Jul", v: 48 }, { m: "Aug", v: 54 }, { m: "Sep", v: 62 },
              { m: "Oct", v: 71 }, { m: "Nov", v: 82 }, { m: "Dec", v: 96 }, { m: "Jan", v: 102 },
              { m: "Feb", v: 108 }, { m: "Mar", v: 124 }, { m: "Apr", v: 138 }, { m: "May", v: 142 },
            ]}
            height={180} color="#D4AF37"
          />
          <div className="text-[11px] text-slate-500 mt-1">Recurring + service revenue from VIP members</div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Today's VIP Operations</div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2 rounded bg-slate-50">
              <span className="text-slate-600">Appointments today</span>
              <span className="font-mono font-bold text-navy-800">{VIP_KPIS.apptsToday}</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-slate-50">
              <span className="text-slate-600">In suites now</span>
              <span className="font-mono font-bold text-navy-800">{VIP_SUITES.filter(s => s.status === "OCCUPIED").length}</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-slate-50">
              <span className="text-slate-600">Active treatment plans</span>
              <span className="font-mono font-bold text-navy-800">{VIP_KPIS.activePlans}</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-slate-50">
              <span className="text-slate-600">Served today (cumulative)</span>
              <span className="font-mono font-bold text-navy-800">{VIP_KPIS.servedToday}</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-emerald-50">
              <span className="text-emerald-700">Avg wait time</span>
              <span className="font-mono font-bold text-emerald-700">{VIP_KPIS.avgWaitMin} min</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-emerald-50">
              <span className="text-emerald-700">Satisfaction score</span>
              <span className="font-mono font-bold text-emerald-700">{VIP_KPIS.satisfactionScore}%</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────── Members ─────────────────── */

function MembersTab() {
  const [filter, setFilter] = useState<VIPTier | "ALL" | "EXPIRING">("ALL");
  const [selected, setSelected] = useState<VIPMember | null>(null);
  const list = VIP_MEMBERS.filter(m => filter === "ALL" || (filter === "EXPIRING" ? m.status === "EXPIRING" || m.status === "EXPIRED" : m.tier === filter));

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFilter("ALL")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === "ALL" ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-600"}`}
        >All · {VIP_MEMBERS.length}</button>
        {VIP_TIERS.map(t => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${filter === t.id ? "text-white" : "bg-slate-100 text-slate-700"}`}
            style={filter === t.id ? { background: t.color } : undefined}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: filter === t.id ? "#fff" : t.color }} />
            {t.label} · {VIP_MEMBERS.filter(m => m.tier === t.id).length}
          </button>
        ))}
        <button
          onClick={() => setFilter("EXPIRING")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === "EXPIRING" ? "bg-amber-600 text-white" : "bg-amber-100 text-amber-700"}`}
        >⚠ Expiring · {VIP_MEMBERS.filter(m => m.status === "EXPIRING" || m.status === "EXPIRED").length}</button>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-2">
          {list.map(m => {
            const tdef = tier(m.tier);
            const coordinator = byId(m.coordinatorId);
            const active = selected?.id === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setSelected(m)}
                className={`card text-left p-4 hover:-translate-y-0.5 transition w-full ${active ? "ring-2 ring-gold-400" : ""}`}
                style={{ borderLeftColor: tdef.color, borderLeftWidth: 4 }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl text-white flex items-center justify-center font-display text-lg font-bold shrink-0" style={{ background: tdef.gradient }}>
                    {m.name.split(" ").slice(-1)[0][0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display text-base text-navy-800">{m.name}</span>
                      <VIPTierBadge tier={m.tier === "PLATINUM" ? "Platinum" : m.tier === "GOLD" ? "Gold" : "Silver"} />
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold tracking-widest ${
                        m.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" :
                        m.status === "EXPIRING" ? "bg-amber-100 text-amber-700" :
                        m.status === "EXPIRED" ? "bg-rose-100 text-rose-700" :
                        "bg-violet-100 text-violet-700"
                      }`}>{m.status}</span>
                      {m.flags?.map(f => (
                        <span key={f} className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold">{f}</span>
                      ))}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-1">{m.id} · {m.mrn}</div>
                    <div className="text-[11px] text-slate-600 mt-0.5">{m.organization}</div>
                    <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
                      <div><span className="text-slate-500">Visits:</span> <span className="font-mono text-navy-800 font-semibold">{m.totalVisits}</span></div>
                      <div><span className="text-slate-500">LTV:</span> <span className="font-mono text-gold-700 font-semibold">{m.lifetimeValueM.toFixed(1)}M</span></div>
                      <div><span className="text-slate-500">Deps:</span> <span className="font-mono text-navy-800 font-semibold">{m.dependents}</span></div>
                      <div><span className="text-slate-500">Expires:</span> <span className="font-mono text-navy-800 text-[10px]">{m.expires}</span></div>
                    </div>
                    {m.nextAppt && (
                      <div className="mt-2 text-[10px] text-gold-700 flex items-center gap-1">
                        <I.calendar size={9} stroke="#b48a24" /> {m.nextAppt.date} · {m.nextAppt.service}
                      </div>
                    )}
                    {coordinator && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] text-slate-500">CONCIERGE:</span>
                        <StaffChip e={coordinator} />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Member Detail Panel */}
        <div className="card p-5 h-fit lg:sticky lg:top-20">
          {selected ? <MemberDetail member={selected} /> : (
            <div className="text-center py-10">
              <I.user size={32} stroke="#cbd5e1" className="mx-auto mb-2" />
              <div className="text-sm text-slate-500">Select a member to view details</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MemberDetail({ member }: { member: VIPMember }) {
  const tdef = tier(member.tier);
  const coordinator = byId(member.coordinatorId);
  const appts = VIP_APPOINTMENTS.filter(a => a.memberId === member.id);
  const plans = VIP_PLANS.filter(p => p.memberId === member.id);

  return (
    <div>
      <div className="text-center mb-4">
        <div className="w-20 h-20 mx-auto rounded-2xl text-white flex items-center justify-center font-display text-3xl font-bold mb-2" style={{ background: tdef.gradient }}>
          {member.name.split(" ").slice(-1)[0][0]}
        </div>
        <div className="font-display text-lg text-navy-800">{member.name}</div>
        <div className="text-xs text-slate-500">{member.organization}</div>
        <div className="mt-2"><VIPTierBadge tier={member.tier === "PLATINUM" ? "Platinum" : member.tier === "GOLD" ? "Gold" : "Silver"} /></div>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded bg-slate-50 p-2"><div className="text-[10px] text-slate-500">VIP ID</div><div className="font-mono text-navy-800">{member.id}</div></div>
          <div className="rounded bg-slate-50 p-2"><div className="text-[10px] text-slate-500">MRN</div><div className="font-mono text-navy-800">{member.mrn}</div></div>
          <div className="rounded bg-slate-50 p-2"><div className="text-[10px] text-slate-500">Joined</div><div className="font-mono text-navy-800">{member.joined}</div></div>
          <div className="rounded bg-slate-50 p-2"><div className="text-[10px] text-slate-500">Expires</div><div className="font-mono text-navy-800">{member.expires}</div></div>
        </div>

        <div className="rounded bg-gold-50 border border-gold-200 p-3">
          <div className="text-[10px] tracking-widest text-gold-700 mb-1">CONCIERGE</div>
          {coordinator && <StaffChip e={coordinator} sub="Available 24/7 for Platinum" />}
        </div>

        <div>
          <div className="text-[10px] tracking-widest text-slate-500 mb-1">PREFERENCES</div>
          <div className="space-y-1">
            {member.preferences.map(p => (
              <div key={p} className="text-xs flex items-center gap-1.5"><I.check size={10} stroke="#059669" />{p}</div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] tracking-widest text-slate-500 mb-1">CONTACT</div>
          <div className="text-xs text-navy-800">📞 {member.emergencyContact}</div>
          <div className="text-xs text-slate-600 mt-1">🗣 {member.language}</div>
        </div>

        {appts.length > 0 && (
          <div>
            <div className="text-[10px] tracking-widest text-slate-500 mb-1">UPCOMING APPOINTMENTS</div>
            <div className="space-y-1">
              {appts.slice(0, 3).map(a => (
                <div key={a.id} className="text-xs p-2 rounded border border-slate-100">
                  <div className="font-semibold text-navy-800">{a.service}</div>
                  <div className="text-[10px] text-slate-500">{a.date} {a.time} · {a.location}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {plans.length > 0 && (
          <div>
            <div className="text-[10px] tracking-widest text-slate-500 mb-1">ACTIVE PLANS</div>
            {plans.map(p => (
              <div key={p.id} className="text-xs p-2 rounded border border-slate-100">
                <div className="font-semibold text-navy-800">{p.diagnosis}</div>
                <div className="text-[10px] text-slate-500">{p.milestones.filter(m => m.done).length}/{p.milestones.length} milestones</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-3 border-t border-slate-100">
          <button className="btn-outline text-xs !py-2 flex-1">Open Chart</button>
          <button className="btn-gold text-xs !py-2 flex-1">+ Book</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── Schedule ─────────────────── */

function ScheduleTab() {
  const days = ["Mon 04 May", "Tue 05 May", "Wed 06 May", "Thu 07 May", "Fri 08 May"];
  const todayAppts = VIP_APPOINTMENTS.filter(a => a.date === "2026-05-04");

  return (
    <>
      <div className="grid md:grid-cols-4 gap-4 mb-4">
        {[
          { l: "Today's Appts", v: todayAppts.length },
          { l: "This Week", v: VIP_APPOINTMENTS.length },
          { l: "In Progress", v: VIP_APPOINTMENTS.filter(a => a.status === "IN-PROGRESS").length },
          { l: "Awaiting Confirmation", v: VIP_APPOINTMENTS.filter(a => a.status === "SCHEDULED").length },
        ].map(k => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl text-navy-800 mt-1">{k.v}</div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden mb-4">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="font-display text-lg text-navy-800">VIP Concierge Schedule · Week of 04 May 2026</div>
            <div className="text-xs text-slate-500">All appointments include concierge orchestration</div>
          </div>
          <button className="btn-gold text-xs !py-2 !px-3">+ Book VIP</button>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[100px_repeat(5,1fr)] bg-slate-50 border-b border-slate-100">
              <div className="px-3 py-2.5 text-[10px] tracking-widest text-slate-500">TIME</div>
              {days.map(d => <div key={d} className="px-3 py-2.5 text-xs font-bold text-navy-800 border-l border-slate-100">{d}</div>)}
            </div>
            {["08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00"].map(slot => (
              <div key={slot} className="grid grid-cols-[100px_repeat(5,1fr)] border-b border-slate-50 min-h-[80px]">
                <div className="px-3 py-2 text-xs font-mono text-slate-500">{slot}</div>
                {days.map((d, di) => {
                  const dateStr = `2026-05-${(4 + di).toString().padStart(2, "0")}`;
                  const slotAppts = VIP_APPOINTMENTS.filter(a => a.date === dateStr && a.time.startsWith(slot.split(":")[0]));
                  return (
                    <div key={d} className="border-l border-slate-100 p-1 space-y-1">
                      {slotAppts.map(a => {
                        const m = VIP_MEMBERS.find(mm => mm.id === a.memberId);
                        if (!m) return null;
                        const tdef = tier(m.tier);
                        return (
                          <div
                            key={a.id}
                            className={`rounded p-1.5 border-l-2 text-[10px] ${
                              a.status === "IN-PROGRESS" ? "bg-rose-50 border-l-rose-500" :
                              a.status === "CONFIRMED" ? "bg-gold-50 border-l-gold-500" :
                              "bg-slate-50 border-l-slate-300"
                            }`}
                            style={{ borderLeftColor: tdef.color }}
                          >
                            <div className="font-semibold text-navy-800 truncate">{m.name}</div>
                            <div className="text-slate-500 truncate">{a.service}</div>
                            <div className="text-[9px] text-slate-400 mt-0.5">{a.location}</div>
                            {(a.transportRequested || a.interpreterRequested) && (
                              <div className="text-[8px] text-gold-700 mt-0.5">
                                {a.transportRequested && "🚗"} {a.interpreterRequested && "🗣"}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-3">Today's Concierge Run-Sheet</div>
        <div className="space-y-2">
          {todayAppts.map(a => {
            const m = VIP_MEMBERS.find(mm => mm.id === a.memberId);
            if (!m) return null;
            const doc = byId(a.doctor);
            return (
              <div key={a.id} className="p-4 rounded-xl border border-slate-200 flex items-start gap-3">
                <div className="text-center shrink-0">
                  <div className="font-display text-xl text-navy-800">{a.time}</div>
                  <div className="text-[9px] tracking-widest text-slate-500">{a.duration} MIN</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-navy-800">{m.name}</span>
                    <VIPTierBadge tier={m.tier === "PLATINUM" ? "Platinum" : m.tier === "GOLD" ? "Gold" : "Silver"} />
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      a.status === "IN-PROGRESS" ? "bg-rose-100 text-rose-700" :
                      a.status === "CONFIRMED" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                    }`}>{a.status}</span>
                  </div>
                  <div className="text-sm text-slate-700">{a.service}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">📍 {a.location} {doc && <>· 👨‍⚕️ {doc.name}</>}</div>
                  {a.coordinatorNotes && <div className="text-[11px] text-gold-700 italic mt-1">{a.coordinatorNotes}</div>}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {a.transportRequested && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700">🚗 Transport</span>}
                    {a.interpreterRequested && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">🗣 Interpreter</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ─────────────────── Priorities & Fast-Track ─────────────────── */

function PrioritiesTab() {
  return (
    <>
      <div className="card p-5 mb-4 bg-gradient-to-br from-navy-800 to-navy-900 text-white">
        <div className="text-[11px] tracking-[0.3em] text-gold-400 font-semibold">VIP PRIORITY ROUTING</div>
        <div className="font-display text-2xl mt-1">Every VIP touchpoint is fast-tracked across the platform</div>
        <p className="text-white/70 text-sm mt-2 max-w-2xl">
          When a VIP arrives, the platform automatically prioritizes them at registration, triage, queues, lab,
          radiology, pharmacy and even billing. The Hive AI routes work to dedicated staff and reserves resources.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        {VIP_TIERS.map(t => (
          <div key={t.id} className="card overflow-hidden">
            <div className="px-4 py-3 text-white" style={{ background: t.gradient }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] tracking-widest font-bold">{t.label.toUpperCase()} TIER</div>
                  <div className="font-display text-xl">Wait SLA ≤ {t.slaWaitMin} min</div>
                </div>
                <div className="text-3xl">#{t.priorityRank}</div>
              </div>
            </div>
            <div className="p-4">
              <div className="text-[10px] tracking-widest text-slate-500 font-semibold mb-2">FAST-TRACK ROUTING</div>
              <div className="space-y-1.5 text-xs">
                {[
                  "Auto-skip reception queue",
                  "Dedicated triage nurse paged",
                  "Priority lab specimen tag",
                  "Imaging slot pre-reserved",
                  "Pharmacy fast-counter",
                  "Express discharge & billing",
                ].map(s => (
                  <div key={s} className="flex items-center gap-2">
                    <I.zap size={11} stroke={t.color} />
                    <span className="text-slate-700">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-3">Live VIP Routing Stream</div>
        <div className="space-y-1 text-xs font-mono max-h-[360px] overflow-y-auto">
          {[
            { t: "09:14:32", a: "VIP-0001 · Hon. Salma Kikwete", e: "ARRIVED", r: "South entrance · valet parked", c: "#0B1D3A" },
            { t: "09:14:35", a: "Hive Router", e: "ROUTE", r: "Auto-paged Concierge EMP-10040 + Suite 1 prep", c: "#7c3aed" },
            { t: "09:15:02", a: "Concierge", e: "ESCORTED", r: "To Cardio Suite 1 (3 min total)", c: "#0B1D3A" },
            { t: "09:15:18", a: "Lab Router", e: "TAG", r: "Specimen pre-tagged · express analyzer slot reserved", c: "#7c3aed" },
            { t: "09:17:45", a: "VIP-0002 · Mr. Reginald Mengi", e: "ARRIVED", r: "Private entrance · chef breakfast served", c: "#D4AF37" },
            { t: "09:18:02", a: "Hive Router", e: "ROUTE", r: "Cardio Suite 2 · Echo machine warmed", c: "#7c3aed" },
            { t: "09:18:45", a: "VIP-0003 · Amb. Helen Mtui", e: "CALLBACK", r: "Pre-confirmed tomorrow's executive medical", c: "#0B1D3A" },
            { t: "09:22:14", a: "Pharmacy Router", e: "FAST-PASS", r: "VIP-0004 dispense at Counter VIP (skip 12 queue)", c: "#D4AF37" },
            { t: "09:28:30", a: "Billing Router", e: "EXPRESS", r: "VIP-0002 invoice generated · no cashier queue", c: "#D4AF37" },
            { t: "09:32:12", a: "Imaging Router", e: "RESERVE", r: "MRI slot tomorrow 10:30 held for VIP-0003", c: "#0B1D3A" },
          ].map((r, i) => (
            <div key={i} className="grid grid-cols-[80px_220px_120px_1fr] gap-2 py-1.5 border-b border-slate-50">
              <span className="text-slate-500">{r.t}</span>
              <span className="font-semibold" style={{ color: r.c }}>{r.a}</span>
              <span className="text-violet-700">{r.e}</span>
              <span className="text-slate-600">{r.r}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ─────────────────── Treatment Plans ─────────────────── */

function TreatmentTab() {
  const [selected, setSelected] = useState<VIPTreatmentPlan>(VIP_PLANS[0]);
  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4">
      <div className="space-y-3">
        <div className="text-[10px] tracking-widest text-slate-500 font-semibold">{VIP_PLANS.length} ACTIVE PLANS</div>
        {VIP_PLANS.map(p => {
          const m = VIP_MEMBERS.find(mm => mm.id === p.memberId);
          if (!m) return null;
          const tdef = tier(m.tier);
          const done = p.milestones.filter(x => x.done).length;
          const pct = Math.round((done / p.milestones.length) * 100);
          const active = selected.id === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className={`card text-left p-4 w-full transition ${active ? "ring-2 ring-gold-400" : ""}`}
              style={{ borderLeftColor: tdef.color, borderLeftWidth: 4 }}
            >
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <VIPTierBadge tier={m.tier === "PLATINUM" ? "Platinum" : m.tier === "GOLD" ? "Gold" : "Silver"} />
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                  p.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                }`}>{p.status}</span>
              </div>
              <div className="font-semibold text-sm text-navy-800">{m.name}</div>
              <div className="text-[11px] text-slate-500 italic mt-1">{p.diagnosis}</div>
              <div className="mt-2">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-slate-500">Progress</span>
                  <span className="font-mono text-navy-800">{done}/{p.milestones.length}</span>
                </div>
                <ProgressBar value={pct} color={tdef.color} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        <TreatmentDetail plan={selected} />
      </div>
    </div>
  );
}

function TreatmentDetail({ plan }: { plan: VIPTreatmentPlan }) {
  const m = VIP_MEMBERS.find(mm => mm.id === plan.memberId);
  if (!m) return null;
  const tdef = tier(m.tier);
  const lead = byId(plan.leadPhysician);
  const done = plan.milestones.filter(x => x.done).length;
  const pct = Math.round((done / plan.milestones.length) * 100);

  return (
    <>
      <div className="card overflow-hidden">
        <div className="p-5 text-white relative" style={{ background: tdef.gradient }}>
          <div className="absolute inset-0 bg-dot opacity-15" />
          <div className="relative">
            <div className="text-[10px] tracking-[0.3em] text-gold-300 font-bold">TREATMENT PLAN · {plan.id}</div>
            <div className="font-display text-2xl mt-1">{plan.diagnosis}</div>
            <div className="text-white/85 text-sm mt-1">{m.name} · {m.organization}</div>
            <div className="grid grid-cols-4 gap-3 mt-4">
              <div><div className="text-[10px] text-white/60 tracking-widest">STARTED</div><div className="font-mono text-sm">{plan.startedOn}</div></div>
              <div><div className="text-[10px] text-white/60 tracking-widest">PROGRESS</div><div className="font-display text-lg text-gold-300">{pct}%</div></div>
              <div><div className="text-[10px] text-white/60 tracking-widest">MILESTONES</div><div className="font-display text-lg text-gold-300">{done}/{plan.milestones.length}</div></div>
              <div><div className="text-[10px] text-white/60 tracking-widest">EST. COST</div><div className="font-mono text-sm">TZS {plan.estimatedCostM}M</div></div>
            </div>
          </div>
        </div>
        <div className="p-5">
          <div className="text-[10px] tracking-widest text-slate-500 font-semibold mb-2">LEAD PHYSICIAN</div>
          {lead && <StaffChip e={lead} sub="Plan owner · weekly review" />}

          <div className="text-[10px] tracking-widest text-slate-500 font-semibold mb-2 mt-5">TREATMENT GOALS</div>
          <div className="space-y-1.5">
            {plan.goals.map(g => (
              <div key={g} className="flex items-start gap-2 text-sm">
                <I.check size={12} stroke={tdef.color} className="mt-0.5 shrink-0" />
                <span className="text-slate-700">{g}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-3">Care Pathway Timeline</div>
        <div className="space-y-3">
          {plan.milestones.map((ms, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex flex-col items-center shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  ms.done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400"
                }`}>
                  {ms.done ? <I.check size={14} stroke="#fff" /> : i + 1}
                </div>
                {i < plan.milestones.length - 1 && (
                  <div className={`w-0.5 h-12 mt-1 ${ms.done ? "bg-emerald-300" : "bg-slate-200"}`} />
                )}
              </div>
              <div className="flex-1 pb-4">
                <div className="text-[11px] font-mono text-slate-500">{ms.date}</div>
                <div className="text-sm font-semibold text-navy-800">{ms.title}</div>
                {ms.notes && <div className="text-[11px] text-slate-600 italic mt-0.5">{ms.notes}</div>}
              </div>
              {!ms.done && i === done && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-gold-100 text-gold-800 font-bold tracking-widest shrink-0">NEXT</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ─────────────────── Suites & Rooms ─────────────────── */

function SuitesTab() {
  return (
    <>
      <div className="grid md:grid-cols-4 gap-4 mb-4">
        {[
          { l: "Total Suites", v: VIP_SUITES.length },
          { l: "Occupied", v: VIP_SUITES.filter(s => s.status === "OCCUPIED").length, c: "#dc2626" },
          { l: "Available", v: VIP_SUITES.filter(s => s.status === "AVAILABLE").length, c: "#059669" },
          { l: "Occupancy", v: `${VIP_KPIS.suitesOccupancy}%`, c: "#D4AF37" },
        ].map(k => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c || "#0B1D3A" }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {VIP_SUITES.map(s => {
          const occupant = s.occupant ? VIP_MEMBERS.find(m => m.id === s.occupant) : null;
          return (
            <div key={s.id} className={`card overflow-hidden border-l-4 ${
              s.status === "OCCUPIED" ? "border-l-rose-500" :
              s.status === "AVAILABLE" ? "border-l-emerald-500" :
              s.status === "CLEANING" ? "border-l-amber-500" : "border-l-slate-400"
            }`}>
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-[10px] tracking-widest text-gold-700 font-semibold">{s.type.toUpperCase()}</div>
                    <div className="font-display text-lg text-navy-800">{s.name}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold tracking-widest ${
                    s.status === "OCCUPIED" ? "bg-rose-100 text-rose-700" :
                    s.status === "AVAILABLE" ? "bg-emerald-100 text-emerald-700" :
                    s.status === "CLEANING" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"
                  }`}>{s.status}</span>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {s.tierAccess.map(t => (
                    <VIPTierBadge key={t} tier={t === "PLATINUM" ? "Platinum" : t === "GOLD" ? "Gold" : "Silver"} />
                  ))}
                </div>
                <div className="text-[11px] text-slate-500 mb-2">{s.ratePerNight} / night</div>
                {occupant && (
                  <div className="rounded bg-rose-50 border border-rose-200 p-2 mb-2">
                    <div className="text-[10px] tracking-widest text-rose-700">OCCUPIED BY</div>
                    <div className="text-sm font-semibold text-navy-800 mt-0.5">{occupant.name}</div>
                  </div>
                )}
                <div className="text-[10px] tracking-widest text-slate-500 mt-3 mb-1">AMENITIES</div>
                <div className="space-y-0.5">
                  {s.amenities.slice(0, 3).map(a => (
                    <div key={a} className="text-[11px] text-slate-600 flex items-center gap-1.5">
                      <I.check size={9} stroke="#059669" />{a}
                    </div>
                  ))}
                  {s.amenities.length > 3 && <div className="text-[10px] text-slate-400">+ {s.amenities.length - 3} more</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ─────────────────── Billing ─────────────────── */

function BillingTab() {
  return (
    <>
      <div className="grid md:grid-cols-4 gap-4 mb-4">
        {[
          { l: "MTD VIP Revenue", v: "TZS 142M", c: "#D4AF37" },
          { l: "YTD VIP Revenue", v: "TZS 1,084M", c: "#0B1D3A" },
          { l: "Avg LTV", v: `TZS ${(VIP_KPIS.totalLTV / VIP_KPIS.totalMembers).toFixed(1)}M` },
          { l: "Renewal Rate", v: "94%", c: "#059669" },
        ].map(k => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-2xl mt-1" style={{ color: k.c || "#0B1D3A" }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="card p-5 mb-4">
        <div className="font-display text-lg text-navy-800 mb-2">12-Month VIP Revenue (TZS M)</div>
        <BarChart
          data={[
            { name: "Jun", value: 42 }, { name: "Jul", value: 48 }, { name: "Aug", value: 54 },
            { name: "Sep", value: 62 }, { name: "Oct", value: 71 }, { name: "Nov", value: 82 },
            { name: "Dec", value: 96 }, { name: "Jan", value: 102 }, { name: "Feb", value: 108 },
            { name: "Mar", value: 124 }, { name: "Apr", value: 138 }, { name: "May", value: 142 },
          ]}
          height={220}
        />
      </div>

      <div className="card overflow-x-auto">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="font-display text-lg text-navy-800">VIP Membership Ledger</div>
          <button className="btn-outline text-xs !py-1.5">Export</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-500">
            <tr>
              <th className="text-left px-4 py-2.5">MEMBER</th>
              <th className="text-left px-4 py-2.5">TIER</th>
              <th className="text-left px-4 py-2.5">JOINED</th>
              <th className="text-left px-4 py-2.5">EXPIRES</th>
              <th className="text-right px-4 py-2.5">ANNUAL FEE</th>
              <th className="text-right px-4 py-2.5">LIFETIME VALUE</th>
              <th className="text-left px-4 py-2.5">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {VIP_MEMBERS.map(m => {
              const t = tier(m.tier);
              return (
                <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-navy-800">{m.name}</div>
                    <div className="text-[10px] font-mono text-slate-500">{m.id}</div>
                  </td>
                  <td className="px-4 py-3"><VIPTierBadge tier={m.tier === "PLATINUM" ? "Platinum" : m.tier === "GOLD" ? "Gold" : "Silver"} /></td>
                  <td className="px-4 py-3 text-xs font-mono">{m.joined}</td>
                  <td className="px-4 py-3 text-xs font-mono">{m.expires}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-navy-800">{t.annualFee}</td>
                  <td className="px-4 py-3 text-right font-mono text-gold-700 font-bold">TZS {m.lifetimeValueM.toFixed(1)}M</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold tracking-widest ${
                      m.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" :
                      m.status === "EXPIRING" ? "bg-amber-100 text-amber-700" :
                      m.status === "EXPIRED" ? "bg-rose-100 text-rose-700" : "bg-violet-100 text-violet-700"
                    }`}>{m.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
