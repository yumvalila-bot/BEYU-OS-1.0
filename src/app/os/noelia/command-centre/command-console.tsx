"use client";

import { useState, useTransition } from "react";
import { Badge, Panel } from "@/components/brand";

/**
 * QUEEN BEE COMMAND — the interactive surface of the Command Centre.
 *
 * Every control performs exactly one advertised action against a real backend
 * route; there are no decorative buttons. A control whose capability the caller
 * is not authorized for is DISABLED and says why, rather than silently failing.
 *
 * Response rendering is intentionally conservative: findings show their
 * epistemic label, simulated values are visually distinct, and a degraded or
 * denied result is stated plainly rather than being hidden.
 */

type Finding = { label: string; value: string; kind: string };

type ApiEnvelope =
  | {
      ok: true;
      data: {
        headline?: string;
        findings?: Finding[];
        recommendations?: Array<{ headline?: string; title?: string; rationale?: string }>;
        scenarios?: string[];
        observedFacts?: string[];
        derivedConclusions?: string[];
        whatIsMissing?: string[];
        assumptions?: string[];
        limitations?: string[];
        uncertainty?: string[];
        confidence?: number;
        humanReviewRequired?: boolean;
        requiresHumanDecision?: string[];
        scenariosIncluded?: string[];
        metadata?: Record<string, unknown>;
      };
    }
  | { ok: false; error: { code?: string; message?: string } };

type Mode = "WORLD_MODEL" | "COUNCIL" | "SIMULATION" | "KNOWLEDGE_GRAPH";

const KIND_TONE: Record<string, string> = {
  FACT: "green",
  INFERENCE: "slate",
  RECOMMENDATION: "amber",
  SIMULATION: "amber",
  UNKNOWN: "red",
};

