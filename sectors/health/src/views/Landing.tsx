import { Logo } from "../components/Logo";
import { I } from "../components/Icons";

const PILLARS = [
  { icon: "shield", title: "Trust", desc: "The foundation of everything we do.", color: "#0B1D3A" },
  { icon: "heart", title: "Care", desc: "Compassion in every interaction.", color: "#7B1E2A" },
  { icon: "scale", title: "Integrity", desc: "Honesty and transparency in all actions.", color: "#1E3A8A" },
  { icon: "bulb", title: "Innovation", desc: "Technology for a healthier tomorrow.", color: "#D4AF37" },
  { icon: "leaf", title: "Impact", desc: "Building healthier communities.", color: "#557345" },
] as const;

const FEATURES = [
  { icon: "building", title: "Multi-Tenant Secure", sub: "Strict tenant isolation" },
  { icon: "cloud", title: "Offline-First", sub: "Built for rural Africa" },
  { icon: "brain", title: "AI Co-Pilot", sub: "Governed Hive Runtime" },
  { icon: "globe", title: "Cloud Native", sub: "AWS · On-Prem · Hybrid" },
  { icon: "lock", title: "End-to-End Encrypted", sub: "Zero-trust architecture" },
  { icon: "check", title: "MTUHA / NHIF Compliant", sub: "Tanzania-ready" },
] as const;

const MODULES_STRIP = [
  { icon: "emr", n: "EMR" }, { icon: "pill", n: "Pharmacy" }, { icon: "lab", n: "Laboratory" },
  { icon: "bill", n: "Billing" }, { icon: "shield", n: "NHIF Claims" }, { icon: "reports", n: "MTUHA Reports" },
  { icon: "brain", n: "AI Assistant" }, { icon: "analytics", n: "Analytics" }, { icon: "building", n: "Marketplace" },
  { icon: "star", n: "Ranking" }, { icon: "cash", n: "Credit Score" }, { icon: "doc", n: "Subscriptions" },
] as const;

const DIVISIONS = [
  "Clinical Command", "AI & Automation", "Digital Infrastructure", "Financial Intelligence",
  "Operations & Logistics", "Research & Innovation", "Patient Experience", "Cybersecurity & Governance",
];

