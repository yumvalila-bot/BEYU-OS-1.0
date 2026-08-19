"use client";

import { useState } from "react";

type Result = { control: string; area: string; expectation: string; passed: boolean; detail: string };
type Payload = { summary: { total: number; passed: number; failed: number; executedAt: string }; results: Result[] };

export function SelfTestPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/system/self-test");
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Self-test rejected.");
        return;
      }
      setData(json.data as Payload);
    } catch {
      setError("Unable to execute the assurance self-test.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="beyu-panel px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="beyu-kicker text-[#b08d1c]">Continuous control assurance</div>
          <h2 className="mt-1 text-[15px] font-semibold">Quality gate self-test</h2>
          <p className="mt-1 max-w-2xl text-[12px] beyu-muted">
            Executes deterministic control tests against the live system: audit chain integrity, policy
            hierarchy consistency, tenant isolation, classification ceiling, waterfall determinism, tax
            jurisdiction gating, AI authority boundary and referential integrity.
          </p>
        </div>
        <button onClick={run} disabled={busy} className="rounded-lg bg-[#0b1d3a] px-4 py-2.5 text-[12.5px] font-semibold text-white transition hover:bg-[#16294a] disabled:opacity-60">
          {busy ? "Running…" : "Run self-test"}
        </button>
      </div>

      {error && <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">{error}</div>}

      {data && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap gap-2 text-[11.5px]">
            <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 font-semibold">{data.summary.passed} passed</span>
            {data.summary.failed > 0 && <span className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 font-semibold">{data.summary.failed} failed</span>}
            <span className="rounded-md border border-[color:var(--beyu-line)] px-2 py-1 beyu-muted">{new Date(data.summary.executedAt).toISOString().replace("T", " ").slice(0, 19)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Control</th><th>Area</th><th>Expectation</th><th>Result</th><th>Detail</th></tr></thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.control}>
                    <td className="font-mono text-[11px]">{r.control}</td>
                    <td className="text-[11.5px]">{r.area}</td>
                    <td className="text-[11.5px]">{r.expectation}</td>
                    <td>
                      <span className={`rounded-full border px-2 py-[3px] text-[10.5px] font-semibold ${r.passed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"}`}>
                        {r.passed ? "PASS" : "FAIL"}
                      </span>
                    </td>
                    <td className="max-w-md text-[11px] beyu-muted">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
