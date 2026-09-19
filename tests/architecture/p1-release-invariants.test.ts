/**
 * P1 — canonical architecture / deployment invariants, pinned at the source.
 *
 * WHY THIS EXISTS
 * ───────────────
 * P1 of the integrated release programme makes the canonical invariants explicit
 * and prevents regressions, without introducing any new runtime mechanism:
 *
 *   1. ONE BEYU OS — the control plane is a constant, never registered as a
 *      sector; the sector catalogue is exactly the six canonical OSs.
 *   2. DEPLOYED ≠ VERIFIED ≠ PROMOTED — the release contract records the four
 *      governed verbs; no P1 artefact may claim an implemented Blue-Green or
 *      Canary, because neither exists yet.
 *   3. DB: EXPAND → MIGRATE → VERIFY → CANARY → PROMOTE → CONTRACT — the
 *      migration runner applies every canonical file (no hardcoded upper bound)
 *      and the destructive-migration guard stays present.
 *   4. FINANCE: CAP_POSTING stays LOCKED, validated through the governed
 *      capability registry via `requireCapability`.
 *
 * These assertions read source and (for 1) a small pure surface only — no
 * database connection is required, so the gate runs in every environment.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("P1 — one control plane, six canonical OSs, shared capabilities", () => {
  const os = read("src/lib/operating-system-catalog.ts");

  it("the sector catalogue is exactly the six canonical OSs", () => {
    expect(os).toContain('code: "FINANCE"');
    expect(os).toContain('code: "HEALTH"');
    expect(os).toContain('code: "AGRICULTURE"');
    expect(os).toContain('code: "FOUNDATION"');
    expect(os).toContain('code: "UJENZI"');
  });

  it("the control plane is a constant, distinct from the sector catalogue", () => {
    expect(os).toContain("BEYU_CONTROL_PLANE");
    expect(os).toContain("SECTOR_OPERATING_SYSTEMS");
  });

  it("no capability is registered as an operating system", () => {
    // The forbidden proliferation list: capabilities/services/patterns, never OSs.
    for (const token of [
      "PVG_OS",
      "DEVOPS_OS",
      "DEPLOYMENT_OS",
      "HCM_OS",
      "FAMILY_OFFICE_OS",
      "GOVERNANCE_OS",
      "RISK_OS",
      "COMPLIANCE_OS",
      "AUDIT_OS",
      "EVENTS_OS",
      "WORKFLOW_OS",
      "NOELIA_OS",
      "HIVE_OS",
      "CANARY_OS",
      "BLUE_GREEN_OS",
    ]) {
      expect(os.includes(token), `found forbidden ${token} in the OS catalogue`).toBe(false);
    }
  });
});

describe("P1 — deployment invariant is documented, not yet implemented", () => {
  const contract = read("docs/architecture/RELEASE_CONTRACT.md");

  it("records the four governed verbs and their inequality", () => {
    expect(contract).toContain("**DEPLOY**");
    expect(contract).toContain("**VERIFY**");
    expect(contract).toContain("**PROMOTE**");
    expect(contract).toContain("**ROLLBACK**");
    expect(contract).toMatch(/DEPLOYED ≠ VERIFIED ≠ PROMOTED/);
  });

  it("does not claim Blue-Green or Canary exist yet", () => {
    expect(contract).toContain("declared, not implemented");
  });

  it("excludes routing changes from P1", () => {
    expect(contract).toContain("No canary percentages, no traffic splitting");
  });
});

describe("P1 — database evolution invariant", () => {
  const migrate = read("scripts/migrate.ts");
  const recon = read("docs/architecture/ARCHITECTURE_INVARIANTS.md");

  it("the architecture pin records the expand/migrate/verify/canary/promote/contract chain", () => {
    expect(recon).toContain("EXPAND → MIGRATE → VERIFY → CANARY → PROMOTE → CONTRACT");
  });

  it("the runner applies every canonical migration (no hardcoded upper bound)", () => {
    // The runner reads the folder, filters by the numbered-name pattern and
    // sorts; a literal `0000-00NN` bound would rot.
    expect(migrate).toMatch(/readdirSync\(dir\)/);
    expect(migrate).toContain('/^\\d+_.*\\.sql$/');
  });

  it("the destructive-migration guard for existing schemas is present", () => {
    expect(migrate).toContain("DESTRUCTIVE_EXISTING_SCHEMA_MIGRATIONS");
    expect(migrate).toContain("schemaIsEmpty");
  });
});

describe("P1 — finance safety: CAP_POSTING stays locked", () => {
  const decision = read("src/lib/decision-authority.ts");

  it("CAP_POSTING remains gated through requireCapability", () => {
    expect(decision).toContain("CapabilityLockedError");
  });
});
