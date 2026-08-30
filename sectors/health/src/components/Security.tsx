import { useState, type ReactNode } from "react";
import { I } from "./Icons";
import { can, classificationStyle, roleFor, type Permission, type ClassificationLevel } from "../services/rbac";

/* ─────────────────── Permission Guard ─────────────────── */

/**
 * Wraps an action/region that requires a specific permission.
 * If denied, shows a lock and (optionally) a break-glass request UI.
 */
export function Guard({
  role, perm, children, fallback, breakGlass = false, justify,
}: {
  role: string;
  perm: Permission | Permission[];
  children: ReactNode;
  fallback?: ReactNode;
  breakGlass?: boolean;
  justify?: string;
}) {
  const perms = Array.isArray(perm) ? perm : [perm];
  const allowed = perms.every((p) => can(role, p));
  if (allowed) return <>{children}</>;
  if (fallback) return <>{fallback}</>;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex items-center gap-2 text-xs text-slate-500">
      <I.lock size={14} stroke="#64748b" />
      <span>
        Restricted · requires <span className="font-mono text-slate-700">{perms.join(", ")}</span>
        {justify && <span className="text-slate-400"> · {justify}</span>}
      </span>
      {breakGlass && can(role, "breakglass:request") && (
        <button className="ml-auto text-[10px] px-2 py-0.5 rounded bg-rose-600 text-white font-bold tracking-widest">
          BREAK-GLASS
        </button>
      )}
    </div>
  );
}

/* ─────────────────── Inline Permission Lock ─────────────────── */

export function PermLock({ role, perm }: { role: string; perm: Permission }) {
  if (can(role, perm)) return null;
  return (
    <span title={`Requires ${perm}`} className="inline-flex items-center gap-1 text-[10px] text-slate-400">
      <I.lock size={11} stroke="#94a3b8" />
    </span>
  );
}

/* ─────────────────── Classification Marker ─────────────────── */

export function Classification({ level }: { level: ClassificationLevel }) {
  const s = classificationStyle(level);
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] tracking-widest font-bold px-1.5 py-0.5 rounded border ${s.bg} ${s.text} ${s.border}`}>
      <I.shield size={10} stroke="currentColor" /> {s.label}
    </span>
  );
}

/* ─────────────────── PHI Field Marker ─────────────────── */

export function PHIField({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono">{children}</span>
      <span title={`Field-level encrypted${label ? ` · ${label}` : ""}`} className="text-[9px] text-violet-700 inline-flex items-center gap-0.5">
        <I.lock size={9} stroke="#7c3aed" />
        AES-256
      </span>
    </span>
  );
}

/* ─────────────────── Security Posture Banner ─────────────────── */

export function SecurityPostureBanner({ role, tenantName }: { role: string; tenantName: string }) {
  const r = roleFor(role);
  return (
    <div className="rounded-xl bg-gradient-to-r from-navy-800 via-navy-900 to-violet-900 text-white px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] mb-4">
      <div className="flex items-center gap-1.5">
        <I.shield size={14} stroke="#34d399" />
        <span className="text-emerald-300 font-semibold tracking-widest">ZERO-TRUST · SESSION SECURE</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-white/40">·</span>
        <I.fingerprint size={12} stroke="#D4AF37" />
        <span>WebAuthn + Biometric MFA</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-white/40">·</span>
        <I.building size={12} stroke="#D4AF37" />
        <span>Tenant scope: <span className="text-gold-300 font-medium">{tenantName}</span></span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-white/40">·</span>
        <I.lock size={12} stroke="#D4AF37" />
        <span>Role: <span className="text-gold-300 font-medium">{r.label}</span></span>
      </div>
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-white/40">·</span>
        <span>{r.permissions.length} permissions</span>
        <span className="text-white/40">·</span>
        <span>Session recorded</span>
      </div>
    </div>
  );
}

/* ─────────────────── Break-Glass Modal ─────────────────── */

export function BreakGlassPrompt({
  open, onClose, target, requiredPerm,
}: { open: boolean; onClose: () => void; target: string; requiredPerm: Permission }) {
  const [step, setStep] = useState<"justify" | "mfa" | "approving" | "granted">("justify");
  const [reason, setReason] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-navy-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full slidein overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-rose-700 to-rose-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <I.warning size={20} stroke="#fff" />
            </div>
            <div className="flex-1">
              <div className="text-[10px] tracking-[0.3em] text-rose-200">BREAK-GLASS ACCESS</div>
              <div className="font-display text-lg">Emergency Access Request</div>
            </div>
          </div>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-700">
            You are requesting <span className="font-mono text-rose-700">{requiredPerm}</span> on <span className="font-semibold">{target}</span>.
          </p>
          <p className="text-xs text-slate-500 mt-2">
            This action will be:
          </p>
          <ul className="text-xs text-slate-600 mt-1 space-y-1">
            <li className="flex items-center gap-2"><I.check size={12} stroke="#dc2626" /> Logged to the immutable audit trail</li>
            <li className="flex items-center gap-2"><I.check size={12} stroke="#dc2626" /> Notified to CMO, CRO and General Counsel</li>
            <li className="flex items-center gap-2"><I.check size={12} stroke="#dc2626" /> Reviewed within 24 hours</li>
            <li className="flex items-center gap-2"><I.check size={12} stroke="#dc2626" /> Recorded as a security event in SIEM</li>
          </ul>

          {step === "justify" && (
            <>
              <div className="mt-4">
                <label className="text-[10px] tracking-widest text-slate-500">JUSTIFICATION (REQUIRED)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-rose-500"
                  placeholder="e.g. Patient unconscious, no consent obtainable, need full history to safely treat..."
                />
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={onClose} className="btn-outline flex-1">Cancel</button>
                <button
                  onClick={() => setStep("mfa")}
                  disabled={reason.length < 20}
                  className="flex-1 py-2 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:bg-slate-300"
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {step === "mfa" && (
            <div className="mt-4 text-center">
              <div className="text-sm text-slate-700 mb-3">Confirm with biometric authentication</div>
              <button
                onClick={() => { setStep("approving"); setTimeout(() => setStep("granted"), 1200); }}
                className="w-24 h-24 mx-auto rounded-full bg-rose-50 ring-4 ring-rose-300 flex items-center justify-center hover:bg-rose-100"
              >
                <I.fingerprint size={48} stroke="#dc2626" />
              </button>
              <div className="text-[11px] text-slate-500 mt-3">Tap to scan</div>
            </div>
          )}

          {step === "approving" && (
            <div className="mt-4 text-center py-6">
              <div className="text-sm text-slate-600">Notifying approvers...</div>
              <div className="mt-3 text-xs text-slate-500">CMO · CRO · General Counsel</div>
            </div>
          )}

          {step === "granted" && (
            <div className="mt-4 text-center py-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center"><I.check size={32} stroke="#059669" /></div>
              <div className="font-display text-lg text-navy-800 mt-3">Access Granted</div>
              <div className="text-xs text-slate-500 mt-1">Valid for 60 minutes · session being recorded</div>
              <button onClick={onClose} className="btn-primary mt-4 w-full">Proceed</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── Tenant Isolation Notice ─────────────────── */

export function TenantIsolationNotice({ tenant }: { tenant: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-xs text-violet-800">
      <I.lock size={14} stroke="#7c3aed" />
      <span>
        Strict tenant isolation enforced · all queries scoped to <span className="font-semibold">{tenant}</span> ·
        cross-tenant access requires patient consent + dual approval.
      </span>
    </div>
  );
}
