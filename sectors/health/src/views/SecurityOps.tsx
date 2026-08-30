import { useState } from "react";
import { PageHeader } from "../components/Chrome";
import { I } from "../components/Icons";
import { LineChart, DonutChart, ProgressBar } from "../components/Charts";
import { StaffChip } from "../components/HRWidgets";
import { Classification, BreakGlassPrompt } from "../components/Security";
import { ROLES_RBAC, PERMISSIONS_META, SECURITY_KPIS, roleFor, type Permission, type Role } from "../services/rbac";
import { byId } from "../services/hr";

/* ═══════════════════════════════════════════════════════════════════════════
   SECURITY OPERATIONS CENTER
   ═══════════════════════════════════════════════════════════════════════════ */

export function SecurityOpsScreen({ currentRole }: { currentRole: string }) {
  const [tab, setTab] = useState<"overview" | "rbac" | "events" | "access" | "encryption">("overview");
  const [bg, setBg] = useState(false);

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Security Operations Center"
        subtitle="Zero-trust posture · RBAC · audit · break-glass · vulnerabilities"
        actions={
          <>
            <Classification level="RESTRICTED" />
            <button onClick={() => setBg(true)} className="text-sm px-4 py-2 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-700">⚠ Break-Glass Demo</button>
          </>
        }
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-5">
        {[
          { id: "overview", l: "Overview" },
          { id: "rbac", l: "Role-Based Access Control" },
          { id: "events", l: "Security Events" },
          { id: "access", l: "Access Reviews" },
          { id: "encryption", l: "Encryption & Keys" },
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

      {tab === "overview" && <OverviewTab />}
      {tab === "rbac" && <RBACTab currentRole={currentRole} />}
      {tab === "events" && <EventsTab />}
      {tab === "access" && <AccessReviewTab />}
      {tab === "encryption" && <EncryptionTab />}

      <BreakGlassPrompt
        open={bg}
        onClose={() => setBg(false)}
        target="Patient BEYU-100486 · ICU Vitals"
        requiredPerm="phi:read"
      />
    </div>
  );
}

/* ─────────────────── Overview Tab ─────────────────── */

function OverviewTab() {
  return (
    <>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { l: "Zero-Trust Score", v: `${SECURITY_KPIS.zeroTrustScore}/100`, c: "#059669", s: "A+ posture · no incidents 30d" },
          { l: "MFA Enrollment", v: `${SECURITY_KPIS.mfaEnrollment}%`, c: "#0B1D3A", s: "Biometric or WebAuthn required" },
          { l: "PHI Encryption", v: `${SECURITY_KPIS.encryptionCoverage}%`, c: "#7c3aed", s: "AES-256 at rest + TLS 1.3 transit" },
          { l: "Permission Denied (24h)", v: SECURITY_KPIS.permissionDenied24h.toString(), c: "#b45309", s: "All logged & reviewed" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[11px] text-slate-500 mt-1">{k.s}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-6 lg:col-span-2 bg-gradient-to-br from-navy-800 to-navy-900 text-white">
          <div className="text-[11px] tracking-[0.3em] text-gold-400 font-semibold">DEFENCE-IN-DEPTH</div>
          <div className="font-display text-2xl mt-1">7-Layer Security Architecture</div>
          <div className="grid md:grid-cols-2 gap-2 mt-5">
            {[
              { l: "Identity", d: "OIDC + WebAuthn · biometric MFA" },
              { l: "Network", d: "mTLS · zero-trust gateway · WAF" },
              { l: "Application", d: "RBAC + ABAC · CSP · sandboxed AI" },
              { l: "Tenant Isolation", d: "Row-level RLS · per-tenant keys" },
              { l: "Data at Rest", d: "AES-256-GCM · KMS-rotated keys" },
              { l: "Data in Transit", d: "TLS 1.3 · certificate pinning" },
              { l: "Audit & SIEM", d: "Immutable log · 7-year retention" },
              { l: "Chain Anchor", d: "Hash anchored on Hyperledger" },
            ].map((c) => (
              <div key={c.l} className="rounded-lg bg-white/10 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <I.shield size={12} stroke="#D4AF37" />
                  <div className="text-[10px] tracking-widest text-gold-300">{c.l.toUpperCase()}</div>
                </div>
                <div className="text-xs text-white/80">{c.d}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Open Vulnerabilities</div>
          <div className="flex justify-center mb-3">
            <DonutChart value={10} max={50} label="OPEN" color="#b45309" />
          </div>
          <div className="space-y-1.5 text-xs">
            {[
              { l: "Critical", v: SECURITY_KPIS.vulnerabilities.critical, c: "bg-rose-600" },
              { l: "High", v: SECURITY_KPIS.vulnerabilities.high, c: "bg-rose-400" },
              { l: "Medium", v: SECURITY_KPIS.vulnerabilities.medium, c: "bg-amber-500" },
              { l: "Low", v: SECURITY_KPIS.vulnerabilities.low, c: "bg-slate-400" },
            ].map((v) => (
              <div key={v.l} className="flex items-center gap-2">
                <span className={`w-2 h-5 rounded ${v.c}`} />
                <span className="flex-1 text-slate-700">{v.l}</span>
                <span className="font-mono font-semibold text-navy-800">{v.v}</span>
              </div>
            ))}
          </div>
          <button className="btn-outline w-full text-xs !py-2 mt-3">View CVE Register</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Authentication Methods</div>
          {[
            { l: "Biometric (WebAuthn)", v: 78, c: "#7c3aed" },
            { l: "Hardware key (YubiKey)", v: 64, c: "#0B1D3A" },
            { l: "TOTP authenticator", v: 22, c: "#D4AF37" },
            { l: "Password only (legacy)", v: 4, c: "#dc2626" },
          ].map((r) => (
            <div key={r.l} className="mb-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700">{r.l}</span>
                <span className="font-mono text-navy-800">{r.v}%</span>
              </div>
              <ProgressBar value={r.v} color={r.c} />
            </div>
          ))}
          <div className="mt-3 text-[10px] text-amber-700">4% on password-only · forced enrollment by 30 Jun 2026</div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Tenant Isolation</div>
          <div className="space-y-2">
            {[
              { l: "Cross-tenant attempts (30d)", v: "0", c: "#059669" },
              { l: "Consent-gated transfers", v: "1,284", c: "#7c3aed" },
              { l: "Row-level policies", v: "412", c: "#0B1D3A" },
              { l: "Per-tenant KMS keys", v: "120", c: "#D4AF37" },
            ].map((r) => (
              <div key={r.l} className="flex items-center justify-between p-2 rounded hover:bg-slate-50">
                <span className="text-sm text-slate-700">{r.l}</span>
                <span className="font-mono font-semibold" style={{ color: r.c }}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5 border-rose-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center"><I.warning size={16} stroke="#dc2626" /></div>
            <div className="font-display text-lg text-navy-800">Break-Glass</div>
          </div>
          <div className="text-xs text-slate-600 mb-3">
            Emergency access mechanism for clinicians needing PHI access outside normal scope (e.g. unconscious patient).
          </div>
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <div className="rounded bg-slate-50 p-2">
              <div className="font-display text-lg text-navy-800">{SECURITY_KPIS.breakGlassPending}</div>
              <div className="text-[10px] text-slate-500">PENDING</div>
            </div>
            <div className="rounded bg-slate-50 p-2">
              <div className="font-display text-lg text-emerald-600">8</div>
              <div className="text-[10px] text-slate-500">APPROVED (30d)</div>
            </div>
            <div className="rounded bg-slate-50 p-2">
              <div className="font-display text-lg text-rose-600">0</div>
              <div className="text-[10px] text-slate-500">DENIED</div>
            </div>
          </div>
          <button className="btn-outline w-full text-xs !py-2">Review Active</button>
        </div>
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-navy-800 mb-2">Failed Login Attempts (24h)</div>
        <LineChart
          data={[
            { m: "00", v: 0 }, { m: "03", v: 1 }, { m: "06", v: 2 }, { m: "09", v: 4 },
            { m: "12", v: 1 }, { m: "15", v: 2 }, { m: "18", v: 1 }, { m: "21", v: 1 },
          ]}
          height={160} color="#b45309"
        />
        <div className="text-[11px] text-slate-500 mt-1">12 total · 0 successful brute-force · all logged & rate-limited</div>
      </div>
    </>
  );
}

/* ─────────────────── RBAC Tab ─────────────────── */

function RBACTab({ currentRole }: { currentRole: string }) {
  const [selected, setSelected] = useState<Role>(roleFor(currentRole));
  const groups = Array.from(new Set(Object.values(PERMISSIONS_META).map((p) => p.group)));

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-4">
      <div className="card p-3 h-fit lg:sticky lg:top-20">
        <div className="px-2 py-1 text-[10px] tracking-widest text-slate-500">{ROLES_RBAC.length} ROLES · 4 CADRES</div>
        {ROLES_RBAC.map((r) => {
          const active = selected.id === r.id;
          return (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 mb-0.5 ${active ? "bg-navy-800 text-white" : "hover:bg-slate-50 text-navy-700"}`}
            >
              <span className={`w-2 h-2 rounded-full ${
                r.cadre === "Constitutional" ? "bg-rose-500" :
                r.cadre === "Governance" ? "bg-violet-500" :
                r.cadre === "Executive" ? "bg-gold-500" :
                r.cadre === "Clinical" ? "bg-emerald-500" :
                r.cadre === "Allied" ? "bg-cyan-500" :
                r.cadre === "Operations" ? "bg-sky-500" : "bg-slate-400"
              }`} />
              <span className="flex-1 truncate">{r.label}</span>
              <span className={`text-[10px] ${active ? "text-white/60" : "text-slate-400"}`}>{r.permissions.length}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        <div className="card p-5">
          <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
            <div>
              <div className="text-[10px] tracking-widest text-gold-700">{selected.cadre.toUpperCase()} CADRE</div>
              <div className="font-display text-2xl text-navy-800 mt-1">{selected.label}</div>
              <div className="text-sm text-slate-600 mt-1">{selected.description}</div>
            </div>
            <div className="text-right">
              <div className="font-display text-3xl text-navy-800">{selected.permissions.length}</div>
              <div className="text-[10px] tracking-widest text-slate-500">PERMISSIONS</div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Permission Matrix</div>
          <div className="space-y-4">
            {groups.map((g) => {
              const perms = Object.entries(PERMISSIONS_META).filter(([, m]) => m.group === g);
              return (
                <div key={g}>
                  <div className="text-[10px] tracking-widest text-slate-500 font-semibold mb-2">{g.toUpperCase()}</div>
                  <div className="grid md:grid-cols-2 gap-2">
                    {perms.map(([k, meta]) => {
                      const has = selected.permissions.includes(k as Permission);
                      const sens = meta.sensitivity;
                      return (
                        <div key={k} className={`flex items-center gap-2 p-2 rounded border ${has ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"}`}>
                          {has ? <I.check size={14} stroke="#059669" /> : <I.lock size={14} stroke="#94a3b8" />}
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs ${has ? "text-navy-800 font-medium" : "text-slate-500"}`}>{meta.label}</div>
                            <div className="text-[10px] text-slate-400 font-mono truncate">{k}</div>
                          </div>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold tracking-widest ${
                            sens === "critical" ? "bg-rose-100 text-rose-700" :
                            sens === "high" ? "bg-amber-100 text-amber-700" :
                            sens === "med" ? "bg-gold-100 text-gold-700" : "bg-slate-100 text-slate-600"
                          }`}>{sens.toUpperCase()}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── Security Events Tab ─────────────────── */

function EventsTab() {
  return (
    <>
      <div className="grid md:grid-cols-4 gap-4 mb-4">
        {[
          { l: "Events (24h)", v: "48,712" },
          { l: "Critical", v: "0", c: "#059669" },
          { l: "High", v: "3", c: "#b45309" },
          { l: "Suspicious IPs blocked", v: "14" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c || "#0B1D3A" }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="card p-5 mb-4">
        <div className="font-display text-lg text-navy-800 mb-3">Security Event Stream</div>
        <div className="space-y-1 text-xs font-mono max-h-[460px] overflow-y-auto">
          {[
            { t: "14:42:18", sev: "info", e: "AUTH_SUCCESS", a: "EMP-10001 · WebAuthn", d: "Source 10.42.1.1 · TZ-DSM" },
            { t: "14:41:50", sev: "high", e: "PERMISSION_DENIED", a: "EMP-10010 · doctor", d: "Attempted phi:export → blocked" },
            { t: "14:41:32", sev: "info", e: "BREAK_GLASS_REQUEST", a: "EMP-10024 · nurse", d: "ICU patient · approved by CMO 28s" },
            { t: "14:41:18", sev: "warn", e: "TENANT_SWITCH", a: "EMP-10003 · CMO", d: "MUH-DSM-01 → AGA-DSM-02" },
            { t: "14:41:02", sev: "info", e: "MFA_VERIFIED", a: "EMP-10020 · biometric", d: "Mobile clock-in · ward A" },
            { t: "14:40:48", sev: "high", e: "AUTH_FAILURE", a: "Unknown · 203.0.113.42", d: "Attempt 3/3 · IP rate-limited 30 min" },
            { t: "14:40:30", sev: "info", e: "KEY_ROTATION", a: "system.kms", d: "Per-tenant DEK rotated · MUH-DSM-01" },
            { t: "14:40:15", sev: "info", e: "POLICY_EVAL", a: "abac.engine", d: "12,840 policy decisions in 10min · 99.9% allow" },
            { t: "14:40:02", sev: "warn", e: "CONSENT_REVOKED", a: "patient.BEYU-100489", d: "Revoked sharing to ARU-MED-03" },
            { t: "14:39:48", sev: "info", e: "ANCHOR_OK", a: "BeyuDocSign", d: "Hash anchored · DOC-INV-003" },
            { t: "14:39:32", sev: "high", e: "CROSS_TENANT_BLOCKED", a: "EMP-10031 · pharmacy", d: "Attempted patient read in foreign tenant · blocked" },
            { t: "14:39:18", sev: "info", e: "AI_OVERRIDE", a: "EMP-10003 · CMO", d: "Sepsis bundle suggestion overridden" },
            { t: "14:39:02", sev: "info", e: "SESSION_RECORDED", a: "EMP-10001", d: "Continuous session recording active" },
          ].map((r, i) => (
            <div key={i} className="grid grid-cols-[80px_60px_180px_240px_1fr] gap-2 py-1 border-b border-slate-50">
              <span className="text-slate-500">{r.t}</span>
              <span className={`font-bold ${
                r.sev === "high" ? "text-rose-600" : r.sev === "warn" ? "text-amber-600" : "text-emerald-600"
              }`}>{r.sev.toUpperCase()}</span>
              <span className="text-violet-700">{r.e}</span>
              <span className="text-navy-800 truncate">{r.a}</span>
              <span className="text-slate-600 truncate">{r.d}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Top Blocked IPs (24h)</div>
          {[
            { ip: "203.0.113.42", c: "BR · Brute-force", n: 18 },
            { ip: "198.51.100.7", c: "RU · Scan", n: 12 },
            { ip: "192.0.2.142", c: "CN · Credential stuffing", n: 9 },
            { ip: "203.0.113.84", c: "NG · API abuse", n: 6 },
          ].map((b) => (
            <div key={b.ip} className="flex items-center gap-3 p-2 border-b border-slate-50">
              <I.warning size={14} stroke="#dc2626" />
              <div className="flex-1">
                <div className="font-mono text-sm text-navy-800">{b.ip}</div>
                <div className="text-[11px] text-slate-500">{b.c}</div>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-mono">{b.n} attempts</span>
            </div>
          ))}
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Active Break-Glass</div>
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 mb-3">
            <div className="text-[10px] tracking-widest text-rose-700">ACTIVE · EXPIRES IN 42 min</div>
            <div className="font-semibold text-navy-800 mt-1">Nurse → ICU patient PHI</div>
            <div className="text-[11px] text-slate-600 mt-1">EMP-10024 requested phi:read on BEYU-100486 · approved by CMO</div>
            <div className="mt-2"><StaffChip e={byId("EMP-10024")} sub="initiator" /></div>
            <div className="text-[10px] text-rose-700 mt-2">Session being recorded · auto-revoke after 60 min</div>
          </div>
          <div className="text-[11px] text-slate-500">All break-glass sessions are reviewed within 24 hours by the Risk Committee.</div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────── Access Reviews Tab ─────────────────── */

function AccessReviewTab() {
  return (
    <>
      <div className="grid md:grid-cols-4 gap-4 mb-4">
        {[
          { l: "Q2 Review Progress", v: "84%" },
          { l: "Accounts Reviewed", v: "3,544" },
          { l: "Privileges Revoked", v: "42" },
          { l: "Orphan Accounts", v: "0", c: "#059669" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c || "#0B1D3A" }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-display text-lg text-navy-800">Quarterly Access Review · Q2 2026</div>
            <div className="text-xs text-slate-500">Each line manager re-attests their team's privileges</div>
          </div>
          <div className="text-xs text-slate-500">Due 30 Jun 2026 · 14 days remaining</div>
        </div>
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600">Platform-wide completion</span>
            <span className="font-mono text-navy-800">3,544 / 4,212</span>
          </div>
          <ProgressBar value={84} color="#059669" />
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { d: "Clinical (Doctors)", done: 112, total: 118, owner: "CMO" },
            { d: "Clinical (Nurses)", done: 358, total: 362, owner: "CNO" },
            { d: "Allied Health", done: 84, total: 84, owner: "CMO" },
            { d: "Finance & RCM", done: 38, total: 42, owner: "CFO" },
            { d: "HR & Admin", done: 96, total: 96, owner: "HR Director" },
            { d: "Operations", done: 184, total: 220, owner: "COO" },
          ].map((r) => (
            <div key={r.d} className="p-3 rounded-lg border border-slate-200">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-navy-800">{r.d}</span>
                <span className="text-slate-500">{r.done}/{r.total}</span>
              </div>
              <ProgressBar value={(r.done / r.total) * 100} color={r.done === r.total ? "#059669" : "#D4AF37"} />
              <div className="text-[10px] text-slate-500 mt-1">Owner: {r.owner}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5 overflow-x-auto">
        <div className="font-display text-lg text-navy-800 mb-3">Privilege Anomalies Detected</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-3 py-2.5">EMPLOYEE</th>
              <th className="text-left px-3 py-2.5">FINDING</th>
              <th className="text-left px-3 py-2.5">RISK</th>
              <th className="text-left px-3 py-2.5">RECOMMENDED ACTION</th>
              <th className="text-left px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {[
              { id: "EMP-10031", f: "Has phi:export but role doesn't require it", r: "High", a: "Revoke phi:export" },
              { id: "EMP-10024", f: "Last login 87 days ago · access still active", r: "Medium", a: "Disable + line-manager review" },
              { id: "EMP-10032", f: "Concurrent sessions in 3 tenants", r: "Medium", a: "Cap concurrent tenant scope" },
              { id: "EMP-10030", f: "Holds 4 elevated permissions · only needs 2", r: "Low", a: "Right-size to job description" },
            ].map((r) => (
              <tr key={r.id + r.f} className="border-b border-slate-100">
                <td className="px-3 py-3"><StaffChip e={byId(r.id)} /></td>
                <td className="px-3 py-3 text-slate-700">{r.f}</td>
                <td className="px-3 py-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold tracking-widest ${
                    r.r === "High" ? "bg-rose-100 text-rose-700" :
                    r.r === "Medium" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                  }`}>{r.r.toUpperCase()}</span>
                </td>
                <td className="px-3 py-3 text-xs text-slate-600">{r.a}</td>
                <td className="px-3 py-3 text-right">
                  <button className="text-xs px-2 py-1 rounded bg-navy-800 text-white">Apply</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ─────────────────── Encryption Tab ─────────────────── */

function EncryptionTab() {
  return (
    <>
      <div className="grid md:grid-cols-4 gap-4 mb-4">
        {[
          { l: "At-Rest Encryption", v: "100%", c: "#059669" },
          { l: "In-Transit (TLS 1.3)", v: "100%", c: "#059669" },
          { l: "Field-Level Encrypted Cols", v: "284" },
          { l: "Keys Managed", v: "412" },
        ].map((k) => (
          <div key={k.l} className="card p-5">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="font-display text-3xl mt-1" style={{ color: k.c || "#0B1D3A" }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Key Management (KMS)</div>
          <div className="space-y-2">
            {[
              { k: "Root key (HSM-backed)", a: "AES-256", r: "12 months", n: "Last rotated 2026-01-15", c: "#7c3aed" },
              { k: "Per-tenant DEKs (×120)", a: "AES-256-GCM", r: "90 days", n: "Auto-rotated weekly", c: "#0B1D3A" },
              { k: "Document signing keys", a: "Ed25519", r: "On-demand", n: "Used by BeyuDocSign", c: "#D4AF37" },
              { k: "TLS certs", a: "RSA-4096 / ECC P-384", r: "90 days", n: "Let's Encrypt auto-renew", c: "#0d9488" },
              { k: "Backup encryption keys", a: "AES-256", r: "365 days", n: "Held in escrow", c: "#557345" },
              { k: "Patient-controlled keys", a: "Curve25519", r: "User-controlled", n: "Wallet-backed (Citizen App)", c: "#be123c" },
            ].map((r) => (
              <div key={r.k} className="p-3 rounded-lg border border-slate-200 flex items-start gap-3">
                <span className="w-2 h-10 rounded shrink-0" style={{ background: r.c }} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-navy-800">{r.k}</div>
                  <div className="text-[11px] text-slate-500">{r.a} · rotation {r.r}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{r.n}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="font-display text-lg text-navy-800 mb-3">Field-Level Encryption</div>
          <div className="text-xs text-slate-500 mb-3">PHI columns encrypted at the field level with per-tenant DEKs</div>
          <div className="space-y-2">
            {[
              { c: "patients.full_name", n: 12458 },
              { c: "patients.national_id", n: 12458 },
              { c: "patients.phone", n: 12458 },
              { c: "patients.biometric_hash", n: 8412 },
              { c: "encounters.chief_complaint", n: 184028 },
              { c: "encounters.diagnosis_notes", n: 142098 },
              { c: "medications.dose", n: 84210 },
              { c: "lab_results.value", n: 248812 },
              { c: "imaging.dicom_payload_ref", n: 18412 },
            ].map((r) => (
              <div key={r.c} className="flex items-center gap-2 py-1.5 border-b border-slate-100">
                <I.lock size={12} stroke="#7c3aed" />
                <span className="font-mono text-xs text-navy-800 flex-1">{r.c}</span>
                <span className="text-[10px] text-slate-500">{r.n.toLocaleString()} rows</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-bold">AES-256</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5 bg-gradient-to-r from-violet-50 to-navy-50">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-violet-600 flex items-center justify-center"><I.lock size={20} stroke="#fff" /></div>
          <div>
            <div className="font-display text-lg text-navy-800">Compliance Certifications</div>
            <div className="text-xs text-slate-500">Periodically audited · evidence available in vault</div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {[
            "TZ DPA 2022", "GDPR (EU)", "HIPAA-aligned", "ISO 27001",
            "SOC 2 Type II", "FHIR R5", "HL7 v2.x", "OWASP ASVS L2",
            "PCI-DSS (M-Pesa)", "OAuth 2.1", "WebAuthn L3", "FIDO2",
          ].map((c) => (
            <div key={c} className="rounded bg-white border border-slate-200 px-3 py-2 text-center text-xs font-medium text-navy-800">{c}</div>
          ))}
        </div>
      </div>
    </>
  );
}
