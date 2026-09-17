"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Governed administrative actions — MEMBERSHIP, ROLES, DELEGATIONS.
 *
 * Holds NO authority: every action POSTs to a capability-guarded API route,
 * which re-authorizes (including MFA step-up for the high-risk capabilities),
 * validates tenant/delegation scope, executes and audits server-side.
 */

const input =
  "w-full rounded-lg border border-[color:var(--beyu-line)] bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-[#d4af37]";
const label = "block text-[11px] font-medium tracking-wide beyu-muted mb-1";
const button =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#d4af37]/60 bg-[#d4af37]/15 px-3 text-[12px] font-semibold text-[#8a6d10] transition hover:bg-[#d4af37]/25 disabled:opacity-50 dark:text-[#efd98f]";
const ghostButton =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[color:var(--beyu-line)] px-3 text-[11.5px] font-medium transition hover:border-[#d4af37]/60 disabled:opacity-50";

type ApiError = { code?: string; message?: string; details?: unknown };

async function call(url: string, method: string, body: unknown): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: ApiError };
  if (!res.ok) {
    return { ok: false, message: json?.error?.message ?? `The governed action was refused (${res.status}).` };
  }
  return { ok: true, message: "The governed action was recorded." };
}

/* --------------------------- membership --------------------------- */

