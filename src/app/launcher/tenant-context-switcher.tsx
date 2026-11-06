"use client";

import { useState, type FormEvent } from "react";
import type { SessionTenantContextChoice } from "@/lib/session-tenant-context";

/**
 * Presentation-only context selector. The server revalidates MFA and a direct
 * effective grant on every POST; the option list and selected value grant
 * nothing. A full navigation re-resolves every destination and RLS context.
 */
export function TenantContextSwitcher({
  contexts,
}: {
  contexts: SessionTenantContextChoice[];
}) {
  const current = contexts.find((context) => context.current)?.code ?? contexts[0]?.code ?? "";
  const [selected, setSelected] = useState(current);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || selected === current) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/tenant-context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantCode: selected }),
      });
      const body = await response.json().catch(() => null) as {
        error?: { code?: string; message?: string };
      } | null;
      if (!response.ok) {
        setError(
          response.status === 428
            ? "Your MFA step-up window has expired. Sign in again with MFA, then retry."
            : body?.error?.message ?? "The tenant context could not be changed.",
        );
        return;
      }
      window.location.assign("/launcher");
    } catch {
      setError("The tenant context service is unavailable. Your current context is unchanged.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="tenant-context-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h2 id="tenant-context-heading" className="text-[13px] font-semibold text-[#0b1f4d]">
            Tenant context
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
            Select only where you hold a direct active grant. Switching requires current MFA step-up and changes no role,
            membership, home tenant or global scope. Every destination re-checks authorization after the switch.
          </p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="text-[11px] font-semibold text-slate-600">
            <span className="mb-1 block">Authorized context</span>
            <select
              name="tenantCode"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              disabled={pending}
              className="min-h-10 min-w-56 rounded-lg border border-slate-300 bg-white px-3 text-[12px] text-slate-900 focus:border-[#d4a017] focus:outline-none focus:ring-2 focus:ring-[#d4a017]/30 disabled:opacity-60"
            >
              {contexts.map((context) => (
                <option key={context.code} value={context.code}>
                  {context.code} — {context.name}{context.current ? " (current)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={pending || selected === current}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#0b1f4d] px-4 text-[12px] font-semibold text-white transition hover:bg-[#14336d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a017] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Switching…" : "Switch context"}
          </button>
        </form>
      </div>
      {error && <p role="alert" className="mt-3 text-[12px] font-medium text-red-700">{error}</p>}
    </section>
  );
}
