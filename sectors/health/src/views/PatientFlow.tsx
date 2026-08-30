import { useState } from "react";
import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { LineChart, BarChart, DonutChart, ProgressBar } from "../components/Charts";
import { StaffChip } from "../components/HRWidgets";
import { byId } from "../services/hr";
import {
  QUEUE, PRIORITIES, FLOW_KPIS, VIP_SERVICES, VIP_PATIENTS,
  priority, waitStatus, type Priority,
} from "../services/flow";
import { PriorityBadge, PriorityLegend, QueueRow, VIPTierBadge, WaitChip } from "../components/Flow";

/* ═══════════════════════════════════════════════════════════════════════════
   PATIENT FLOW MANAGEMENT — color coding · wait times · VIP services
   ═══════════════════════════════════════════════════════════════════════════ */

export function PatientFlowScreen() {
  const [tab, setTab] = useState<"queue" | "vip" | "analytics" | "display">("queue");
  const [filter, setFilter] = useState<Priority | "ALL">("ALL");

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Patient Flow & Wait-Time Management"
        subtitle="Color-coded priority queue · live wait times · VIP concierge"
        actions={
          <>
            <button className="btn-outline text-sm">Open TV Display ⛶</button>
            <button className="btn-primary text-sm">+ Register Walk-in</button>
          </>
        }
      />

      {/* HERO KPIs */}
      <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { l: "In Queue", v: FLOW_KPIS.inQueue.toString(), s: "live", c: "#0B1D3A" },
          { l: "Avg Wait", v: `${FLOW_KPIS.avgWaitMin} min`, s: "all priorities", c: "#1E3A8A" },
          { l: "VIP Served Today", v: FLOW_KPIS.vipServed.toString(), s: "platinum + gold", c: "#D4AF37" },
          { l: "Emergency Today", v: FLOW_KPIS.emergencyToday.toString(), s: "all triaged < 1m", c: "#dc2626" },
          { l: "SLA Breaches", v: FLOW_KPIS.slaBreaches.toString(), s: "right now", c: FLOW_KPIS.slaBreaches > 0 ? "#dc2626" : "#059669" },
          { l: "Longest Wait", v: `${FLOW_KPIS.longestWaitMin}m`, s: "Esther Lema · OPD", c: "#b45309" },
        ].map((k) => (
          <div key={k.l} className="card p-4">
            <div className="text-[10px] tracking-widest text-slate-500">{k.l.toUpperCase()}</div>
            <div className="font-display text-2xl mt-1" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{k.s}</div>
          </div>
        ))}
      </div>

      <div className="mb-6"><PriorityLegend compact /></div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-5">
        {[
          { id: "queue", l: "Live Queue" },
          { id: "vip", l: "VIP Services" },
          { id: "analytics", l: "Wait-Time Analytics" },
          { id: "display", l: "Public Display Preview" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-3 py-2 rounded-md text-sm font-semibold transition ${tab === t.id ? "bg-white text-navy-800 shadow" : "text-slate-500"}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === "queue" && <QueueTab filter={filter} setFilter={setFilter} />}
      {tab === "vip" && <VIPTab />}
      {tab === "analytics" && <AnalyticsTab />}
      {tab === "display" && <PublicDisplayTab />}
    </div>
  );
}

/* ─────────────────── Live Queue Tab ─────────────────── */

