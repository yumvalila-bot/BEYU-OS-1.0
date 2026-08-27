/**
 * T-18 — documentation validation tests (purely architectural; permitted
 * without implementation authorization).
 *
 * Validates that the Phase 3A specification, the ratification gates, and this
 * phase's engineering allowlist remain internally consistent and that no
 * policy value has silently filled a configuration slot.
 * Pure; no database.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const spec = read("../../../docs/architecture/phase-3-family-institution-technical-architecture-specification.md");
const allowlist = read("../../../docs/architecture/phase-3-ratified-implementation-allowlist.md");
const denylist = read("../../../docs/architecture/phase-3-unratified-denylist.md");
const readinessGate = read("../../../docs/architecture/phase-3-readiness-gate.md");
const engineering = read("../../../docs/architecture/phase-3-ratified-engineering-allowlist.md");

describe("Phase 3A specification completeness", () => {
  it("has all 46 required sections", () => {
    for (let i = 1; i <= 46; i += 1) {
      expect(spec, `section ${i}`).toMatch(new RegExp(`^## ${i}\\. `, "m"));
    }
  });

  it("represents all 27 FIR decisions with the six required fields each", () => {
    const section472 = spec.slice(spec.indexOf("### 47.2"), spec.indexOf("### 47.3"));
    expect(section472.length).toBeGreaterThan(0);
    const labels = [
      "Architecture component affected",
      "Technical mechanism required",
      "Policy value required",
      "Current ratification status",
      "Can architecture proceed without the decision",
      "Can implementation proceed without the decision",
    ];
    for (const label of labels) {
      const count = section472.split(label).length - 1;
      expect(count, label).toBe(27);
    }
    for (let i = 1; i <= 27; i += 1) {
      const id = `FIR-0${String(i).padStart(2, "0")}`;
      expect(section472, id).toContain(`#### ${id} —`);
    }
  });

  it("keeps implementation-proceeds at NONE (no 'Yes' implementation answers)", () => {
    const section472 = spec.slice(spec.indexOf("### 47.2"), spec.indexOf("### 47.3"));
    expect(section472).not.toMatch(/\*\* Can implementation proceed without the decision\?\*\* Yes/);
    expect(section472).not.toContain("** Yes — implementation");
  });

  it("carries the final status lines", () => {
    expect(spec).toContain("PHASE 3A ARCHITECTURE STATUS:\nREADY");
    expect(spec).toContain("PHASE 3 IMPLEMENTATION STATUS:\nNOT AUTHORIZED");
  });

  it("keeps every configuration point un-filled (no invented policy values)", () => {
    const cfgLines = spec.split("\n").filter((line) => line.startsWith("| CFG-"));
    expect(cfgLines.length).toBeGreaterThanOrEqual(40);
    for (const line of cfgLines) {
      expect(line, line.slice(0, 40)).toContain("POLICY DECISION REQUIRED");
    }
  });

  it("marks all draft endpoints and permissions as design-only / proposed", () => {
    expect(spec).toContain("DESIGN ONLY — NOT IMPLEMENTATION AUTHORIZED");
    expect(spec).toContain("PROPOSED — NOT AUTHORIZED");
  });
});

describe("ratification gates remain closed", () => {
  it("the implementation allowlist is still intentionally empty", () => {
    expect(allowlist).toContain("NO IMPLEMENTATION AUTHORIZED");
    expect(allowlist).toContain("## Explicit allowlist");
    expect(allowlist).toContain("**None.**");
  });

  it("the denylist still denies the 24 unratified decisions", () => {
    const rows = denylist.split("\n").filter((line) => /^\| FIR-\d{3} /.test(line));
    expect(rows).toHaveLength(24);
  });

  it("the readiness gate verdict is unchanged", () => {
    expect(readinessGate).toContain("PHASE 3 NOT READY — POLICY RATIFICATION REQUIRED");
  });
});

describe("engineering allowlist matrix integrity", () => {
  it("has one row per FIR (27 rows)", () => {
    const rows = engineering.split("\n").filter((line) => /^\| FIR-\d{3} /.test(line));
    expect(rows).toHaveLength(27);
    for (let i = 1; i <= 27; i += 1) {
      const id = `FIR-0${String(i).padStart(2, "0")}`;
      expect(rows.some((r) => r.startsWith(`| ${id} `)), id).toBe(true);
    }
  });

  it("authorizes no business functionality", () => {
    expect(engineering).toContain("no business functionality");
  });

  it("keeps migration 0018 untouched", () => {
    expect(engineering).toContain("Migration 0018 remains untouched");
  });

  it("declares no permissions created and no API routes created", () => {
    expect(engineering).toContain("No permissions are added or changed.");
    expect(engineering).toContain("No production API routes are created.");
  });
});
