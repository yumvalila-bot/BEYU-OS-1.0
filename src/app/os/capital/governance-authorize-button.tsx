"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Records that a capital request has satisfied its GOVERNANCE PREREQUISITE.
 *
 * This is NOT an execution control. It moves no money, posts no journal entry
 * and releases no treasury funds — the label says so explicitly so the action
 * can never be mistaken for funding.
 *
 * Holds no authoritative state: eligibility is resolved server-side and the
 * result is re-read from the database via router.refresh(). The button never
 * optimistically shows a transition.
 */
export function GovernanceAuthorizeButton({
  capitalRequestId,
  code,
}: {
  capitalRequestId: string;
  code: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function authorize() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/v1/finance/capital/${capitalRequestId}/governance-authorization`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "The request was rejected.");
        return;
      }
      const d = json.data as { resolutionReference: string; governanceBodyCode: string };
      setNotice(
        `${code} is governance-authorized under ${d.resolutionReference} (${d.governanceBodyCode}). No capital was executed.`,
      );
      startTransition(() => router.refresh());
    } catch {
      setError("Unable to reach the capital service. Nothing was recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1">
      <button
        onClick={authorize}
        disabled={busy || pending}
        className="rounded-lg bg-[#0b1d3a] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[#16294a] disabled:opacity-60"
      >
        Record governance authorization
      </button>
      <div className="mt-1 text-[10.5px] beyu-muted">Prerequisite only — does not execute capital.</div>
      {error && <div className="mt-1 text-[10.5px] text-rose-700 dark:text-rose-300">{error}</div>}
      {notice && <div className="mt-1 text-[10.5px] text-emerald-700 dark:text-emerald-400">{notice}</div>}
    </div>
  );
}