export function MembershipForm({
  users,
  tenants,
}: {
  users: Array<{ id: string; email: string; displayName: string | null }>;
  tenants: Array<{ id: string; code: string; name: string }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [form, setForm] = useState({ userId: users[0]?.id ?? "", tenantId: tenants[0]?.id ?? "", reason: "" });

  async function submit() {
    setBusy(true);
    setError(null);
    setDone(null);
    const result = await call("/api/v1/admin/memberships", "POST", form);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone("Membership recorded: an active TENANT_MEMBER assignment (zero capability). Assign roles separately for any actual authority.");
    setForm((f) => ({ ...f, reason: "" }));
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <button type="button" className={button} onClick={() => setOpen(true)}>
          Assign membership
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-[color:var(--beyu-line)] p-4">
          <p className="text-[11.5px] beyu-muted">
            Membership is the governed statement “this user belongs to this tenant”, recorded as an active
            TENANT_MEMBER role assignment — presence, never authority. Capabilities are separate role grants.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={label}>User</span>
              <select className={input} value={form.userId} onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName ?? u.email} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={label}>Tenant</span>
              <select className={input} value={form.tenantId} onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))}>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <span className={label}>Governed reason (audited)</span>
            <textarea className={input} rows={2} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
          {error && <p className="text-[11.5px] text-rose-700 dark:text-rose-300" role="alert">{error}</p>}
          {done && <p className="text-[11.5px] text-emerald-700 dark:text-emerald-300" role="status">{done}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={busy || form.reason.trim().length < 10} onClick={submit}>
              {busy ? "Assigning…" : "Confirm membership"}
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

export function RevokeMembershipButton({ userId, tenantId }: { userId: string; tenantId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await call("/api/v1/admin/memberships", "PUT", { userId, tenantId, reason });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOpen(false);
    setReason("");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-1">
      {!open ? (
        <button type="button" className={ghostButton} onClick={() => setOpen(true)}>
          Revoke
        </button>
      ) : (
        <div className="rounded-lg border border-[color:var(--beyu-line)] p-3">
          <p className="text-[11px] beyu-muted">
            End-dates EVERY active assignment of this user in the tenant and kills their sessions there. Home
            tenants are refused — that is a transfer.
          </p>
          <textarea className={`${input} mt-2`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audited)" aria-label="Reason for membership revocation" />
          <div className="mt-2 flex gap-2">
            <button type="button" className={button} disabled={busy || reason.trim().length < 10} onClick={submit}>
              {busy ? "Revoking…" : "Confirm revocation"}
            </button>
            <button type="button" className={ghostButton} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="max-w-xs text-[11px] text-rose-700 dark:text-rose-300" role="alert">{error}</p>}
    </div>
  );
}

/* --------------------------- roles --------------------------- */

export function GrantRoleForm({
  users,
  tenants,
  roles,
}: {
  users: Array<{ id: string; email: string; displayName: string | null }>;
  tenants: Array<{ id: string; code: string; name: string }>;
  roles: Array<{ code: string; name: string; privileged: boolean }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [form, setForm] = useState({
    userId: users[0]?.id ?? "",
    roleCode: roles[0]?.code ?? "",
    tenantId: tenants[0]?.id ?? "",
    justification: "",
  });

  async function submit() {
    setBusy(true);
    setError(null);
    setDone(null);
    const result = await call("/api/v1/admin/roles", "POST", form);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone("Role granted. The grant is effective on the user's next request (permissions are recomputed per request).");
    setForm((f) => ({ ...f, justification: "" }));
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <button type="button" className={button} onClick={() => setOpen(true)}>
          Grant role
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-[color:var(--beyu-line)] p-4">
          <p className="text-[11.5px] beyu-muted">
            HIGH-RISK governed act (MFA step-up enforced by the server). Self-grants and duplicate active grants
            are refused; privileged roles may be granted only by a PLATFORM_ADMIN.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <span className={label}>User</span>
              <select className={input} value={form.userId} onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName ?? u.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={label}>Role</span>
              <select className={input} value={form.roleCode} onChange={(e) => setForm((f) => ({ ...f, roleCode: e.target.value }))}>
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code}
                    {r.privileged ? " (privileged)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={label}>Tenant scope</span>
              <select className={input} value={form.tenantId} onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))}>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <span className={label}>Justification (audited)</span>
            <textarea className={input} rows={2} value={form.justification} onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))} />
          </div>
          {error && <p className="text-[11.5px] text-rose-700 dark:text-rose-300" role="alert">{error}</p>}
          {done && <p className="text-[11.5px] text-emerald-700 dark:text-emerald-300" role="status">{done}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={busy || form.justification.trim().length < 10} onClick={submit}>
              {busy ? "Granting…" : "Confirm grant"}
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

export function RevokeRoleButton({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await call(`/api/v1/admin/roles/${assignmentId}`, "POST", { reason });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOpen(false);
    setReason("");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-1">
      {!open ? (
        <button type="button" className={ghostButton} onClick={() => setOpen(true)}>
          Revoke
        </button>
      ) : (
        <div className="rounded-lg border border-[color:var(--beyu-line)] p-3">
          <p className="text-[11px] beyu-muted">
            End-dates the assignment. Effective immediately — the user&apos;s permission set is recomputed on
            every request. The last active PLATFORM_ADMIN assignment can never be revoked.
          </p>
          <textarea className={`${input} mt-2`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audited)" aria-label="Reason for role revocation" />
          <div className="mt-2 flex gap-2">
            <button type="button" className={button} disabled={busy || reason.trim().length < 10} onClick={submit}>
              {busy ? "Revoking…" : "Confirm revocation"}
            </button>
            <button type="button" className={ghostButton} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="max-w-xs text-[11px] text-rose-700 dark:text-rose-300" role="alert">{error}</p>}
    </div>
  );
}

/* --------------------------- delegations --------------------------- */

export function CreateDelegationForm({
  delegatees,
  tenants,
  delegatablePermissions,
}: {
  delegatees: Array<{ id: string; email: string; displayName: string | null }>;
  tenants: Array<{ id: string; code: string; name: string }>;
  delegatablePermissions: string[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [form, setForm] = useState({
    delegateeUserId: delegatees[0]?.id ?? "",
    permissions: [] as string[],
    scopeTenantIds: [] as string[],
    days: 30,
    reason: "",
  });

  const authoritySummary =
    form.permissions.length > 0
      ? `You are delegating only authority you currently possess: ${form.permissions.join(", ")}${
          form.scopeTenantIds.length > 0
            ? `, scoped to ${form.scopeTenantIds.length} tenant(s)`
            : ""
        }. The delegatee receives ONLY this capability and scope, for ${form.days} day(s).`
      : "Select at least one capability to see the authority summary.";

  async function submit() {
    setBusy(true);
    setError(null);
    setDone(null);
    const now = new Date();
    const effectiveTo = new Date(now.getTime() + form.days * 86_400_000);
    const result = await call("/api/v1/admin/delegations", "POST", {
      delegateeUserId: form.delegateeUserId,
      permissions: form.permissions,
      scopeTenantIds: form.scopeTenantIds,
      effectiveTo: effectiveTo.toISOString(),
      reason: form.reason,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone("Delegation instrument created (ACTIVE). It is resolved on every request: expiry and revocation take effect immediately.");
    setForm((f) => ({ ...f, permissions: [], scopeTenantIds: [], reason: "" }));
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <button type="button" className={button} onClick={() => setOpen(true)}>
          Create delegation
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-[color:var(--beyu-line)] p-4">
          <p className="text-[11.5px] beyu-muted">
            HIGH-RISK governed act (MFA step-up enforced by the server). A delegation can never exceed your own
            authority: only capabilities you hold through ROLE grants, only within your own tenant scope, at most
            90 days. Delegating authority is itself NOT delegable — chains have depth one.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={label}>Delegatee (administrator)</span>
              <select className={input} value={form.delegateeUserId} onChange={(e) => setForm((f) => ({ ...f, delegateeUserId: e.target.value }))}>
                {delegatees.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName ?? u.email} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={label}>Duration (days, max 90)</span>
              <input
                className={input}
                type="number"
                min={1}
                max={90}
                value={form.days}
                onChange={(e) => setForm((f) => ({ ...f, days: Math.min(90, Math.max(1, Number(e.target.value) || 1)) }))}
              />
            </div>
          </div>
          <div>
            <span className={label}>Capabilities (only what you hold through roles)</span>
            <div className="flex flex-wrap gap-1.5">
              {delegatablePermissions.map((p) => {
                const checked = form.permissions.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={checked}
                    className={`rounded border px-2 py-1 font-mono text-[10.5px] transition ${
                      checked
                        ? "border-[#d4af37]/70 bg-[#d4af37]/20 text-[#8a6d10] dark:text-[#efd98f]"
                        : "border-[color:var(--beyu-line)] beyu-muted hover:border-[#d4af37]/50"
                    }`}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        permissions: checked ? f.permissions.filter((x) => x !== p) : [...f.permissions, p],
                      }))
                    }
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <span className={label}>Tenant scope (explicit, never empty)</span>
            <div className="flex flex-wrap gap-1.5">
              {tenants.map((t) => {
                const checked = form.scopeTenantIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={checked}
                    className={`rounded border px-2 py-1 text-[10.5px] transition ${
                      checked
                        ? "border-[#d4af37]/70 bg-[#d4af37]/20 text-[#8a6d10] dark:text-[#efd98f]"
                        : "border-[color:var(--beyu-line)] beyu-muted hover:border-[#d4af37]/50"
                    }`}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        scopeTenantIds: checked ? f.scopeTenantIds.filter((x) => x !== t.id) : [...f.scopeTenantIds, t.id],
                      }))
                    }
                  >
                    {t.code}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <span className={label}>Reason (audited)</span>
            <textarea className={input} rows={2} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
          <div className="rounded-lg border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-2 text-[11.5px]">
            <strong className="font-semibold">Authority summary:</strong> {authoritySummary}
          </div>
          {error && <p className="text-[11.5px] text-rose-700 dark:text-rose-300" role="alert">{error}</p>}
          {done && <p className="text-[11.5px] text-emerald-700 dark:text-emerald-300" role="status">{done}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={busy || form.permissions.length === 0 || form.scopeTenantIds.length === 0 || form.reason.trim().length < 10}
              onClick={submit}
            >
              {busy ? "Creating…" : "Confirm delegation"}
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

export function RevokeDelegationButton({ delegationId }: { delegationId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await call(`/api/v1/admin/delegations/${delegationId}`, "POST", { reason });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOpen(false);
    setReason("");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-1">
      {!open ? (
        <button type="button" className={ghostButton} onClick={() => setOpen(true)}>
          Revoke
        </button>
      ) : (
        <div className="rounded-lg border border-[color:var(--beyu-line)] p-3">
          <p className="text-[11px] beyu-muted">
            Revocation is IMMEDIATE: delegated permissions are resolved per request, so the delegatee&apos;s very
            next request already sees zero authority from this instrument.
          </p>
          <textarea className={`${input} mt-2`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audited)" aria-label="Reason for delegation revocation" />
          <div className="mt-2 flex gap-2">
            <button type="button" className={button} disabled={busy || reason.trim().length < 10} onClick={submit}>
              {busy ? "Revoking…" : "Confirm revocation"}
            </button>
            <button type="button" className={ghostButton} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="max-w-xs text-[11px] text-rose-700 dark:text-rose-300" role="alert">{error}</p>}
    </div>
  );
}
