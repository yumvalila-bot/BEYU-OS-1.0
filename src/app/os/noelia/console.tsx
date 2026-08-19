"use client";

import { useState } from "react";

type Answer = {
  decisionId: string;
  engine: string;
  outputClass: string;
  headline: string;
  findings: { label: string; value: string; kind: string }[];
  narrative: string;
  sources: { kind: string; ref: string; label: string; authority: string }[];
  confidence: number;
  humanReviewRequired: boolean;
  deniedScopes: string[];
  policyDecision: string;
  toolsUsed: string[];
  latencyMs: number;
};

const SUGGESTIONS = [
  "How is enterprise liquidity and the capital pipeline positioned this quarter?",
  "Which risks currently exceed our enterprise risk appetite?",
  "What is our compliance status across frameworks and jurisdictions?",
  "Which governance resolutions are awaiting a decision?",
  "What tax positions are available to the Tanzanian entities?",
  "What is the current workforce headcount by employing entity?",
];

const CLASS_TONE: Record<string, string> = {
  FACT: "border-emerald-500/40 bg-emerald-500/10",
  INFERENCE: "border-sky-500/40 bg-sky-500/10",
  RECOMMENDATION: "border-amber-500/40 bg-amber-500/10",
  PREDICTION: "border-violet-500/40 bg-violet-500/10",
  UNCERTAINTY: "border-slate-500/40 bg-slate-500/10",
  REQUIRES_HUMAN_REVIEW: "border-rose-500/40 bg-rose-500/10",
};

export function NoeliaConsole({
  principal,
}: {
  principal: { name: string; roles: string[]; clearance: string; tenant: string };
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask(q: string) {
    if (q.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/ai/noelia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Noelia declined the request.");
        setAnswer(null);
        return;
      }
      setAnswer(json.data as Answer);
    } catch {
      setError("The HIVE runtime is unreachable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="beyu-panel overflow-hidden">
      <div className="beyu-shell px-5 py-4 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[16px] font-semibold">Hello, I&apos;m <span className="text-[#d4af37]">Noelia</span></div>
            <div className="mt-0.5 text-[11.5px] text-white/60">
              Operating for {principal.name} · {principal.roles.join(", ") || "no roles"} · tenant {principal.tenant} · clearance {principal.clearance}
            </div>
          </div>
          <div className="text-[10px] tracking-[0.16em] text-white/45">HIVE RUNTIME · POLICY ENFORCED · FULLY AUDITED</div>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => { setQuestion(s); void ask(s); }}
              className="rounded-full border border-[color:var(--beyu-line)] px-3 py-1.5 text-[11.5px] transition hover:border-[#d4af37]/60"
            >
              {s}
            </button>
          ))}
        </div>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); void ask(question); }}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask Noelia anything within your authority…"
            className="flex-1 rounded-lg border border-[color:var(--beyu-line)] bg-transparent px-4 py-3 text-[13px] outline-none focus:border-[#d4af37]"
          />
          <button disabled={busy} className="rounded-lg bg-[#d4af37] px-5 py-3 text-[12.5px] font-semibold text-[#0b1d3a] transition hover:bg-[#e2c25f] disabled:opacity-60">
            {busy ? "Thinking…" : "Ask"}
          </button>
        </form>

        {error && <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">{error}</div>}

        {answer && (
          <div className={`mt-4 rounded-xl border px-4 py-4 ${CLASS_TONE[answer.outputClass] ?? "border-[color:var(--beyu-line)]"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[14px] font-semibold">{answer.headline}</div>
              <div className="flex flex-wrap gap-1 text-[10.5px]">
                <span className="rounded-full border border-current/30 px-2 py-[3px] font-semibold">{answer.outputClass}</span>
                <span className="rounded-full border border-[color:var(--beyu-line)] px-2 py-[3px]">{answer.engine} engine</span>
                <span className="rounded-full border border-[color:var(--beyu-line)] px-2 py-[3px]">confidence {(answer.confidence * 100).toFixed(0)}%</span>
              </div>
            </div>

            {answer.findings.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {answer.findings.map((f, i) => (
                  <div key={i} className="rounded-lg border border-[color:var(--beyu-line)] bg-[color:var(--beyu-card)] px-3 py-2">
                    <div className="beyu-kicker beyu-muted">{f.kind} · {f.label}</div>
                    <div className="mt-1 text-[12.5px] font-medium">{f.value}</div>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-3 text-[12.5px] leading-relaxed">{answer.narrative}</p>

            <div className="mt-3 grid gap-2 text-[11px] beyu-muted sm:grid-cols-2">
              <div>
                <span className="beyu-kicker">Sources </span>
                {answer.sources.length > 0
                  ? answer.sources.map((s) => `${s.kind}:${s.ref} (${s.authority})`).join(" · ")
                  : "no authoritative source retrieved"}
              </div>
              <div>
                <span className="beyu-kicker">Tools </span>{answer.toolsUsed.join(" · ") || "none"}
                <div><span className="beyu-kicker">Policy </span>{answer.policyDecision} · decision {answer.decisionId.slice(0, 18)}… · {answer.latencyMs}ms</div>
              </div>
            </div>

            {answer.deniedScopes.length > 0 && (
              <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11.5px]">
                Scopes withheld from this answer: {answer.deniedScopes.join(", ")}
              </div>
            )}

            {answer.humanReviewRequired && (
              <div className="mt-3 rounded-lg border border-[#d4af37]/50 bg-[#d4af37]/10 px-3 py-2 text-[11.5px] font-medium">
                HUMAN REVIEW REQUIRED — this output may not be relied upon for a material decision until an
                accountable human reviews and disposes it in the AI decision register.
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
