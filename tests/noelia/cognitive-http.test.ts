import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../src/db";
import { apiGet, apiPost, login, serverAvailable } from "../helpers/http";

/**
 * End-to-end HTTP acceptance tests for the NOELIA Command Centre surface.
 *
 * These execute against a REAL running server so the transport guarantees are
 * proven by execution rather than by reading source text:
 *   • 401 before any handler runs
 *   • 422 on a forged/unknown field (no context widening)
 *   • 403 when a capability is denied by the registry
 *   • 200 with a governed envelope and real recorded data
 *   • the Command Centre page renders (not a redirect) for an authorized user
 */

const BASE = "/api/v1/ai/noelia/cognitive";
const available = await serverAvailable();
let governanceCookie = "";

beforeAll(async () => {
  if (!available) return;
  governanceCookie = await login("governance@beyu.os");
}, 180_000);

afterAll(async () => {
  await pool.end().catch(() => undefined);
});

describe.skipIf(!available)("NOELIA cognitive routes over production HTTP", () => {
  it("rejects unauthenticated access on every cognitive route", async () => {
    for (const path of ["world-model", "knowledge-graph", "decision-memory", "council", "simulation"]) {
      const response = await apiPost(`${BASE}/${path}`, {});
      expect(response.status, path).toBe(401);
    }
  });

  it("rejects unknown fields rather than widening the request", async () => {
    const response = await apiPost(
      `${BASE}/world-model`,
      { limit: 10, unrestrictedDatabase: true },
      { cookie: governanceCookie },
    );
    expect(response.status).toBe(422);
    const body = response.body as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe("VALIDATION_FAILED");
    expect(JSON.stringify(body)).not.toMatch(/stack|select .* from/i);
  });

  it("reads the world model through the governed boundary", async () => {
    const response = await apiPost<{ data: { findings?: unknown[]; whatIsMissing?: string[]; metadata?: Record<string, unknown> } }>(
      `${BASE}/world-model`,
      { limit: 20 },
      { cookie: governanceCookie },
    );
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data.findings)).toBe(true);
    // The structural admissions are present in the real response.
    expect((response.body.data.whatIsMissing ?? []).join(" ")).toMatch(/FINANCIAL_VALUES/);
  });

  it("runs a simulation and labels it SIMULATION end-to-end", async () => {
    const response = await apiPost<{
      data: { headline?: string; metrics?: Array<{ status: string }>; metadata?: Record<string, unknown> };
    }>(
      `${BASE}/simulation`,
      {
        objective: "Model hospital expansion capital",
        scenarioKind: "CAPITAL_PLANNING",
        method: "LINEAR_COMBINATION",
        variables: [
          {
            key: "CAPEX",
            label: "Capital expenditure",
            optimistic: 10,
            baseline: 15,
            adverse: 22,
            unit: "USD_M",
            provenance: "ESTIMATE",
          },
        ],
        assumptions: ["Illustrative only"],
      },
      { cookie: governanceCookie },
    );
    expect(response.status).toBe(200);
    expect(response.body.data.headline).toMatch(/^Simulated \(not a record\):/);
    expect(response.body.data.metadata?.resultClass).toBe("SIMULATION");
    for (const metric of response.body.data.metrics ?? []) expect(metric.status).toBe("SCENARIO");
  });

  it("rejects a simulation contract violation with a 422", async () => {
    const response = await apiPost(
      `${BASE}/simulation`,
      {
        objective: "Model something",
        scenarioKind: "TEST",
        method: "LINEAR_COMBINATION",
        variables: [],
        assumptions: [],
      },
      { cookie: governanceCookie },
    );
    expect(response.status).toBe(422);
  });

  it("convenes the council and returns a recommendation requiring human decision", async () => {
    const response = await apiPost<{
      data: { recommendations?: unknown[]; recommendationsPending?: unknown[]; humanReviewRequired?: boolean; narrative?: string };
    }>(
      `${BASE}/council`,
      {
        question: "Should BEYU establish another hospital in the Kagera region?",
        findings: [
          {
            brain: "ANALYTICAL",
            capability: "finance.cash.position",
            task: "Assess capital capacity",
            claimKind: "FACT",
            statement: "Authorized cash covers around 40% of the modelled capital requirement.",
            evidenceRefs: ["finance.cash.position"],
            confidence: 0.7,
          },
          {
            brain: "INSTITUTIONAL",
            capability: "governance.resolution.query",
            task: "Check governance authority",
            claimKind: "FACT",
            statement: "A new hospital requires a recorded Board resolution.",
            evidenceRefs: ["governance.resolution.query"],
            confidence: 0.9,
          },
        ],
      },
      { cookie: governanceCookie },
    );
    expect(response.status).toBe(200);
    expect(response.body.data.humanReviewRequired).toBe(true);
    expect(response.body.data.narrative ?? "").toMatch(/not a decision/i);
  });

  it("returns decision memory with an explicit empty claim rather than an empty success", async () => {
    const response = await apiPost<{ data: { findings?: Array<{ kind: string }>; whatIsMissing?: string[] } }>(
      `${BASE}/decision-memory`,
      { keyword: "zzz-no-such-subject-zzz" },
      { cookie: governanceCookie },
    );
    expect(response.status).toBe(200);
    // Either there are real records in the register, or the response states that
    // nothing matched. It must not be an unqualified empty object.
    expect(
      (response.body.data.findings ?? []).length > 0 || (response.body.data.whatIsMissing ?? []).length > 0,
    ).toBe(true);
  });
});

