"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Governed administrative actions — USERS.
 *
 * These components hold NO authority. They POST to the capability-guarded API
 * (identity:user.register / identity:user.suspend / identity:user.remove),
 * which re-authorizes, validates scope, executes and audits server-side. The
 * buttons are rendered only when the server has already verified the acting
 * principal's capability — that is presentation, never authorization.
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

export function RegisterUserForm({
  tenants,
}: {
  tenants: Array<{ id: string; code: string; name: string }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    displayName: "",
    countryCode: "",
    primaryTenantId: tenants[0]?.id ?? "",
    reason: "",
  });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setError(null);
    setDone(null);
    const result = await post("/api/v1/admin/users", {
      email: form.email,
      displayName: form.displayName,
      countryCode: form.countryCode ? form.countryCode.toUpperCase() : null,
      primaryTenantId: form.primaryTenantId,
      reason: form.reason,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone(
      `Identity registered (${form.email}). The user holds NO usable credential — no password was disclosed to anyone. Activate the identity separately when its credential procedure is complete.`,
    );
    setForm({ email: "", displayName: "", countryCode: "", primaryTenantId: tenants[0]?.id ?? "", reason: "" });
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <button type="button" className={button} onClick={() => setOpen(true)}>
          Register user
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-[color:var(--beyu-line)] p-4">
          <p className="text-[11.5px] beyu-muted">
            Registers the canonical party + user with a random, never-disclosed credential. The identity starts
            CREATED and cannot authenticate until separately activated. Membership and roles are separate
            governed acts. You will never see a password for this user.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={label}>Email (GlobalUserID holder)</span>
              <input className={input} value={form.email} onChange={(e) => set("email")(e.target.value)} placeholder="name@beyu.os" autoComplete="off" />
            </div>
            <div>
              <span className={label}>Display name</span>
              <input className={input} value={form.displayName} onChange={(e) => set("displayName")(e.target.value)} placeholder="Full name" />
            </div>
            <div>
              <span className={label}>Home tenant</span>
              <select className={input} value={form.primaryTenantId} onChange={(e) => set("primaryTenantId")(e.target.value)}>
                {tenants.map((t) => (
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
            <textarea className={input} rows={2} value={form.reason} onChange={(e) => set("reason")(e.target.value)} placeholder="Why this identity is being registered now" />
          </div>
          {error && <p className="text-[11.5px] text-rose-700 dark:text-rose-300" role="alert">{error}</p>}
          {done && <p className="text-[11.5px] text-emerald-700 dark:text-emerald-300" role="status">{done}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={busy || !form.email || !form.displayName || form.reason.trim().length < 10} onClick={submit}>
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

export function UserStatusActions({
  userId,
  status,
  canSuspend,
  canRemove,
  isSelf,
}: {
  userId: string;
  status: string;
  canSuspend: boolean;
  canRemove: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{ action: string; url: string } | null>(null);
  const [reason, setReason] = useState("");

  const actions: Array<{ action: string; label: string; url: string; show: boolean }> = [
    { action: "activate", label: "Activate", url: `/api/v1/admin/users/${userId}/status`, show: canSuspend && ["CREATED", "SUSPENDED", "DEACTIVATED"].includes(status) },
    { action: "suspend", label: "Suspend", url: `/api/v1/admin/users/${userId}/status`, show: canSuspend && status === "ACTIVE" && !isSelf },
    { action: "deactivate", label: "Deactivate", url: `/api/v1/admin/users/${userId}/status`, show: canSuspend && ["ACTIVE", "SUSPENDED"].includes(status) && !isSelf },
    { action: "remove", label: "Remove", url: `/api/v1/admin/users/${userId}/remove`, show: canRemove && status !== "REVOKED" && !isSelf },
  ];

  async function run(action: string, url: string) {
    setBusy(action);
    setError(null);
    const body = url.endsWith("/status") ? { action, reason } : { reason };
    const result = await post(url, body);
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
  if (visibleActions.length === 0) {
    return <span className="text-[11px] beyu-muted">{isSelf ? "own identity — governed actions refused" : "—"}</span>;
  }

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
              ? "IRREVERSIBLE governed act. The identity rows are retained for audit attribution; PII is anonymized and all access dies immediately."
              : `Confirm the governed ${prompt.action} transition. A reason of at least 10 characters is recorded in the immutable audit ledger.`}
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
        <p className="text-[11px] text-rose-700 dark:text-rose-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
