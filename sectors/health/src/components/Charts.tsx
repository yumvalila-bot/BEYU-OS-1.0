// Tiny dependency-free SVG charts in BEYU brand colors.

type LineProps = { data: { m: string; v: number }[]; height?: number; color?: string };
export function LineChart({ data, height = 200, color = "#0B1D3A" }: LineProps) {
  const W = 600, H = height, pad = 30;
  const max = Math.max(...data.map((d) => d.v)) * 1.15;
  const min = 0;
  const step = (W - pad * 2) / (data.length - 1);
  const points = data.map((d, i) => [pad + i * step, H - pad - ((d.v - min) / (max - min)) * (H - pad * 2)] as [number, number]);
  const path = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const area = `${path} L${points[points.length - 1][0]},${H - pad} L${points[0][0]},${H - pad} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <defs>
        <linearGradient id="gold-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((g) => (
        <line key={g} x1={pad} x2={W - pad} y1={pad + g * ((H - pad * 2) / 3)} y2={pad + g * ((H - pad * 2) / 3)} stroke="#eef0f5" />
      ))}
      <path d={area} fill="url(#gold-grad)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="3.5" fill="#fff" stroke={color} strokeWidth="2" />
          <text x={p[0]} y={H - 10} fontSize="10" textAnchor="middle" fill="#64748b">{data[i].m}</text>
        </g>
      ))}
    </svg>
  );
}

export function BarChart({ data, height = 200 }: { data: { name: string; value: number }[]; height?: number }) {
  const W = 600, H = height, pad = 30;
  const max = Math.max(...data.map((d) => d.value)) * 1.15;
  const bw = (W - pad * 2) / data.length - 8;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {[0, 1, 2, 3].map((g) => (
        <line key={g} x1={pad} x2={W - pad} y1={pad + g * ((H - pad * 2) / 3)} y2={pad + g * ((H - pad * 2) / 3)} stroke="#eef0f5" />
      ))}
      {data.map((d, i) => {
        const h = ((d.value / max) * (H - pad * 2));
        const x = pad + i * ((W - pad * 2) / data.length) + 4;
        const y = H - pad - h;
        return (
          <g key={d.name}>
            <rect x={x} y={y} width={bw} height={h} rx="4" fill="#0B1D3A" />
            <rect x={x} y={y} width={bw} height="4" rx="2" fill="#D4AF37" />
            <text x={x + bw / 2} y={H - 10} fontSize="9" textAnchor="middle" fill="#64748b">{d.name.slice(0, 8)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function DonutChart({ value, max = 100, label, size = 140, color = "#0B1D3A" }: { value: number; max?: number; label: string; size?: number; color?: string }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  const pct = value / max;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 140 140" className="-rotate-90" width={size} height={size}>
        <circle cx="70" cy="70" r={r} stroke="#eef0f5" strokeWidth="14" fill="none" />
        <circle cx="70" cy="70" r={r} stroke={color} strokeWidth="14" fill="none" strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round" />
        <circle cx="70" cy="70" r={r - 14} stroke="#D4AF37" strokeWidth="2" strokeDasharray="2 4" fill="none" />
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-bold text-navy-800">{value}</div>
        <div className="text-[10px] tracking-widest text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export function Sparkline({ data, color = "#D4AF37", height = 36 }: { data: number[]; color?: string; height?: number }) {
  const W = 120, H = height;
  const max = Math.max(...data), min = Math.min(...data);
  const step = W / (data.length - 1);
  const pts = data.map((v, i) => [i * step, H - ((v - min) / (max - min || 1)) * (H - 6) - 3]);
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="inline-block" width={W} height={H}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

export function ProgressBar({ value, color = "#0B1D3A" }: { value: number; color?: string }) {
  return (
    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${value}%`, background: `linear-gradient(90deg, ${color}, #D4AF37)` }} />
    </div>
  );
}