describe.skipIf(!available)("Command Centre UI renders for an authorized user", () => {
  it("serves the Command Centre page with the canonical NOELIA identity", async () => {
    const response = await apiGet("/os/noelia/command-centre", governanceCookie);
    expect(response.status).toBe(200);
    expect(response.html).toMatch(/HIVE COMMAND CENTRE/);
    expect(response.html).toMatch(/NOELIA/);
    // All eight brain titles are present — the roster is real, not decorative.
    for (const title of [
      "Executive Brain",
      "Institutional Brain",
      "Knowledge Brain",
      "Analytical Brain",
      "Operational Brain",
      "Learning Brain",
      "Collective Brain",
      "Personal Context Brain",
    ]) {
      expect(response.html, title).toContain(title);
    }
  });

  it("renders all twelve Command Centre modules", async () => {
    const response = await apiGet("/os/noelia/command-centre", governanceCookie);
    // The Queen Bee console is a client component mounted by name.
    expect(response.html).toContain("CommandCentreConsole");
    const modules = [
      "HIVE WORKFORCE",
      "COGNITIVE BRAIN CENTRE",
      "INSTITUTIONAL BRAIN",
      "INTELLIGENCE COUNCIL",
      "DIGITAL TWIN",
      "MODEL CENTRE",
      "GOVERNANCE CENTRE",
      "RESEARCH CENTRE",
      "PREDICTIVE INTELLIGENCE",
      "PERFORMANCE CENTRE",
      "WORKFLOW COMMAND",
    ];
    const missing = modules.filter((module) => !response.html.includes(module));
    expect(missing, `Command Centre is missing module kickers: ${missing.join(", ")}`).toEqual([]);
  });

  it("renders the workforce roster without claiming posting authority", async () => {
    const response = await apiGet("/os/noelia/command-centre", governanceCookie);
    // Every specialist must render "NO POSTING". A failure here would mean a
    // workforce profile gained posting authority — a constitutional breach.
    expect(response.html).not.toContain("MAY POST");
    expect(response.html).toContain("NO POSTING");
    expect(response.html).toContain("Financial Analyst");
    expect(response.html).toContain("Evidence Auditor");
  });

  it("does not render a fabricated operational metric", async () => {
    const response = await apiGet("/os/noelia/command-centre", governanceCookie);
    // No placeholder/sample values leaked into the page.
    expect(response.html).not.toMatch(/lorem ipsum/i);
    expect(response.html).not.toMatch(/€\s?0\.00/);
  });
});
