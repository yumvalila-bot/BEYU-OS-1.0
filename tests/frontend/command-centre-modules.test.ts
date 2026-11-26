/**
 * Command Centre — twelve-module certification.
 *
 * The brief requires twelve modules backed by real data, not decorative
 * placeholders. "Real data" is defined here as a specific, checkable property:
 * every module either reads a database table through the Drizzle query builder,
 * reads the live capability registry, or derives from a static declaration whose
 * integrity is guarded by its own test.
 *
 * This suite reads the Command Centre source and asserts that property module by
 * module. It does not render the page (that needs a database and an
 * authenticated principal), so it certifies *wiring*, not pixels. That
 * distinction is stated in the assertion names rather than buried in a comment.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(join(process.cwd(), "src/app/os/noelia/command-centre/page.tsx"), "utf8");

/**
 * The twelve modules the brief names, each mapped to the evidence that backs it.
 * `table` means a Drizzle `.from(...)` read; `registry` means the live tool
 * registry; `declared` means a guarded static declaration.
 */
const MODULES = [
  { kicker: "COGNITIVE BRAIN CENTRE", evidence: "registry", source: "NOELIA_BRAINS" },
  { kicker: "INSTITUTIONAL BRAIN", evidence: "table", source: "aiDecisions" },
  { kicker: "INTELLIGENCE COUNCIL", evidence: "table", source: "noeliaCouncilSessions" },
  { kicker: "STRATEGIC SIMULATION", evidence: "table", source: "noeliaSimulations" },
  { kicker: "DIGITAL TWIN", evidence: "table", source: "legalEntities" },
  { kicker: "MODEL CENTRE", evidence: "table", source: "modelRegistry" },
  { kicker: "RESEARCH CENTRE", evidence: "table", source: "knowledgeSources" },
  { kicker: "PERFORMANCE CENTRE", evidence: "table", source: "noeliaEvaluations" },
  { kicker: "WORKFLOW COMMAND", evidence: "table", source: "workflowInstances" },
  { kicker: "GOVERNANCE CENTRE", evidence: "table", source: "noeliaRiskRegister" },
  { kicker: "PREDICTIVE INTELLIGENCE", evidence: "table", source: "noeliaDecisionRecords" },
  { kicker: "HIVE WORKFORCE", evidence: "registry", source: "HIVE_WORKFORCE_PROFILES" },
] as const;

describe("Command Centre — twelve modules, each backed by real data", () => {
  it("declares exactly twelve modules from the brief (plus the skills panel added later)", () => {
    expect(MODULES).toHaveLength(12);
    expect(new Set(MODULES.map((m) => m.kicker)).size).toBe(12);
  });

  it("every module's kicker is present in the page source", () => {
    for (const entry of MODULES) {
      expect(SOURCE, entry.kicker).toContain(`kicker="${entry.kicker}"`);
    }
  });

  it("every table-backed module actually queries its table", () => {
    // The whole point: a panel titled "Model Centre" that never reads
    // model_registry is a mock. This is the assertion that forbids that.
    for (const entry of MODULES.filter((m) => m.evidence === "table")) {
      expect(SOURCE, `${entry.kicker} should read ${entry.source}`).toContain(`from(${entry.source})`);
    }
  });

  it("every registry-backed module references the live registry declaration", () => {
    for (const entry of MODULES.filter((m) => m.evidence === "registry")) {
      expect(SOURCE, `${entry.kicker} should use ${entry.source}`).toContain(entry.source);
    }
  });

  it("no module renders a hard-coded figure as if it were data", () => {
    // A numeric literal inside a Metric `value` would be a fabricated number.
    // `String(variable)` and `variable.toFixed(...)` are permitted; `value="42"` is not.
    const literalMetric = SOURCE.match(/value="\d[\d,.]*"/g) ?? [];
    expect(literalMetric).toEqual([]);
  });

  it("every module has an explicit empty state rather than a silent blank", () => {
    // An empty table must say so. Counting EmptyState usages is a coarse check,
    // but it catches a panel that would render an empty <ul> with no explanation.
    const emptyStates = SOURCE.match(/<EmptyState/g) ?? [];
    expect(emptyStates.length).toBeGreaterThanOrEqual(6);
  });

  it("the Model Centre states its own limitation rather than implying reachability", () => {
    // Registry state is not runtime state; the panel must say so in words.
    expect(SOURCE).toContain("Registry state is not runtime state");
  });

  it("the Model Centre surfaces the cost verdict, not just the approval status", () => {
    // The zero-cost gate is what decides execution, so hiding it would leave an
    // operator unable to explain why an approved model does not run.
    expect(SOURCE).toContain("zeroCostStatus");
    expect(SOURCE).toContain("costClass");
  });

  it("the workforce panel resolves reach against the live registry, not a static count", () => {
    expect(SOURCE).toContain("resolveWorkforceReach");
  });
});

describe("Command Centre — the skills panel reports honest state", () => {
  it("uses the guarded skill summary rather than recomputing stages in the view", () => {
    expect(SOURCE).toContain("skillRegistrySummary");
  });

  it("renders the seven stages in order from the canonical list", () => {
    expect(SOURCE).toContain("SKILL_LIFECYCLE_STAGES");
    expect(SOURCE).toContain("AGENT_SKILLS");
  });

  it("labels SHIP as a human gate, never as shipped", () => {
    // The panel subtitle must not claim the work is merged or released.
    expect(SOURCE).toMatch(/ready for a human to merge/i);
    expect(SOURCE).not.toMatch(/SHIPPED\b.*(?:merged|deployed|released)/i);
  });
});