export function Landing({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* NAV */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo variant="full" size={38} />
          <nav className="hidden md:flex items-center gap-7 text-sm text-navy-700">
            <a href="#platform" className="hover:text-gold-600">Platform</a>
            <a href="#modules" className="hover:text-gold-600">Modules</a>
            <a href="#architecture" className="hover:text-gold-600">Architecture</a>
            <a href="#governance" className="hover:text-gold-600">Governance</a>
            <a href="#pillars" className="hover:text-gold-600">Pillars</a>
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={onLogin} className="btn-outline">Sign in</button>
            <button onClick={onLogin} className="btn-gold">Launch Platform</button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700" />
        <div className="absolute inset-0 bg-dot opacity-40" />
        <div className="relative max-w-7xl mx-auto px-6 py-20 lg:py-28 grid lg:grid-cols-2 gap-12 items-center text-white">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-[11px] tracking-widest mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-gold-400 pulse-soft" />
              ENTERPRISE HEALTHCARE OPERATING PLATFORM · v2026.4
            </div>
            <h1 className="font-display text-4xl md:text-6xl leading-tight">
              BEYU <span className="text-gold-400">Health OS</span>
            </h1>
            <div className="gold-divider w-24 my-5" />
            <p className="text-xl text-white/85 max-w-xl">
              Bridging Care. Building Trust.<br />
              Transforming Healthcare for Generations.
            </p>
            <p className="mt-4 text-white/65 max-w-xl">
              One platform across EMR, ERP, AI, NHIF, telemedicine and analytics — owned by the
              <span className="text-gold-300"> BEYU Family Trust</span>, governed by the BEYU Holding Company, operated for hospitals, clinics, labs and pharmacies.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <button onClick={onLogin} className="btn-gold !py-3 !px-6">Launch Platform →</button>
              <button className="btn-outline !text-white !border-white/40 hover:!bg-white hover:!text-navy-800 !py-3 !px-6">Watch Demo</button>
            </div>

            <div className="grid grid-cols-4 gap-4 mt-12 max-w-lg">
              {[
                { k: "Tenants", v: "120+" },
                { k: "Patients", v: "2.4M" },
                { k: "Uptime", v: "99.97%" },
                { k: "Modules", v: "40+" },
              ].map((s) => (
                <div key={s.k}>
                  <div className="text-3xl font-display text-gold-400">{s.v}</div>
                  <div className="text-[11px] tracking-widest text-white/60 mt-1">{s.k.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Floating dashboard card */}
          <div className="relative">
            <div className="absolute -inset-8 bg-gold-500/10 blur-3xl rounded-full" />
            <div className="relative card !bg-white !rounded-2xl p-5 float">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[10px] tracking-widest text-slate-500">EXECUTIVE OVERVIEW</div>
                  <div className="font-display text-xl text-navy-800">Muhimbili · Today</div>
                </div>
                <Logo variant="mark" size={32} />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { l: "Active Patients", v: "12,458", d: "+12.5%" },
                  { l: "Revenue (TZS)", v: "324.6M", d: "+15.7%" },
                  { l: "NHIF Success", v: "92.4%", d: "+4.2%" },
                  { l: "Bed Occupancy", v: "78%", d: "−2.1%" },
                ].map((k) => (
                  <div key={k.l} className="p-3 rounded-xl bg-slate-50">
                    <div className="text-[10px] text-slate-500">{k.l}</div>
                    <div className="text-xl font-semibold text-navy-800 mt-0.5">{k.v}</div>
                    <div className="text-[10px] text-emerald-600 mt-0.5">{k.d}</div>
                  </div>
                ))}
              </div>
              <div className="p-3 rounded-xl bg-navy-800 text-white">
                <div className="flex items-center justify-between text-[11px] text-white/70 mb-2">
                  <span>AI Co-Pilot · Hive Runtime</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-soft" />Active</span>
                </div>
                <div className="text-sm leading-relaxed">
                  3 new sepsis-risk alerts queued · 12 NHIF claims auto-validated · 1 radiology AI suggestion pending review.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE BAR */}
      <section className="border-y border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {FEATURES.map((f) => {
            const Ico = I[f.icon];
            return (
              <div key={f.title} className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gold-50 text-gold-700 flex items-center justify-center shrink-0">
                  <Ico size={20} stroke="#b48a24" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-navy-800">{f.title}</div>
                  <div className="text-[11px] text-slate-500">{f.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* OWNERSHIP HIERARCHY */}
      <section id="governance" className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="text-[11px] tracking-[0.3em] text-gold-600 font-semibold">GOVERNANCE STRUCTURE</div>
            <h2 className="font-display text-3xl md:text-4xl text-navy-800 mt-3">An Enterprise Built on Trust</h2>
            <div className="gold-divider w-24 mx-auto my-4" />
            <p className="text-slate-600 max-w-2xl mx-auto">
              BEYU Health OS is owned by the BEYU Family Trust, governed by the BEYU Holding Company,
              operated by the BEYU Operations Company, and used by healthcare tenants to serve patients
              securely, intelligently and at scale.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-4">
            {[
              { t: "BEYU Family Trust", s: "Owns", c: "#0B1D3A" },
              { t: "BEYU Holding Co.", s: "Governs", c: "#1E3A8A" },
              { t: "BEYU Operations Co.", s: "Operates", c: "#2563EB" },
              { t: "BEYU Health OS", s: "Serves Tenants", c: "#D4AF37" },
              { t: "Patients", s: "Receive Care", c: "#557345" },
            ].map((n, i) => (
              <div key={n.t} className="relative">
                <div className="card p-5 text-center h-full">
                  <div className="text-[10px] tracking-widest text-slate-500">LEVEL {i + 1}</div>
                  <div className="font-display text-lg text-navy-800 mt-2">{n.t}</div>
                  <div className="mt-3 inline-block px-2 py-0.5 rounded-full text-[10px] text-white" style={{ background: n.c }}>{n.s}</div>
                </div>
                {i < 4 && <div className="hidden md:block absolute top-1/2 -right-2 text-gold-500 text-xl">→</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ARCHITECTURE */}
      <section id="architecture" className="py-20 bg-navy-800 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="text-[11px] tracking-[0.3em] text-gold-400 font-semibold">PLATFORM ARCHITECTURE</div>
            <h2 className="font-display text-3xl md:text-4xl mt-3">Hive Mode AI — Governed by Humans</h2>
            <div className="gold-divider w-24 mx-auto my-4" />
            <p className="text-white/70 max-w-2xl mx-auto">
              Specialized AI agents with limited permissions, audited actions, deterministic workflow
              orchestration, and emergency shutdown — always under human authority.
            </p>
          </div>

          <div className="grid lg:grid-cols-4 gap-4">
            {[
              { t: "Tenant Clinics & Hospitals", icons: ["building", "building", "building", "building"] },
              { t: "BEYU Health Platform (SaaS)", icons: ["emr", "pill", "lab", "bill", "shield", "analytics", "brain"] },
              { t: "Core Services", icons: ["user", "building", "doc", "bell", "doc"] },
              { t: "Infrastructure", icons: ["cloud", "database", "zap", "globe"] },
            ].map((row) => (
              <div key={row.t} className="rounded-2xl bg-white/5 border border-white/10 p-5">
                <div className="text-[10px] tracking-widest text-gold-400 mb-3">{row.t.toUpperCase()}</div>
                <div className="flex flex-wrap gap-2">
                  {row.icons.map((ic, i) => {
                    const Ico = I[ic as keyof typeof I];
                    return (
                      <div key={i} className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                        <Ico size={18} stroke="#D4AF37" />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 grid md:grid-cols-3 gap-4">
            {[
              { k: "Edge AI", v: "TensorFlow Lite · ONNX" },
              { k: "Vision AI", v: "OpenCV · MONAI" },
              { k: "Workflow", v: "Deterministic Engine" },
              { k: "Clinical LLMs", v: "Claude · OpenAI · Vetted" },
              { k: "Interop", v: "FHIR R5 · HL7 v2 · DICOM" },
              { k: "Runtime", v: "K8s · Istio · Prometheus" },
            ].map((c) => (
              <div key={c.k} className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] tracking-widest text-white/50">{c.k.toUpperCase()}</div>
                  <div className="text-sm">{c.v}</div>
                </div>
                <I.check size={16} stroke="#34d399" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MODULES */}
      <section id="modules" className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <div className="text-[11px] tracking-[0.3em] text-gold-600 font-semibold">UNIFIED MODULES</div>
            <h2 className="font-display text-3xl md:text-4xl text-navy-800 mt-3">One Platform. Every Service.</h2>
            <div className="gold-divider w-24 mx-auto my-4" />
          </div>

          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {MODULES_STRIP.map((m) => {
              const Ico = I[m.icon as keyof typeof I];
              return (
                <div key={m.n} className="card p-4 text-center hover:-translate-y-1 transition cursor-pointer">
                  <div className="w-12 h-12 rounded-xl bg-navy-50 mx-auto flex items-center justify-center mb-2">
                    <Ico size={22} stroke="#0B1D3A" />
                  </div>
                  <div className="text-xs font-semibold text-navy-800 tracking-wide">{m.n.toUpperCase()}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-10 grid md:grid-cols-4 gap-3">
            {DIVISIONS.map((d) => (
              <div key={d} className="card p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gold-50 flex items-center justify-center">
                  <I.star size={14} stroke="#b48a24" />
                </div>
                <div className="text-sm font-medium text-navy-800">{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PILLARS */}
      <section id="pillars" className="py-20 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="text-[11px] tracking-[0.3em] text-gold-600 font-semibold">OUR PILLARS</div>
            <h2 className="font-display text-3xl md:text-4xl text-navy-800 mt-3">A Legacy of Trust. A Future of Better Health.</h2>
            <div className="gold-divider w-24 mx-auto my-4" />
          </div>
          <div className="grid md:grid-cols-5 gap-4">
            {PILLARS.map((p) => {
              const Ico = I[p.icon as keyof typeof I];
              return (
                <div key={p.title} className="card p-6 text-center">
                  <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center" style={{ background: `${p.color}15` }}>
                    <Ico size={26} stroke={p.color} />
                  </div>
                  <div className="font-display text-lg text-navy-800 mt-3">{p.title}</div>
                  <div className="text-xs text-slate-500 mt-1">{p.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* DEPLOY ANYWHERE */}
      <section id="platform" className="py-20">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="text-[11px] tracking-[0.3em] text-gold-600 font-semibold">DEPLOY ANYWHERE</div>
            <h2 className="font-display text-3xl md:text-4xl text-navy-800 mt-3">Cloud · On-Premise · Rural Offline</h2>
            <div className="gold-divider w-20 my-4" />
            <p className="text-slate-600 mb-6">
              BEYU Health OS runs on AWS EKS, on-premise Kubernetes, or as an offline-first edge node
              for rural clinics — synchronizing automatically when connectivity returns.
            </p>
            <div className="space-y-3">
              {[
                { i: "device", t: "Android & iOS apps", s: "Patient + Clinician mobile" },
                { i: "monitor", t: "Windows · macOS · Linux", s: "Native Electron desktop builds" },
                { i: "cloud", t: "Web Platform", s: "Browser-first SaaS for hospitals" },
                { i: "database", t: "Edge Database", s: "PostgreSQL + Redis offline sync" },
              ].map((r) => {
                const Ico = I[r.i as keyof typeof I];
                return (
                  <div key={r.t} className="card p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-navy-800 text-white flex items-center justify-center"><Ico size={18} /></div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-navy-800">{r.t}</div>
                      <div className="text-xs text-slate-500">{r.s}</div>
                    </div>
                    <I.chevronR size={16} stroke="#94a3b8" />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-8 bg-gradient-to-br from-navy-800 to-navy-900 text-white">
            <div className="text-[11px] tracking-[0.3em] text-gold-400">TANZANIA-READY</div>
            <h3 className="font-display text-2xl mt-2">Configured for the East African Market</h3>
            <div className="gold-divider w-16 my-4" />
            <ul className="space-y-2 text-sm text-white/80">
              {[
                "NHIF claims & eligibility (live)",
                "MTUHA statutory reporting",
                "EFD / VFD tax-device compatibility",
                "M-Pesa, Tigo Pesa & bank rails",
                "Kiswahili + English UI",
                "MoH compliance for facility tiers",
              ].map((x) => (
                <li key={x} className="flex items-center gap-2"><I.check size={14} stroke="#34d399" />{x}</li>
              ))}
            </ul>
            <button onClick={onLogin} className="btn-gold mt-6 w-full !py-3">Enter Platform →</button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-navy-800 text-white text-center">
        <div className="max-w-3xl mx-auto px-6">
          <Logo variant="mark" size={56} className="mx-auto" />
          <h2 className="font-display text-3xl md:text-4xl mt-4">Trust · Innovation · Impact</h2>
          <p className="text-white/70 mt-3">
            Building a healthier Africa through technology, compassion and excellence.
          </p>
          <button onClick={onLogin} className="btn-gold mt-6 !py-3 !px-8">Launch BEYU Health OS</button>
        </div>
      </section>

      <footer className="bg-navy-900 text-white/60 text-sm py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo variant="mark" size={28} />
            <span>© 2026 BEYU Family Trust · All rights reserved.</span>
          </div>
          <div className="flex gap-6 text-xs">
            <span>P.O. Box 12345, Dar es Salaam, Tanzania</span>
            <span>info@beyuhealth.org</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