export function CommandCentreConsole({
  authorizedCapabilities,
  hasExecutive,
  hasSimulation,
  hasWorldModel,
  hasGraph,
}: {
  authorizedCapabilities: string[];
  hasExecutive: boolean;
  hasSimulation: boolean;
  hasWorldModel: boolean;
  hasGraph: boolean;
}) {
  const [mode, setMode] = useState<Mode>(hasWorldModel ? "WORLD_MODEL" : "KNOWLEDGE_GRAPH");
  const [question, setQuestion] = useState("");
  const [subject, setSubject] = useState("");
  const [objective, setObjective] = useState("");
  const [result, setResult] = useState<ApiEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const modes: Array<{ id: Mode; label: string; enabled: boolean; reason?: string }> = [
    { id: "WORLD_MODEL", label: "World model", enabled: hasWorldModel, reason: "Requires noelia.world_model.query" },
    { id: "KNOWLEDGE_GRAPH", label: "Knowledge graph", enabled: hasGraph, reason: "Requires noelia.knowledge_graph.query" },
    { id: "COUNCIL", label: "Intelligence Council", enabled: hasExecutive, reason: "Requires ai:executive.read" },
    { id: "SIMULATION", label: "Strategic simulation", enabled: hasSimulation, reason: "Requires ai:analytics.read" },
  ];

  const canSubmit =
    !pending &&
    ((mode === "WORLD_MODEL" && hasWorldModel) ||
      (mode === "KNOWLEDGE_GRAPH" && hasGraph && subject.trim().length > 0) ||
      (mode === "COUNCIL" && hasExecutive && question.trim().length >= 10) ||
      (mode === "SIMULATION" && hasSimulation && objective.trim().length >= 5));

  async function submit() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const payload =
          mode === "WORLD_MODEL"
            ? { limit: 30 }
            : mode === "KNOWLEDGE_GRAPH"
              ? { subjectType: "ENTITY", subjectRef: subject.trim(), depth: 2 }
              : mode === "SIMULATION"
                ? {
                    objective: objective.trim(),
                    scenarioKind: "CAPITAL_PLANNING",
                    method: "LINEAR_COMBINATION",
                    variables: [
                      {
                        key: "BASE",
                        label: "Baseline driver",
                        optimistic: 100,
                        baseline: 100,
                        adverse: 100,
                        unit: "index",
                        provenance: "ESTIMATE",
                      },
                    ],
                    assumptions: ["Illustrative index only; replace with recorded drivers before relying on it"],
                  }
                : { question: question.trim(), findings: [] };

        const route =
          mode === "WORLD_MODEL"
            ? "/api/v1/ai/noelia/cognitive/world-model"
            : mode === "KNOWLEDGE_GRAPH"
              ? "/api/v1/ai/noelia/cognitive/knowledge-graph"
              : mode === "SIMULATION"
                ? "/api/v1/ai/noelia/cognitive/simulation"
                : "/api/v1/ai/noelia/cognitive/council";

        const response = await fetch(route, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = (await response.json()) as ApiEnvelope;
        if (!response.ok || !body.ok) {
          const message = "error" in body ? body.error?.message ?? `Request failed (${response.status})` : `Request failed (${response.status})`;
          setError(message);
          return;
        }
        setResult(body);
      } catch {
        setError("The request could not be completed. Check your connection and try again.");
      }
    });
  }

  const data = result && result.ok ? result.data : null;

  return (
    <Panel
      kicker="QUEEN BEE COMMAND"
      title="Ask NOELIA to observe, deliberate or simulate"
      action={<Badge tone="slate">{authorizedCapabilities.length} capabilities authorized</Badge>}
    >
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Cognitive mode">
        {modes.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            disabled={!item.enabled}
            onClick={() => setMode(item.id)}
            title={item.enabled ? item.label : `${item.label} — ${item.reason}`}
            className={`rounded-md border px-3 py-2 text-[11.5px] font-medium transition-colors ${
              mode === item.id
                ? "border-[#b08d1c] bg-[#b08d1c]/10 text-[#7a5c07] dark:text-[#efd98f]"
                : "border-black/10 dark:border-white/15"
            } ${item.enabled ? "hover:border-[#b08d1c]" : "cursor-not-allowed opacity-50"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2.5">
        {mode === "KNOWLEDGE_GRAPH" && (
          <label className="block">
            <span className="beyu-kicker beyu-muted">Legal entity id</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="e.g. LEN_BEYU_HOLDINGS"
              className="mt-1 w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-[13px] dark:border-white/20"
            />
          </label>
        )}

        {mode === "COUNCIL" && (
          <label className="block">
            <span className="beyu-kicker beyu-muted">Institutional question (min 10 characters)</span>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={3}
              placeholder="e.g. Should BEYU establish another hospital in the Kagera region?"
              className="mt-1 w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-[13px] dark:border-white/20"
            />
          </label>
        )}

        {mode === "SIMULATION" && (
          <label className="block">
            <span className="beyu-kicker beyu-muted">Simulation objective</span>
            <input
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="e.g. Model the capital envelope for a 40-bed expansion"
              className="mt-1 w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-[13px] dark:border-white/20"
            />
          </label>
        )}

        {mode === "WORLD_MODEL" && (
          <p className="text-[12px] beyu-muted">
            Reads your authorized slice of the institutional world model: recorded entities, relationships and explicit
            unavailability. No financial value is estimated.
          </p>
        )}

        {mode === "SIMULATION" && (
          <p className="rounded-md border border-[#b08d1c]/40 bg-[#b08d1c]/5 px-3 py-2 text-[11.5px] leading-relaxed">
            A simulation is illustrative arithmetic, not a forecast or an institutional record. It is never posted and
            never changes a live record.
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-md bg-[#0b1f3a] px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#efd98f] dark:text-[#0b1f3a]"
        >
          {pending ? "Working…" : "Run"}
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-2.5 text-[12.5px]">
          {error}
        </div>
      )}

      {pending && (
        <p role="status" className="mt-4 text-[12.5px] beyu-muted">
          Running through the governed HIVE runtime…
        </p>
      )}

      {data && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {typeof data.confidence === "number" && <Badge tone="slate">confidence {data.confidence.toFixed(2)}</Badge>}
            {data.humanReviewRequired && <Badge tone="amber">human review required</Badge>}
            {data.metadata?.resultClass === "SIMULATION" && <Badge tone="amber">SIMULATION — not a record</Badge>}
          </div>

          {data.headline && <p className="text-[13.5px] font-semibold">{data.headline}</p>}

          {data.findings && data.findings.length > 0 && (
            <ul className="space-y-1.5">
              {data.findings.slice(0, 40).map((finding, index) => (
                <li key={`${finding.label}-${index}`} className="rounded-md border border-black/10 px-3 py-2 dark:border-white/10">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[12.5px]">{finding.value}</span>
                    <Badge tone={KIND_TONE[finding.kind] ?? "slate"}>{finding.kind}</Badge>
                  </div>
                  <div className="mt-0.5 text-[10.5px] beyu-muted">{finding.label}</div>
                </li>
              ))}
            </ul>
          )}

          {data.scenarios && data.scenarios.length > 0 && (
            <div className="rounded-md border border-[#b08d1c]/40 bg-[#b08d1c]/5 px-3 py-2">
              <div className="beyu-kicker text-[#a8830f]">SIMULATED OUTCOMES (not records)</div>
              <ul className="mt-1 space-y-0.5">
                {data.scenarios.map((line, index) => (
                  <li key={index} className="font-mono text-[11.5px]">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.recommendations && data.recommendations.length > 0 && (
            <div>
              <div className="beyu-kicker beyu-muted">RECOMMENDATIONS (human decision required)</div>
              <ul className="mt-1 space-y-1">
                {data.recommendations.map((rec, index) => (
                  <li key={index} className="text-[12.5px]">
                    <span className="font-semibold">{rec.headline ?? rec.title}</span>
                    {rec.rationale && <span className="beyu-muted"> — {rec.rationale}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.whatIsMissing && data.whatIsMissing.length > 0 && (
            <div>
              <div className="beyu-kicker beyu-muted">WHAT IS MISSING</div>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-[12px] beyu-muted">
                {data.whatIsMissing.slice(0, 10).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {data.limitations && data.limitations.length > 0 && (
            <div>
              <div className="beyu-kicker beyu-muted">LIMITATIONS</div>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-[12px] beyu-muted">
                {data.limitations.slice(0, 10).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
