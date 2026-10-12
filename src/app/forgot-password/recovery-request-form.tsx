"use client";

import { useState } from "react";

/**
 * The recovery REQUEST form.
 *
 * It holds no credential and can change none: it sends the identity address to
 * the one governed endpoint, which records a request in the audit ledger and
 * answers identically whether or not the identity exists. The single message on
 * screen after submitting is the server's own account-agnostic sentence, so the
 * transaction cannot be used to enumerate BEYU identities.
 */
export function RecoveryRequestForm() {
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const value = identifier.trim();
    if (value.length < 3) {
      setError("Enter the BEYU identity address you sign in with.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/auth/recovery/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: value }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "The request could not be recorded. Try again shortly.");
        return;
      }
      setMessage(json?.data?.message ?? "Your request has been recorded.");
      setIdentifier("");
    } catch {
      setError("The control plane is unreachable. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "h-12 w-full rounded-[13px] border border-[#d5e0ef] bg-white px-3.5 text-[14px] text-[#0B1F4D] placeholder:text-[#64748b] outline-none transition focus:border-[#0B1F4D] focus-visible:ring-2 focus-visible:ring-[#0B1F4D]/35 disabled:opacity-60";

  return (
    <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
      <div>
        <label className="block text-[12.5px] font-semibold text-[#0B1F4D]" htmlFor="beyu-recovery-identifier">
          Username <span className="beyu-gold-ink" aria-hidden="true">:</span>
        </label>
        <input
          id="beyu-recovery-identifier"
          name="identifier"
          className={`${field} mt-1.5`}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Enter your username"
          aria-describedby="beyu-recovery-help beyu-recovery-error"
          disabled={busy}
          required
        />
        <p id="beyu-recovery-help" className="mt-1.5 text-[11px] text-[#5b6b85]">
          Your BEYU identity address, for example name@beyu.os. Recovery is performed by an authorised identity
          administrator — no password is ever sent to you or shown on screen.
        </p>
      </div>

      <div
        id="beyu-recovery-error"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className={
          error ? "rounded-[13px] border border-[#e6b0b0] bg-[#fdf1f1] px-3.5 py-2.5 text-[12.5px] text-[#8c2b2b]" : undefined
        }
      >
        {error}
      </div>

      <div
        id="beyu-recovery-status"
        role="status"
        className={
          message
            ? "rounded-[13px] border border-[#bfe0c8] bg-[#f1faf3] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#1f5b34]"
            : undefined
        }
      >
        {message}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <a
          href="/sign-in"
          className="flex h-12 items-center justify-center rounded-[12px] border border-[#0B1F4D] bg-white text-[14px] font-semibold text-[#0B1F4D] transition hover:bg-[#f2f7fe] focus-visible:ring-2 focus-visible:ring-[#0B1F4D]/40 focus-visible:outline-none"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={busy}
          className="h-12 rounded-[12px] bg-[#0B1F4D] text-[14px] font-semibold text-white transition hover:bg-[#132c62] focus-visible:ring-2 focus-visible:ring-[#0B1F4D]/40 focus-visible:outline-none disabled:opacity-60"
        >
          {busy ? "Recording…" : "Request recovery"}
        </button>
      </div>
    </form>
  );
}
