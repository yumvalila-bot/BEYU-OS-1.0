/**
 * BEYU OS — P4 Release Control Architecture Tests (DB-free pins)
 *
 * Pins the P4 architecture against regression and drift:
 *  - the transitions API persists through the store (no in-memory history)
 *  - the four-eyes approval gate is enforced in the API path
 *  - PVG runs are persisted evidence
 *  - the pipeline runs a PVG job that blocks on failure (fail-closed)
 *  - approval ≠ authorization (approvals live beside, never instead of, RBAC)
 *  - the 0047 migration is additive (no destructive statements)
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { requiresApproval } from "@/lib/release/approvals";

const ROOT = process.cwd();

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("P4 release control architecture", () => {
  it("transitions API persists through the release store (no in-memory history)", () => {
    const route = readRepo("src/app/api/v1/system/release/transitions/route.ts");
    expect(route).toContain("appendTransitionRecord");
    expect(route).toContain("getTransitionHistory");
    expect(route).not.toContain("inMemoryHistory");
  });

  it("the transitions API enforces the four-eyes approval gate", () => {
    const route = readRepo("src/app/api/v1/system/release/transitions/route.ts");
    expect(route).toContain("evaluateApproval");
    expect(route).toContain("APPROVAL_REQUIRED");
  });

  it("PVG API persists every run as evidence", () => {
    const route = readRepo("src/app/api/v1/system/release/pvg/route.ts");
    expect(route).toContain("recordPvgRun");
    expect(route).toContain("probeLiveMigrationState");
  });

  it("PVG live probes fail closed — no hard-coded PASS of migration counts", () => {
    const route = readRepo("src/app/api/v1/system/release/pvg/route.ts");
    // The P3 route hard-coded migrationCount: 47 / latestMigration:
    // "0046_release_governance". P4 must probe, not assert.
    expect(route).not.toContain("migrationCount: 47");
    expect(route).not.toContain('"0046_release_governance"');
  });

  it("the pipeline runs a PVG job after deploy that blocks on failure", () => {
    const workflow = readRepo(join(".github", "workflows", "db-release.yml"));
    expect(workflow).toContain("Production Verification Gate (PVG)");
    expect(workflow).toContain("scripts/release/pvg-cli.ts");
    expect(workflow).toContain("--persist");
    expect(workflow).toMatch(/pvg:[\s\S]*needs: \[deploy, runtime-verify, preflight-repo\]/);
  });

  it("approvals are evidence, not authorization: RBAC remains on every route", () => {
    for (const route of [
      "src/app/api/v1/system/release/approvals/route.ts",
      "src/app/api/v1/system/release/transitions/route.ts",
    ]) {
      const src = readRepo(route);
      expect(src).toContain('permission: "platform:config.manage"');
      expect(src).toContain("recordAudit");
    }
  });

  it("migration 0047 is additive — no destructive statements", async () => {
    const { scanDestructive, readMigrationFiles } = await import("@/lib/migration/integrity");
    const migs = readMigrationFiles(join(ROOT, "drizzle"));
    const m47 = migs.find((m) => m.seq === "0047");
    expect(m47).toBeDefined();
    const hits = scanDestructive(m47!.sql);
    expect(hits).toEqual([]);
  });

  it("0047 is registered in the known metadata debt register (not silent)", async () => {
    const { KNOWN_METADATA_DEBT } = await import("@/lib/migration/integrity");
    expect(KNOWN_METADATA_DEBT.missingJournal).not.toContain("0047_release_approvals");
    expect(readFileSync("drizzle/meta/_journal.json", "utf8")).toContain("0047_release_approvals");
    expect(KNOWN_METADATA_DEBT.missingSnapshot).toContain("0047");
  });

  it("controlled states stay exactly PROMOTED/SWITCHED/CONTRACTED", () => {
    expect(requiresApproval("PROMOTED")).toBe(true);
    expect(requiresApproval("SWITCHED")).toBe(true);
    expect(requiresApproval("CONTRACTED")).toBe(true);
    expect(requiresApproval("VERIFIED")).toBe(false);
  });

  it("the PVG CLI persists ledger transitions with deterministic ids", () => {
    const cli = readRepo(join("scripts", "release", "pvg-cli.ts"));
    expect(cli).toContain("fixedId(");
    expect(cli).toContain("appendTransitionRecord");
    expect(cli).toContain("PVG_VERIFIED");
  });

  it("the release contract documents the approval gate", () => {
    const docPath = join("docs", "architecture", "RELEASE_APPROVALS.md");
    expect(existsSync(join(ROOT, docPath))).toBe(true);
    const doc = readRepo(docPath);
    expect(doc).toContain("four-eyes");
    expect(doc).toContain("never grants authorization");
  });
});
