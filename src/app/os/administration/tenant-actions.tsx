"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Governed administrative actions — TENANTS.
 *
 * Holds NO authority: every action POSTs to the capability-guarded API
 * (organization:tenant.register / tenant.manage / tenant.remove). The remove
 * act is dependency-checked server-side and refuses safely with the blocking
 * conditions; this UI only ever renders what the server authorizes.
 */

const input =
  "w-full rounded-lg border border-[color:var(--beyu-line)] bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-[#d4af37]";
const label = "block text-[11px] font-medium tracking-wide beyu-muted mb-1";
const button =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#d4af37]/60 bg-[#d4af37]/15 px-3 text-[12px] font-semibold text-[#8a6d10] transition hover:bg-[#d4af37]/25 disabled:opacity-50 dark:text-[#efd98f]";
const ghostButton =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[color:var(--beyu-line)] px-3 text-[11.5px] font-medium transition hover:border-[#d4af37]/60 disabled:opacity-50";

type ApiError = { code?: string; message?: string; details?: unknown };

async function post(url: string, body: unknown): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: ApiError };
  if (!res.ok) {
    return { ok: false, message: json?.error?.message ?? `The governed action was refused (${res.status}).` };
  }
  return { ok: true, message: "The governed action was recorded." };
}

const TENANT_TYPES = ["SECTOR", "COUNTRY", "LEGAL_ENTITY", "BRANCH", "DEPARTMENT", "ENTERPRISE"] as const;

export function RegisterTenantForm({
  parentTenants,
}: {
  parentTenants: Array<{ id: string; code: string; name: string }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "SECTOR" as (typeof TENANT_TYPES)[number],
    parentTenantId: parentTenants[0]?.id ?? "",
    countryCode: "",
    reason: "",
  });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setError(null);
    setDone(null);
    const result = await post("/api/v1/admin/tenants", {
      code: form.code.toUpperCase(),
      name: form.name,
      type: form.type,
      parentTenantId: form.parentTenantId,
      countryCode: form.countryCode ? form.countryCode.toUpperCase() : null,
      reason: form.reason,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone(`Tenant ${form.code.toUpperCase()} registered (status CREATED). Activate it to bring it into operation.`);
    setForm({ code: "", name: "", type: "SECTOR", parentTenantId: parentTenants[0]?.id ?? "", countryCode: "", reason: "" });
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <button type="button" className={button} onClick={() => setOpen(true)}>
          Register tenant
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-[color:var(--beyu-line)] p-4">
          <p className="text-[11.5px] beyu-muted">
            Registers a tenant through the canonical organization model: code uniqueness, parent hierarchy,
            country reference and isolation metadata are validated server-side. The tenant starts CREATED.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={label}>Tenant code (unique)</span>
              <input className={input} value={form.code} onChange={(e) => set("code")(e.target.value.toUpperCase())} placeholder="BEYU-XXX" />
            </div>
            <div>
              <span className={label}>Organizational name</span>
              <input className={input} value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="Legal / operating name" />
            </div>
            <div>
              <span className={label}>Type</span>
              <select className={input} value={form.type} onChange={(e) => set("type")(e.target.value)}>
                {TENANT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={label}>Parent tenant</span>
              <select className={input} value={form.parentTenantId} onChange={(e) => set("parentTenantId")(e.target.value)}>
                {parentTenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={label}>Country (optional)</span>
              <input className={input} value={form.countryCode} onChange={(e) => set("countryCode")(e.target.value)} placeholder="TZ" maxLength={2} />
            </div>
          </div>
          <div>
            <span className={label}>Governed reason (audited)</span>
            <textarea className={input} rows={2} value={form.reason} onChange={(e) => set("reason")(e.target.value)} placeholder="Why this tenant is being registered" />
          </div>
          {error && <p className="text-[11.5px] text-rose-700 dark:text-rose-300" role="alert">{error}</p>}
          {done && <p className="text-[11.5px] text-emerald-700 dark:text-emerald-300" role="status">{done}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={busy || !form.code || !form.name || form.reason.trim().length < 10} onClick={submit}>
              {busy ? "Registering…" : "Confirm registration"}
            </button>
            <button type="button" className={ghostButton} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TenantStatusActions({
  tenantId,
  status,
  canManage,
  canRemove,
}: {
  tenantId: string;
  status: string;
  canManage: boolean;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{ action: string; url: string } | null>(null);
  const [reason, setReason] = useState("");

  const actions: Array<{ action: string; label: string; url: string; show: boolean }> = [
    { action: "activate", label: "Activate", url: `/api/v1/admin/tenants/${tenantId}/status`, show: canManage && ["CREATED", "SUSPENDED", "DEACTIVATED"].includes(status) },
    { action: "suspend", label: "Suspend", url: `/api/v1/admin/tenants/${tenantId}/status`, show: canManage && status === "ACTIVE" },
    { action: "deactivate", label: "Deactivate", url: `/api/v1/admin/tenants/${tenantId}/status`, show: canManage && ["ACTIVE", "SUSPENDED"].includes(status) },
    { action: "archive", label: "Archive", url: `/api/v1/admin/tenants/${tenantId}/status`, show: canManage && ["ACTIVE", "SUSPENDED", "DEACTIVATED"].includes(status) },
    { action: "remove", label: "Remove", url: `/api/v1/admin/tenants/${tenantId}/remove`, show: canRemove && status !== "REVOKED" },
  ];

  async function run(action: string, url: string) {
    setBusy(action);
    setError(null);
    const result = await post(url, { action, reason });
    setBusy(null);
    setPrompt(null);
    setReason("");
    if (!result.ok) {
      setError(result.message);
      return;
    }
    startTransition(() => router.refresh());
  }

  const visibleActions = actions.filter((a) => a.show);
  if (visibleActions.length === 0) return <span className="text-[11px] beyu-muted">—</span>;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {visibleActions.map((a) => (
          <button
            key={a.action}
            type="button"
            className={a.action === "remove" ? `${ghostButton} border-rose-400/60 text-rose-700 dark:text-rose-300` : ghostButton}
            disabled={Boolean(busy)}
            onClick={() => {
              setPrompt({ action: a.action, url: a.url });
              setReason("");
            }}
          >
            {busy === a.action ? "…" : a.label}
          </button>
        ))}
      </div>
      {prompt && (
        <div className="rounded-lg border border-[color:var(--beyu-line)] p-3">
          <p className="text-[11px] beyu-muted">
            {prompt.action === "remove"
              ? "IRREVERSIBLE governed act, dependency-checked server-side. Live users, sessions, grants, entities or operational rows BLOCK it and are reported. Legal, financial and audit history is always retained."
              : `Confirm the governed ${prompt.action} transition. Sessions inside the tenant die immediately when moving away from ACTIVE.`}
          </p>
          <textarea
            className={`${input} mt-2`}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (audited)"
            aria-label={`Reason for ${prompt.action}`}
          />
          <div className="mt-2 flex gap-2">
            <button type="button" className={button} disabled={reason.trim().length < 10} onClick={() => run(prompt.action, prompt.url)}>
              Confirm {prompt.action}
            </button>
            <button type="button" className={ghostButton} onClick={() => setPrompt(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="max-w-md text-[11px] text-rose-700 dark:text-rose-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