function QueueTab({ filter, setFilter }: { filter: Priority | "ALL"; setFilter: (p: Priority | "ALL") => void }) {
  const filtered = filter === "ALL" ? QUEUE : QUEUE.filter((q) => q.priority === filter);

  return (
    <>
      {/* Priority filter pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFilter("ALL")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === "ALL" ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
          All · {QUEUE.length}
        </button>
        {PRIORITIES.map((p) => {
          const n = QUEUE.filter((q) => q.priority === p.id).length;
          if (n === 0) return null;
          const active = filter === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setFilter(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${active ? "text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              style={active ? { background: p.color } : undefined}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: active ? "#fff" : p.color }} />
              {p.label} · {n}
            </button>
          );
        })}
      </div>

      {/* Group by priority */}
      <div className="space-y-4">
        {(filter === "ALL" ? PRIORITIES : [priority(filter)]).map((p) => {
          const entries = QUEUE.filter((q) => q.priority === p.id);
          if (entries.length === 0) return null;
          return (
            <div key={p.id} className="card overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between" style={{ background: `${p.color}15` }}>
                <div className="flex items-center gap-3">
                  <PriorityBadge p={p.id} size="lg" />
                  <div>
                    <div className="font-display text-base text-navy-800">{p.label}</div>
                    <div className="text-[11px] text-slate-500">{p.description}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] tracking-widest text-slate-500">SLA TARGET</div>
                  <div className="font-display text-lg" style={{ color: p.color }}>≤ {p.targetWaitMin} min</div>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {entries.map((e) => <QueueRow key={e.ticket} entry={e} />)}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="card p-10 text-center text-sm text-slate-400">No patients match the current filter.</div>
        )}
      </div>
    </>
  );
}

/* ─────────────────── VIP Services Tab ─────────────────── */

function VIPTab() {
  return (
    <>
      {/* VIP Hero */}
      <div className="card p-6 mb-6 bg-gradient-to-br from-navy-900 via-navy-800 to-amber-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-dot opacity-15" />
        <div className="relative grid lg:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <div className="text-[11px] tracking-[0.3em] text-gold-400 font-semibold flex items-center gap-2">
              <I.star size={12} stroke="#D4AF37" /> BEYU VIP · CONCIERGE HEALTHCARE
            </div>
            <h2 className="font-display text-3xl mt-2">A different kind of care.</h2>
            <p className="text-white/70 mt-2 max-w-xl text-sm">
              Three tiers of premium services for dignitaries, executives and private patients.
              Same Hive AI · same clinicians · elevated experience from arrival to discharge.
            </p>
            <div className="flex gap-2 mt-4">
              <VIPTierBadge tier="Platinum" />
              <VIPTierBadge tier="Gold" />
              <VIPTierBadge tier="Silver" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { l: "VIPs", v: VIP_PATIENTS.length.toString() },
              { l: "Served Today", v: FLOW_KPIS.vipServed.toString() },
              { l: "Avg Wait", v: "4 min" },
            ].map((s) => (
              <div key={s.l} className="rounded-lg bg-white/10 px-3 py-3">
                <div className="font-display text-2xl text-gold-300">{s.v}</div>
                <div className="text-[10px] tracking-widest text-white/60">{s.l.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        {/* Active VIP visits */}
        <div className="card overflow-hidden lg:col-span-2">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="font-display text-lg text-navy-800">VIP Patients In-House Today</div>
              <div className="text-xs text-slate-500">Live presence · concierge assigned</div>
            </div>
            <span className="text-[10px] px-2 py-1 rounded bg-gold-100 text-gold-800 font-bold tracking-widest">{QUEUE.filter((q) => q.priority === "VIP").length} ACTIVE</span>
          </div>
          <div className="divide-y divide-slate-100">
            {QUEUE.filter((q) => q.priority === "VIP").map((q) => {
              const def = priority("VIP");
              return (
                <div key={q.ticket} className="p-4 hover:bg-slate-50">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="w-12 h-12 rounded-xl text-navy-900 font-display text-xl font-bold flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${def.color}, #b48a24)` }}>
                      {q.patient.split(" ").slice(-1)[0][0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display text-lg text-navy-800">{q.patient}</span>
                        {q.vipTier && <VIPTierBadge tier={q.vipTier} />}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">{q.mrn} · {q.age}y {q.sex}</div>
                      {q.notes && <div className="text-xs text-slate-600 mt-1">{q.notes}</div>}
                    </div>
                    <WaitChip elapsed={q.elapsedMin} target={def.targetWaitMin} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded bg-slate-50 px-2 py-1.5">
                      <div className="text-[9px] text-slate-500 tracking-widest">STAGE</div>
                      <div className="text-navy-800 font-semibold">{q.stage}</div>
                    </div>
                    <div className="rounded bg-slate-50 px-2 py-1.5">
                      <div className="text-[9px] text-slate-500 tracking-widest">DESTINATION</div>
                      <div className="text-navy-800 font-semibold truncate">{q.destination}</div>
                    </div>
                    <div className="rounded bg-slate-50 px-2 py-1.5">
                      <div className="text-[9px] text-slate-500 tracking-widest">CONCIERGE</div>
                      <div className="text-navy-800"><StaffChip e={byId("EMP-10040")} /></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* VIP roster + tier breakdown */}
        <div className="space-y-4">
          <div className="card p-5">
            <div className="font-display text-lg text-navy-800 mb-3">VIP Roster</div>
            <div className="space-y-2">
              {VIP_PATIENTS.map((v) => (
                <div key={v.mrn} className="p-3 rounded-lg border border-slate-200 hover:border-gold-300 transition">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-medium text-navy-800 text-sm">{v.name}</div>
                    <VIPTierBadge tier={v.tier} />
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">{v.mrn}</div>
                  <div className="grid grid-cols-2 gap-1 mt-2 text-[10px]">
                    <div className="text-slate-500">Visits: <span className="font-mono text-navy-800">{v.totalVisits}</span></div>
                    <div className="text-slate-500">LTV: <span className="font-mono text-gold-700">{v.lifetimeValue}</span></div>
                  </div>
                  {v.nextAppt && (
                    <div className="mt-2 text-[10px] text-gold-700 flex items-center gap-1"><I.calendar size={9} stroke="#b48a24" /> {v.nextAppt}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="font-display text-base text-navy-800 mb-2">Tier Distribution</div>
            <div className="flex items-center gap-3">
              <DonutChart value={VIP_PATIENTS.length} max={20} label="VIPs" color="#D4AF37" />
              <div className="flex-1 space-y-1 text-xs">
                {(["Platinum", "Gold", "Silver"] as const).map((t) => {
                  const n = VIP_PATIENTS.filter((v) => v.tier === t).length;
                  return (
                    <div key={t} className="flex items-center gap-2">
                      <VIPTierBadge tier={t} />
                      <span className="font-mono text-navy-800 ml-auto">{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* VIP Service Catalogue */}
      <div className="card p-5">
        <div className="font-display text-xl text-navy-800 mb-1">VIP Service Catalogue</div>
        <div className="text-xs text-slate-500 mb-4">12 premium services bundled across Platinum, Gold, and Silver tiers</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {VIP_SERVICES.map((s) => {
            const Ico = I[s.icon as keyof typeof I];
            return (
              <div key={s.id} className="p-4 rounded-xl border border-slate-200 hover:border-gold-300 transition">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #D4AF37, #b48a24)" }}>
                    <Ico size={16} stroke="#0B1D3A" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-navy-800 text-sm">{s.name}</span>
                      <VIPTierBadge tier={s.tier as "Platinum" | "Gold" | "Silver"} />
                    </div>
                    <div className="text-[11px] text-slate-500 leading-relaxed">{s.desc}</div>
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

/* ─────────────────── Wait-Time Analytics Tab ─────────────────── */

function AnalyticsTab() {
  return (
    <>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-5 lg:col-span-2">
          <div className="font-display text-lg text-navy-800 mb-2">Average Wait Time · last 24 hours (minutes)</div>
          <LineChart
            data={[
              { m: "00", v: 18 }, { m: "03", v: 12 }, { m: "06", v: 22 }, { m: "09", v: 48 },
              { m: "12", v: 52 }, { m: "15", v: 38 }, { m: "18", v: 28 }, { m: "21", v: 22 },
            ]}
            height={220}
          />
          <div className="text-[11px] text-slate-500 mt-1">Peaks at OPD opening (09:00) and post-lunch (15:00)</div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">SLA Compliance</div>
          <div className="flex justify-center mb-3">
            <DonutChart value={92} label="SLA MET" color="#059669" />
          </div>
          <div className="space-y-1.5 text-xs">
            {[
              { l: "On Time", v: 92, c: "#059669" },
              { l: "At Risk", v: 6, c: "#b45309" },
              { l: "Breached", v: 2, c: "#dc2626" },
            ].map((r) => (
              <div key={r.l} className="flex items-center gap-2">
                <span className="w-2 h-5 rounded" style={{ background: r.c }} />
                <span className="flex-1 text-slate-700">{r.l}</span>
                <span className="font-mono text-navy-800 font-bold">{r.v}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Avg Wait by Priority</div>
          <BarChart
            data={PRIORITIES.map((p) => {
              const entries = QUEUE.filter((q) => q.priority === p.id);
              const avg = entries.length ? Math.round(entries.reduce((s, e) => s + e.elapsedMin, 0) / entries.length) : 0;
              return { name: p.label.split(" ")[0], value: avg };
            })}
            height={220}
          />
          <div className="text-[11px] text-slate-500 mt-1">Today · in minutes</div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-2">Avg Wait by Department</div>
          <BarChart
            data={[
              { name: "OPD", value: 48 },
              { name: "ER", value: 8 },
              { name: "Dental", value: 22 },
              { name: "Cardio", value: 28 },
              { name: "ANC", value: 18 },
              { name: "Onco", value: 14 },
              { name: "Pharmacy", value: 12 },
              { name: "Lab", value: 16 },
            ]}
            height={220}
          />
        </div>
      </div>

      <div className="card p-5 overflow-x-auto">
        <div className="font-display text-lg text-navy-800 mb-3">SLA Performance per Priority Class</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-500">
            <tr>
              <th className="text-left px-3 py-2.5">PRIORITY</th>
              <th className="text-left px-3 py-2.5">SLA TARGET</th>
              <th className="text-right px-3 py-2.5">AVG WAIT</th>
              <th className="text-right px-3 py-2.5">PATIENTS (24h)</th>
              <th className="text-left px-3 py-2.5">SLA COMPLIANCE</th>
            </tr>
          </thead>
          <tbody>
            {PRIORITIES.map((p) => {
              const entries = QUEUE.filter((q) => q.priority === p.id);
              const onTime = entries.filter((e) => waitStatus(e.elapsedMin, p.targetWaitMin) === "ON-TIME").length;
              const compliance = entries.length ? Math.round((onTime / entries.length) * 100) : 100;
              const avg = entries.length ? Math.round(entries.reduce((s, e) => s + e.elapsedMin, 0) / entries.length) : 0;
              return (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="px-3 py-3"><PriorityBadge p={p.id} /></td>
                  <td className="px-3 py-3 font-mono text-xs">≤ {p.targetWaitMin} min</td>
                  <td className="px-3 py-3 text-right font-mono text-navy-800">{avg} min</td>
                  <td className="px-3 py-3 text-right font-mono">{entries.length}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 max-w-[180px]"><ProgressBar value={compliance} color={compliance >= 90 ? "#059669" : compliance >= 70 ? "#b45309" : "#dc2626"} /></div>
                      <span className={`font-mono text-xs font-bold ${compliance >= 90 ? "text-emerald-600" : compliance >= 70 ? "text-amber-600" : "text-rose-600"}`}>{compliance}%</span>
                    </div>
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

/* ─────────────────── Public TV Display Preview ─────────────────── */

function PublicDisplayTab() {
  const callNow = QUEUE.slice(0, 5);
  return (
    <div className="rounded-2xl bg-gradient-to-br from-navy-950 via-navy-900 to-violet-950 p-8 text-white overflow-hidden relative">
      <div className="absolute inset-0 bg-dot opacity-15" />
      <div className="relative">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-[10px] tracking-[0.4em] text-gold-400 font-bold">BEYU HEALTH OS · LIVE PATIENT BOARD</div>
            <div className="font-display text-3xl mt-1">Now Serving · Wait Times</div>
          </div>
          <div className="text-right">
            <div className="font-display text-4xl text-gold-300 font-mono">09:14</div>
            <div className="text-[11px] text-white/60 tracking-widest">04 MAY 2026 · MON</div>
          </div>
        </div>

        {/* Now Calling */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-5 mb-5">
          <div className="text-[10px] tracking-widest text-gold-400 mb-3">NOW CALLING</div>
          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-3">
            {callNow.map((q) => {
              const def = priority(q.priority);
              return (
                <div key={q.ticket} className="rounded-xl p-4 text-center" style={{ background: `linear-gradient(135deg, ${def.color}, ${def.color}cc)` }}>
                  <div className="text-[9px] tracking-widest text-white/80 font-semibold">{def.label.toUpperCase()}</div>
                  <div className="font-display text-4xl text-white mt-1">{q.ticket}</div>
                  <div className="text-xs text-white/85 mt-2 truncate">{q.destination}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Wait Time Board */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
          <div className="text-[10px] tracking-widest text-gold-400 mb-3">CURRENT WAIT TIMES BY PRIORITY</div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {PRIORITIES.map((p) => {
              const entries = QUEUE.filter((q) => q.priority === p.id);
              const avg = entries.length ? Math.round(entries.reduce((s, e) => s + e.elapsedMin, 0) / entries.length) : 0;
              const status = avg <= p.targetWaitMin ? "ON-TIME" : avg <= p.targetWaitMin * 1.5 ? "WARNING" : "BREACH";
              return (
                <div key={p.id} className="rounded-lg p-3 text-center" style={{ background: `${p.color}30`, borderTop: `3px solid ${p.color}` }}>
                  <div className="text-[9px] tracking-widest font-bold" style={{ color: p.color === "#D4AF37" ? "#fef3c7" : "#fff" }}>{p.label.split(" ")[0].toUpperCase()}</div>
                  <div className="font-display text-3xl text-white mt-1">{avg || "—"}</div>
                  <div className="text-[9px] text-white/60">{avg ? "MIN AVG" : "no queue"}</div>
                  {entries.length > 0 && (
                    <div className={`text-[9px] mt-1 font-bold ${status === "BREACH" ? "text-rose-300" : status === "WARNING" ? "text-amber-300" : "text-emerald-300"}`}>
                      {entries.length} waiting
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 text-center text-[10px] text-white/40 tracking-widest">
          KARIBU SANA · WELCOME · KIPATA UMETUMIKA · POLE SANA KWA KUSUBIRI
        </div>
      </div>
    </div>
  );
}
