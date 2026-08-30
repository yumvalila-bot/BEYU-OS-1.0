import { I } from "./Icons";
import { priority, waitStatus, waitStatusStyle, type Priority, type QueueEntry, PRIORITIES } from "../services/flow";

/* ─────────────────── Priority badge ─────────────────── */

export function PriorityBadge({ p, size = "md" }: { p: Priority; size?: "sm" | "md" | "lg" }) {
  const def = priority(p);
  const Ico = I[def.icon as keyof typeof I];
  const sz = size === "sm" ? "text-[9px] px-1.5 py-0.5" : size === "lg" ? "text-xs px-3 py-1.5" : "text-[10px] px-2 py-1";
  return (
    <span className={`inline-flex items-center gap-1 rounded font-bold tracking-widest text-white ${sz}`} style={{ background: def.color }}>
      <Ico size={size === "lg" ? 14 : 10} stroke="#fff" />
      {def.label.toUpperCase()}
    </span>
  );
}

/* ─────────────────── Color dot (compact) ─────────────────── */

export function PriorityDot({ p, pulse = false }: { p: Priority; pulse?: boolean }) {
  const def = priority(p);
  return (
    <span
      title={def.label}
      className={`inline-block w-2.5 h-2.5 rounded-full ${pulse ? "pulse-soft" : ""}`}
      style={{ background: def.color }}
    />
  );
}

/* ─────────────────── Wait Time chip ─────────────────── */

export function WaitChip({ elapsed, target }: { elapsed: number; target: number }) {
  const s = waitStatus(elapsed, target);
  const style = waitStatusStyle(s);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded ${style.bg} ${style.color} text-[10px] font-bold`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot} ${s === "BREACH" ? "pulse-soft" : ""}`} />
      <span className="font-mono">{elapsed}m</span>
      <span className="text-[9px] opacity-70">/ {target}m</span>
    </span>
  );
}

/* ─────────────────── Color-Code Legend ─────────────────── */

export function PriorityLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`card ${compact ? "p-3" : "p-4"}`}>
      <div className="text-[10px] tracking-[0.25em] text-slate-500 font-semibold mb-2">PRIORITY COLOR CODE · SLA WAIT TARGETS</div>
      <div className={`grid ${compact ? "grid-cols-4 gap-1.5" : "grid-cols-2 md:grid-cols-4 gap-2"}`}>
        {PRIORITIES.map((p) => {
          const Ico = I[p.icon as keyof typeof I];
          return (
            <div key={p.id} className="flex items-center gap-2 p-2 rounded border border-slate-100">
              <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: p.color }}>
                <Ico size={12} stroke="#fff" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-navy-800 truncate">{p.label}</div>
                <div className="text-[9px] text-slate-500">SLA ≤ {p.targetWaitMin} min</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────── Queue Row ─────────────────── */

export function QueueRow({ entry, onCall }: { entry: QueueEntry; onCall?: (e: QueueEntry) => void }) {
  const def = priority(entry.priority);
  const status = waitStatus(entry.elapsedMin, def.targetWaitMin);
  return (
    <div
      className="flex items-center gap-3 p-3 border-l-4 hover:bg-slate-50 transition"
      style={{ borderLeftColor: def.color, background: status === "BREACH" ? "rgba(254, 226, 226, 0.4)" : undefined }}
    >
      {/* Ticket */}
      <div className="w-16 text-center shrink-0">
        <div className="font-display text-lg text-navy-800">{entry.ticket}</div>
        {entry.vipTier && (
          <div className="text-[8px] tracking-widest font-bold mt-0.5" style={{ color: def.color }}>{entry.vipTier.toUpperCase()}</div>
        )}
      </div>
      {/* Priority pill */}
      <div className="w-28 shrink-0"><PriorityBadge p={entry.priority} /></div>
      {/* Patient */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-navy-800 truncate">{entry.patient}</div>
        <div className="text-[11px] text-slate-500 truncate font-mono">{entry.mrn} · {entry.age}y {entry.sex} · {entry.insurance}</div>
        {entry.notes && <div className="text-[11px] text-slate-600 truncate mt-0.5 italic">{entry.notes}</div>}
      </div>
      {/* Destination */}
      <div className="hidden md:block w-44 shrink-0 text-xs">
        <div className="text-slate-700">{entry.destination}</div>
        <div className="text-[10px] text-slate-500">{entry.department}</div>
      </div>
      {/* Stage */}
      <div className="hidden lg:block w-24 shrink-0">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-navy-50 text-navy-700 font-semibold">{entry.stage}</span>
      </div>
      {/* Wait */}
      <div className="w-28 shrink-0 text-right">
        <WaitChip elapsed={entry.elapsedMin} target={def.targetWaitMin} />
        <div className="text-[10px] text-slate-500 mt-0.5 font-mono">arr {entry.arrivedAt}</div>
      </div>
      {/* Call */}
      <button
        onClick={() => onCall?.(entry)}
        className="px-3 py-1.5 rounded font-bold text-xs text-white shrink-0"
        style={{ background: def.color }}
      >CALL</button>
    </div>
  );
}

/* ─────────────────── VIP Tier badge ─────────────────── */

export function VIPTierBadge({ tier }: { tier: "Platinum" | "Gold" | "Silver" }) {
  const bg = tier === "Platinum" ? "linear-gradient(135deg, #0B1D3A, #1E3A8A)" :
             tier === "Gold" ? "linear-gradient(135deg, #D4AF37, #b48a24)" :
             "linear-gradient(135deg, #cbd5e1, #94a3b8)";
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md font-bold tracking-widest text-white shadow-sm" style={{ background: bg }}>
      <I.star size={10} stroke="#fff" /> {tier.toUpperCase()} VIP
    </span>
  );
}
